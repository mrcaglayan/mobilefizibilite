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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { ManagerReviewQueueEntry, api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { colors, font, radius, spacing } from "@/src/theme";
import { BottomSheet } from "@/src/ui/BottomSheet";
import { Button, Card, Chip, EmptyState, Input, ProgressBar } from "@/src/ui/components";

const WORK_ID_LABELS: Record<string, string> = {
  temel_bilgiler: "Temel Bilgiler",
  kapasite: "Kapasite",
  "norm.ders_dagilimi": "Norm",
  "ik.local_staff": "IK",
  "gelirler.unit_fee": "Gelirler",
  "giderler.isletme": "Giderler",
};

const FILTERS = [
  { key: "all", label: "Tumu" },
  { key: "in_review", label: "Incelemede" },
  { key: "revision", label: "Revizyon" },
  { key: "approved", label: "Kontrol Edildi" },
  { key: "ready", label: "Hazir" },
  { key: "sent", label: "Merkeze Iletildi" },
];

type FilterKey = typeof FILTERS[number]["key"];

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

function statusMeta(status?: string | null, sentAt?: string | null) {
  switch (status) {
    case "revision_requested":
      return { label: "Revize istendi", color: colors.warn, bg: "#F9731618" };
    case "sent_for_approval":
      return { label: "Merkeze iletildi", color: colors.accent, bg: "#4C8DFF18" };
    case "approved":
      return sentAt
        ? { label: "Onaylandi", color: colors.success, bg: "#22C55E18" }
        : { label: "Kontrol edildi", color: colors.success, bg: "#22C55E18" };
    case "in_review":
    case "submitted":
      return { label: "Incelemede", color: colors.accent, bg: "#4C8DFF18" };
    default:
      return { label: "Taslak", color: colors.textDim, bg: colors.bgElev2 };
  }
}

function workStateMeta(state?: string | null) {
  switch (state) {
    case "approved":
      return { label: "Kontrol edildi", color: colors.success, bg: "#22C55E18" };
    case "needs_revision":
      return { label: "Revize istendi", color: colors.warn, bg: "#F9731618" };
    case "submitted":
      return { label: "Incelemede", color: colors.accent, bg: "#4C8DFF18" };
    case "in_progress":
      return { label: "Hazirlaniyor", color: colors.warn, bg: "#F9731618" };
    default:
      return { label: "Baslanmadi", color: colors.textDim, bg: colors.bgElev2 };
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

export default function ManagerReviewQueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canView =
    user?.role === "manager" ||
    user?.role === "accountant" ||
    (user?.role !== "admin" && (
      can(user, "page.manage_permissions", "read", { countryId: user?.country_id ?? null }) ||
      can(user, "page.manage_permissions", "write", { countryId: user?.country_id ?? null })
    ));

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
      setErr(error?.message || "Inceleme kuyrugu yuklenemedi.");
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
      const body = action.action === "approve"
        ? { action: "approve" }
        : { action: "revise", comment: revisionNote.trim() || undefined };
      await api.reviewWorkItem(action.schoolId, action.scenarioId, action.workId, body);
      await load();
      setReviewAction(null);
      setRevisionNote("");
      setMessage(action.action === "approve" ? "Modul kontrol edildi." : "Revizyon istendi.");
    } catch (error: any) {
      setErr(error?.message || "Islem tamamlanamadi.");
    } finally {
      setActionBusy(false);
    }
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-review-queue-denied">
        <View style={styles.header}>
          <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>MUDUR YONETIMI</Text>
            <Text style={styles.headerTitle}>Yetki Yok</Text>
          </View>
        </View>
        <View style={{ padding: spacing.lg }}>
          <Notice icon="lock-closed-outline" color={colors.warn} text="Bu ekran manager/accountant rolu veya page.manage_permissions okuma yetkisi gerektirir." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="manager-review-queue-screen">
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} style={styles.backBtn} testID="manager-review-queue-back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>MUDUR YONETIMI</Text>
          <Text style={styles.headerTitle}>Inceleme Kuyrugu</Text>
        </View>
        <Pressable
          onPress={() => {
            setRefreshing(true);
            load();
          }}
          hitSlop={10}
          style={styles.iconBtn}
          testID="manager-review-queue-refresh"
        >
          <Ionicons name="refresh-outline" size={18} color={colors.textDim} />
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
            <View style={{ gap: spacing.md }}>
              {err ? <Notice icon="alert-circle-outline" color={colors.danger} text={err} /> : null}
              {message ? <Notice icon="information-circle-outline" color={colors.primary} text={message} /> : null}
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
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
          ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title="Inceleme kaydi yok" subtitle="Bu filtrede kontrol bekleyen senaryo bulunmuyor." />}
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
        title={reviewAction?.action === "approve" ? "Modulu Kontrol Et" : "Revizyon Iste"}
        testID="manager-review-action-sheet"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>{reviewAction?.label || "-"}</Text>
          {reviewAction?.action === "revise" ? (
            <Input
              label="Revizyon notu"
              value={revisionNote}
              onChangeText={setRevisionNote}
              multiline
              placeholder="Eksik veya duzeltilmesi gereken alanlari yazin..."
              testID="manager-review-revision-note"
            />
          ) : (
            <Text style={styles.sheetSub}>Bu modul kontrol edildi olarak isaretlenecek.</Text>
          )}
          <Button
            label={reviewAction?.action === "approve" ? "Onayla" : "Revizyon Iste"}
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
    </SafeAreaView>
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
  const total = requiredTotal(entry);
  const approved = approvedCount(entry);
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
  const meta = statusMeta(entry.scenario.status, entry.scenario.sent_at);
  return (
    <Card testID={`manager-review-card-${entry.scenario.id}`}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{entry.scenario.name}</Text>
          <Text style={styles.cardSub}>{entry.school.name} · {entry.scenario.academic_year || "-"}</Text>
        </View>
        <View style={[styles.statePill, { backgroundColor: meta.bg, borderColor: `${meta.color}55` }]}>
          <Text style={[styles.stateText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={progress} />
        </View>
        <Text style={styles.progressText}>{approved}/{total || 0}</Text>
      </View>

      <View style={styles.workList}>
        {(entry.requiredItems || []).map((row) => {
          const workId = String(row.workId || row.item?.work_id || "");
          const label = WORK_ID_LABELS[workId] || workId || "Modul";
          const state = row.item?.state || "not_started";
          const workMeta = workStateMeta(state);
          const canReview = state === "submitted";
          return (
            <View key={workId} style={styles.workRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.workTitle}>{label}</Text>
                <Text style={styles.workMeta}>{row.item?.manager_comment || workMeta.label}</Text>
              </View>
              <View style={[styles.smallPill, { backgroundColor: workMeta.bg, borderColor: `${workMeta.color}55` }]}>
                <Text style={[styles.smallPillText, { color: workMeta.color }]}>{workMeta.label}</Text>
              </View>
              <View style={styles.workActions}>
                <Pressable onPress={() => onOpenModule(workId)} hitSlop={8} style={styles.workIconBtnNeutral}>
                  <Ionicons name="open-outline" size={17} color={colors.textDim} />
                </Pressable>
                {canReview ? (
                  <>
                    <Pressable onPress={() => onApprove(workId, label)} hitSlop={8} style={styles.workIconBtn}>
                      <Ionicons name="checkmark-outline" size={17} color={colors.success} />
                    </Pressable>
                    <Pressable onPress={() => onRevise(workId, label)} hitSlop={8} style={styles.workIconBtnDanger}>
                      <Ionicons name="refresh-outline" size={17} color={colors.danger} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Button
        label="Senaryoyu Ac"
        icon="open-outline"
        variant="secondary"
        onPress={onOpen}
        style={{ marginTop: spacing.md }}
        testID={`manager-review-open-${entry.scenario.id}`}
      />
    </Card>
  );
}

function Notice({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={[styles.notice, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: { color: colors.textMuted, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { color: colors.text, ...font.h3, marginTop: 2 },
  filterRow: { gap: spacing.sm, alignItems: "center" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardTitle: { color: colors.text, ...font.h3 },
  cardSub: { color: colors.textDim, ...font.small, marginTop: 3 },
  statePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  stateText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  progressText: { color: colors.textDim, ...font.small, minWidth: 48, textAlign: "right" },
  workList: { gap: spacing.sm, marginTop: spacing.md },
  workRow: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  workTitle: { color: colors.text, ...font.bodyMd },
  workMeta: { color: colors.textDim, ...font.small, marginTop: 2 },
  smallPill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  smallPillText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.3 },
  workActions: { flexDirection: "row", gap: spacing.sm },
  workIconBtnNeutral: {
    width: 36,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  workIconBtn: {
    width: 36,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#22C55E55",
    backgroundColor: "#22C55E18",
  },
  workIconBtnDanger: {
    width: 36,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EF444455",
    backgroundColor: "#EF444418",
  },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  sheetTitle: { color: colors.text, ...font.h3 },
  sheetSub: { color: colors.textDim, ...font.body },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  noticeText: { color: colors.text, ...font.small, flex: 1 },
});
