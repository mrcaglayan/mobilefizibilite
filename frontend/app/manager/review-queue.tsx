import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ManagerReviewQueueEntry, api } from "@/src/api/client";
import { can } from "@/src/auth/permissions";
import { useAuth } from "@/src/auth/AuthContext";
import { alpha, font, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BottomSheet } from "@/src/ui/BottomSheet";
import {
  Button,
  Chip,
  EmptyStateCard,
  GradientHeroCard,
  Input,
  ProgressBar,
  ScreenScaffold,
  SectionHeader,
  StatusPill,
  StatusTone,
} from "@/src/ui/components";

const WORK_ID_LABELS: Record<string, string> = {
  temel_bilgiler: "Temel Bilgiler",
  kapasite: "Kapasite",
  "norm.ders_dagilimi": "Norm",
  "ik.local_staff": "İK",
  "gelirler.unit_fee": "Gelirler",
  "giderler.isletme": "Giderler",
};

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "in_review", label: "İncelemede" },
  { key: "revision", label: "Revizyon" },
  { key: "approved", label: "Kontrol Edildi" },
  { key: "ready", label: "Hazır" },
  { key: "sent", label: "Merkeze İletildi" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

type ReviewAction = {
  schoolId: string;
  scenarioId: string;
  workId: string;
  action: "approve" | "revise";
  label: string;
};

function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.replace("/schools");
}

function requiredTotal(entry: ManagerReviewQueueEntry) {
  const total = Number(entry.totalRequired);
  if (Number.isFinite(total) && total > 0) return total;
  if (Array.isArray(entry.requiredItems)) return entry.requiredItems.length;
  return 0;
}

function approvedCount(entry: ManagerReviewQueueEntry) {
  const count = Number(entry.approvedCount);
  if (Number.isFinite(count) && count >= 0) return count;
  return (entry.requiredItems || []).filter((row) => row.item?.state === "approved").length;
}

function statusMeta(status?: string | null, sentAt?: string | null): { label: string; tone: StatusTone } {
  switch (status) {
    case "revision_requested":
      return { label: "Revize istendi", tone: "revision" };
    case "sent_for_approval":
      return { label: "Merkeze iletildi", tone: "review" };
    case "approved":
      return sentAt ? { label: "Onaylandı", tone: "complete" } : { label: "Kontrol edildi", tone: "success" };
    case "in_review":
    case "submitted":
      return { label: "İncelemede", tone: "review" };
    default:
      return { label: "Taslak", tone: "muted" };
  }
}

function workStateMeta(state?: string | null): { label: string; tone: StatusTone; icon: keyof typeof Ionicons.glyphMap } {
  switch (state) {
    case "approved":
      return { label: "Kontrol edildi", tone: "success", icon: "checkmark-circle-outline" };
    case "needs_revision":
      return { label: "Revize istendi", tone: "warning", icon: "refresh-circle-outline" };
    case "submitted":
      return { label: "İncelemede", tone: "review", icon: "time-outline" };
    case "in_progress":
      return { label: "Hazırlanıyor", tone: "warning", icon: "create-outline" };
    default:
      return { label: "Başlanmadı", tone: "muted", icon: "ellipse-outline" };
  }
}

function matchesFilter(entry: ManagerReviewQueueEntry, filter: FilterKey) {
  const status = entry.scenario?.status || "draft";
  const sentAt = entry.scenario?.sent_at || null;
  const total = requiredTotal(entry);
  const approved = approvedCount(entry);
  const allApproved = total > 0 && approved >= total;
  const managerApproved = status === "approved" && !sentAt;
  switch (filter) {
    case "ready":
      return managerApproved && allApproved;
    case "in_review":
      return status === "in_review" || status === "submitted";
    case "revision":
      return status === "revision_requested";
    case "approved":
      return managerApproved;
    case "sent":
      return status === "sent_for_approval";
    case "all":
    default:
      return true;
  }
}

function toneAccent(colors: ReturnType<typeof useAppTheme>["colors"], tone: StatusTone) {
  if (tone === "success" || tone === "complete") return colors.success;
  if (tone === "warning" || tone === "revision") return colors.warn;
  if (tone === "danger") return colors.danger;
  if (tone === "accent") return colors.accent;
  if (tone === "review" || tone === "primary" || tone === "info") return colors.primary;
  return colors.textMuted;
}

export default function ManagerReviewQueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { user } = useAuth();
  const canView =
    user?.role === "manager" ||
    user?.role === "accountant" ||
    (user?.role !== "admin" &&
      (can(user, "page.manage_permissions", "read", { countryId: user?.country_id ?? null }) ||
        can(user, "page.manage_permissions", "write", { countryId: user?.country_id ?? null })));

  const [rows, setRows] = useState<ManagerReviewQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [revisionNote, setRevisionNote] = useState("");

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setErr("");
    try {
      const queue = await api.managerGetReviewQueue();
      setRows(queue);
    } catch (error: any) {
      setErr(error?.message || "İnceleme kuyruğu yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const base: Record<string, number> = {};
    FILTERS.forEach((item) => {
      base[item.key] = item.key === "all" ? rows.length : rows.filter((row) => matchesFilter(row, item.key)).length;
    });
    return base;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => matchesFilter(row, filter));
  }, [filter, rows]);

  const submittedCount = rows.filter((row) =>
    (row.requiredItems || []).some((item) => item.item?.state === "submitted"),
  ).length;
  const readyCount = rows.filter((row) => matchesFilter(row, "ready")).length;

  function openScenario(entry: ManagerReviewQueueEntry, workId?: string) {
    router.push({
      pathname: "/scenario/[schoolId]/[scenarioId]",
      params: {
        schoolId: String(entry.school.id),
        scenarioId: String(entry.scenario.id),
        ...(workId ? { tab: workId } : {}),
      },
    });
  }

  async function submitReview(action: ReviewAction) {
    setActionBusy(true);
    setErr("");
    setMessage("");
    try {
      const body =
        action.action === "approve"
          ? { action: "approve" }
          : { action: "revise", comment: revisionNote.trim() || undefined };
      await api.reviewWorkItem(action.schoolId, action.scenarioId, action.workId, body);
      await load();
      setReviewAction(null);
      setRevisionNote("");
      setMessage(action.action === "approve" ? "Modül kontrol edildi." : "Revizyon istendi.");
    } catch (error: any) {
      setErr(error?.message || "İşlem tamamlanamadı.");
    } finally {
      setActionBusy(false);
    }
  }

  if (!canView) {
    return (
      <ScreenScaffold testID="manager-review-queue-denied">
        <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={12}
            style={[styles.backBtn, { backgroundColor: colors.bgElev, borderColor: colors.border }, !isDark && shadow.soft]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerLabel, { color: colors.textMuted }]}>Müdür Yönetimi</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Yetki Yok</Text>
          </View>
        </View>
        <View style={{ padding: spacing.lg }}>
          <EmptyStateCard
            icon="lock-closed-outline"
            title="Bu ekran için yetki gerekir"
            subtitle="Manager/accountant rolü veya page.manage_permissions okuma yetkisi gerekiyor."
          />
        </View>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold testID="manager-review-queue-screen">
      <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => goBack(router)}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: colors.bgElev, borderColor: colors.border }, !isDark && shadow.soft]}
          testID="manager-review-queue-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerLabel, { color: colors.textMuted }]}>Müdür Yönetimi</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>İnceleme Kuyruğu</Text>
        </View>
        <Pressable
          onPress={() => {
            setRefreshing(true);
            load();
          }}
          hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: colors.bgElev, borderColor: colors.border }, !isDark && shadow.soft]}
          testID="manager-review-queue-refresh"
        >
          <Ionicons name="refresh-outline" size={19} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(entry) => String(entry.scenario.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <GradientHeroCard
                icon="checkmark-done-outline"
                eyebrow="Kontrol merkezi"
                title={`${rows.length} senaryo incelemede`}
                subtitle="Okullardan gelen modülleri kontrol edin, revizyon isteyin veya senaryoyu açın."
                metricValue={String(submittedCount)}
                metricLabel="aksiyon bekleyen"
                progress={rows.length ? Math.round((readyCount / rows.length) * 100) : 0}
                footer={
                  <Text style={styles.heroFooterText}>
                    {readyCount ? `${readyCount} senaryo merkeze iletilmeye hazır.` : "Hazır senaryo bulunmuyor."}
                  </Text>
                }
              />

              {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
              {message ? <Notice icon="information-circle-outline" color={colors.primary} text={message} /> : null}

              <SectionHeader title="Filtreler" subtitle="Duruma göre inceleme kuyruğu" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {FILTERS.map((item) => (
                  <Chip
                    key={item.key}
                    label={`${item.label} ${counts[item.key] || 0}`}
                    active={filter === item.key}
                    onPress={() => setFilter(item.key)}
                  />
                ))}
              </ScrollView>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120, gap: spacing.md }}
          ListEmptyComponent={
            <EmptyStateCard
              icon="checkmark-done-outline"
              title="İnceleme kaydı yok"
              subtitle="Bu filtrede kontrol bekleyen senaryo bulunmuyor."
            />
          }
          renderItem={({ item }) => (
            <ReviewCard
              entry={item}
              onOpen={() => openScenario(item)}
              onOpenModule={(workId) => openScenario(item, workId)}
              onApprove={(workId, label) => {
                setReviewAction({
                  schoolId: String(item.school.id),
                  scenarioId: String(item.scenario.id),
                  workId,
                  action: "approve",
                  label,
                });
              }}
              onRevise={(workId, label) => {
                setRevisionNote("");
                setReviewAction({
                  schoolId: String(item.school.id),
                  scenarioId: String(item.scenario.id),
                  workId,
                  action: "revise",
                  label,
                });
              }}
            />
          )}
        />
      )}

      <BottomSheet
        visible={Boolean(reviewAction)}
        onClose={() => {
          if (!actionBusy) setReviewAction(null);
        }}
        title={reviewAction?.action === "approve" ? "Modülü Kontrol Et" : "Revizyon İste"}
        testID="manager-review-action-sheet"
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{reviewAction?.label || "-"}</Text>
          {reviewAction?.action === "revise" ? (
            <Input
              label="Revizyon notu"
              value={revisionNote}
              onChangeText={setRevisionNote}
              multiline
              placeholder="Eksik veya düzeltilmesi gereken alanları yazın..."
              testID="manager-review-revision-note"
            />
          ) : (
            <Text style={[styles.sheetSub, { color: colors.textDim }]}>
              Bu modül kontrol edildi olarak işaretlenecek.
            </Text>
          )}
          <Button
            label={reviewAction?.action === "approve" ? "Onayla" : "Revizyon İste"}
            icon={reviewAction?.action === "approve" ? "checkmark-circle-outline" : "refresh-circle-outline"}
            variant={reviewAction?.action === "approve" ? "primary" : "danger"}
            loading={actionBusy}
            disabled={!reviewAction}
            onPress={() => {
              if (reviewAction) submitReview(reviewAction);
            }}
            testID="manager-review-action-submit"
          />
        </View>
      </BottomSheet>
    </ScreenScaffold>
  );
}

function ReviewCard({
  entry,
  onOpen,
  onOpenModule,
  onApprove,
  onRevise,
}: {
  entry: ManagerReviewQueueEntry;
  onOpen: () => void;
  onOpenModule: (workId: string) => void;
  onApprove: (workId: string, label: string) => void;
  onRevise: (workId: string, label: string) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const total = requiredTotal(entry);
  const approved = approvedCount(entry);
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
  const meta = statusMeta(entry.scenario.status, entry.scenario.sent_at);
  const accent = toneAccent(colors, meta.tone);
  const submitted = (entry.requiredItems || []).filter((row) => row.item?.state === "submitted").length;
  const explanation = submitted
    ? `${submitted} modül kontrol bekliyor.`
    : total > 0
      ? `${approved}/${total} modül kontrol edildi.`
      : "Bu senaryo için zorunlu modül bilgisi bulunmuyor.";

  return (
    <View
      testID={`manager-review-card-${entry.scenario.id}`}
      style={[
        styles.rewardCard,
        { backgroundColor: colors.bgElev, borderColor: colors.border },
        !isDark && shadow.card,
      ]}
    >
      <View style={styles.rewardBody}>
        <View style={styles.cardTop}>
          <View style={[styles.cardIcon, { backgroundColor: alpha(accent, 0.12) }]}>
            <Ionicons name="clipboard-outline" size={24} color={accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
              {entry.scenario.name}
            </Text>
            <Text style={[styles.cardSub, { color: colors.textDim }]} numberOfLines={1}>
              {entry.school.name} • {entry.scenario.academic_year || "-"}
            </Text>
          </View>
          <StatusPill label={meta.label} tone={meta.tone} />
        </View>

        <Text style={[styles.explanation, { color: colors.textDim }]}>{explanation}</Text>

        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={progress} height={7} />
          </View>
          <Text style={[styles.progressText, { color: colors.textDim }]}>
            {approved}/{total || 0}
          </Text>
        </View>

        <View style={styles.workList}>
          {(entry.requiredItems || []).map((row) => {
            const workId = String(row.workId || row.item?.work_id || "");
            const label = WORK_ID_LABELS[workId] || workId || "Modül";
            const state = row.item?.state || "not_started";
            const workMeta = workStateMeta(state);
            const canReview = state === "submitted";
            return (
              <View key={workId} style={[styles.workRow, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.workTitle, { color: colors.text }]} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={[styles.workMeta, { color: colors.textDim }]} numberOfLines={2}>
                    {row.item?.manager_comment || workMeta.label}
                  </Text>
                </View>
                <StatusPill label={workMeta.label} tone={workMeta.tone} icon={workMeta.icon} />
                <View style={styles.workActions}>
                  <Pressable
                    onPress={() => onOpenModule(workId)}
                    hitSlop={8}
                    style={[styles.workIconBtnNeutral, { backgroundColor: colors.bgElev, borderColor: colors.border }]}
                  >
                    <Ionicons name="open-outline" size={17} color={colors.textDim} />
                  </Pressable>
                  {canReview ? (
                    <>
                      <Pressable
                        onPress={() => onApprove(workId, label)}
                        hitSlop={8}
                        style={[styles.workIconBtn, { borderColor: alpha(colors.success, 0.34), backgroundColor: alpha(colors.success, 0.12) }]}
                      >
                        <Ionicons name="checkmark-outline" size={17} color={colors.success} />
                      </Pressable>
                      <Pressable
                        onPress={() => onRevise(workId, label)}
                        hitSlop={8}
                        style={[styles.workIconBtn, { borderColor: alpha(colors.danger, 0.34), backgroundColor: alpha(colors.danger, 0.12) }]}
                      >
                        <Ionicons name="refresh-outline" size={17} color={colors.danger} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.ctaBand, { backgroundColor: accent }]}>
        <Text style={styles.ctaBandText} numberOfLines={2}>
          Modül detayını açıp gerekli kontrolleri tamamlayın.
        </Text>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.84 : 1 }]}
          testID={`manager-review-open-${entry.scenario.id}`}
        >
          <Text style={[styles.ctaButtonText, { color: accent }]}>Senaryoyu Aç</Text>
          <Ionicons name="chevron-forward" size={15} color={accent} />
        </Pressable>
      </View>
    </View>
  );
}

function Notice({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.notice, { borderColor: alpha(color, 0.34), backgroundColor: alpha(color, 0.12) }]}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.noticeText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { ...font.h3, marginTop: 2 },
  listHeader: { gap: spacing.lg },
  heroFooterText: { color: "rgba(255,255,255,0.86)", ...font.small, lineHeight: 18 },
  filterRow: { gap: spacing.sm, alignItems: "center" },
  rewardCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rewardBody: { padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { ...font.h3, fontSize: 18 },
  cardSub: { ...font.small, marginTop: 3 },
  explanation: { ...font.body, lineHeight: 21 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressText: { ...font.small, minWidth: 48, textAlign: "right" },
  workList: { gap: spacing.sm },
  workRow: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  workTitle: { ...font.bodyMd },
  workMeta: { ...font.small, marginTop: 2 },
  workActions: { flexDirection: "row", gap: spacing.sm },
  workIconBtnNeutral: {
    width: 36,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  workIconBtn: {
    width: 36,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaBand: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ctaBandText: { color: "#FFFFFF", ...font.bodyMd, flex: 1, lineHeight: 20 },
  ctaButton: {
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaButtonText: { ...font.small, fontWeight: "900" },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  sheetTitle: { ...font.h3 },
  sheetSub: { ...font.body },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
  noticeText: { ...font.small, flex: 1 },
});
