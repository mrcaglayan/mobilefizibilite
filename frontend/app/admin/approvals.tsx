// Admin: Approvals - segmented (Scenarios | Batches) + status filter + review sheet.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ApprovalBatchRow, BatchItem, ScenarioQueueRow, api } from "@/src/api/client";
import { alpha, font, formatMoney, formatPct, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BottomSheet } from "@/src/ui/BottomSheet";
import {
  Button,
  Chip,
  EmptyStateCard,
  GradientHeroCard,
  ScreenScaffold,
  SectionHeader,
  StatusPill,
  StatusTone,
} from "@/src/ui/components";

type ApprovalView = "scenarios" | "batches";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Tümü" },
  { key: "sent_for_approval", label: "Onay Bekliyor" },
  { key: "submitted", label: "Gönderildi" },
  { key: "approved", label: "Onaylandı" },
  { key: "revision_requested", label: "Revizyon" },
  { key: "draft", label: "Taslak" },
];

const WORK_IDS = [
  { key: "temel_bilgiler", label: "Temel Bilgiler" },
  { key: "kapasite", label: "Kapasite" },
  { key: "norm.ders_dagilimi", label: "Norm" },
  { key: "ik.local_staff", label: "İK" },
  { key: "gelirler.unit_fee", label: "Gelirler" },
  { key: "giderler.isletme", label: "Giderler" },
];

const YEARS = [
  { key: "y1", label: "Yıl 1" },
  { key: "y2", label: "Yıl 2" },
  { key: "y3", label: "Yıl 3" },
];

function statusInfo(status: string): { label: string; tone: StatusTone; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case "approved":
      return { label: "Onaylandı", tone: "success", icon: "checkmark-circle-outline" };
    case "sent_for_approval":
      return { label: "Onay Bekliyor", tone: "accent", icon: "time-outline" };
    case "submitted":
      return { label: "Gönderildi", tone: "review", icon: "paper-plane-outline" };
    case "revision_requested":
      return { label: "Revizyon İstendi", tone: "revision", icon: "refresh-circle-outline" };
    case "draft":
    default:
      return { label: status || "Taslak", tone: "muted", icon: "document-outline" };
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

export default function AdminApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [view, setView] = useState<ApprovalView>("scenarios");
  const [statusFilter, setStatusFilter] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioQueueRow[]>([]);
  const [batches, setBatches] = useState<ApprovalBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [reviewTarget, setReviewTarget] = useState<
    | { kind: "scenario"; row: ScenarioQueueRow }
    | { kind: "batch"; row: ApprovalBatchRow }
    | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      if (view === "scenarios") {
        const res = await api.adminGetScenarioQueue(statusFilter ? { status: statusFilter } : {});
        setScenarios(res);
      } else {
        const res = await api.adminGetApprovalBatchQueue(statusFilter ? { status: statusFilter } : {});
        setBatches(res);
      }
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [view, statusFilter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  const visibleCount = view === "scenarios" ? scenarios.length : batches.length;
  const pendingCount = view === "scenarios"
    ? scenarios.filter((row) => ["sent_for_approval", "submitted"].includes(row.scenario.status)).length
    : batches.filter((row) => ["sent_for_approval", "submitted"].includes(row.status)).length;

  return (
    <ScreenScaffold testID="admin-approvals-screen">
      <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <Pressable
          testID="admin-approvals-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.backBtn, { backgroundColor: colors.bgElev, borderColor: colors.border }, !isDark && shadow.soft]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerLabel, { color: colors.textMuted }]}>Yönetim</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Onaylar</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : view === "scenarios" ? (
        <FlatList
          data={scenarios}
          keyExtractor={(r) => String(r.scenario.id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + 120,
            gap: spacing.md,
          }}
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
            <ApprovalsHeader
              view={view}
              setView={setView}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              visibleCount={visibleCount}
              pendingCount={pendingCount}
              err={err}
            />
          }
          ListEmptyComponent={
            <EmptyStateCard
              icon="checkmark-done-outline"
              title="Sıra boş"
              subtitle="Bu filtreye uyan senaryo bulunmuyor."
            />
          }
          renderItem={({ item }) => (
            <ScenarioApprovalCard row={item} onReview={() => setReviewTarget({ kind: "scenario", row: item })} />
          )}
        />
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(r) => String(r.batch_id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + 120,
            gap: spacing.md,
          }}
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
            <ApprovalsHeader
              view={view}
              setView={setView}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              visibleCount={visibleCount}
              pendingCount={pendingCount}
              err={err}
            />
          }
          ListEmptyComponent={
            <EmptyStateCard
              icon="albums-outline"
              title="Batch yok"
              subtitle="Bu filtreye uyan ülke onay batch'i bulunmuyor."
            />
          }
          renderItem={({ item }) => (
            <BatchApprovalCard row={item} onReview={() => setReviewTarget({ kind: "batch", row: item })} />
          )}
        />
      )}

      <ReviewSheet
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onDone={async (label) => {
          setReviewTarget(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast(label);
          setLoading(true);
          await load();
        }}
      />

      {toast ? (
        <View
          style={[
            styles.toast,
            {
              bottom: insets.bottom + 20,
              backgroundColor: colors.bgElev,
              borderColor: colors.borderStrong,
            },
            !isDark && shadow.card,
          ]}
          testID="admin-approvals-toast"
        >
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={[styles.toastText, { color: colors.text }]}>{toast}</Text>
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

function ApprovalsHeader({
  view,
  setView,
  statusFilter,
  setStatusFilter,
  visibleCount,
  pendingCount,
  err,
}: {
  view: ApprovalView;
  setView: (view: ApprovalView) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  visibleCount: number;
  pendingCount: number;
  err: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.listHeader}>
      <GradientHeroCard
        icon="gift-outline"
        eyebrow="Onay havuzu"
        title={view === "scenarios" ? "Senaryo onayları" : "Ülke batch onayları"}
        subtitle="Onay bekleyen işleri inceleyin, yılları seçin veya revizyon isteyin."
        metricValue={String(pendingCount)}
        metricLabel="aksiyon bekleyen"
        progress={visibleCount ? Math.round((pendingCount / visibleCount) * 100) : 0}
        footer={
          <Text style={styles.heroFooterText}>
            Bu filtrede {visibleCount} kayıt listeleniyor.
          </Text>
        }
      />

      <View style={[styles.segmented, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
        <Pressable
          testID="admin-approvals-tab-scenarios"
          onPress={() => setView("scenarios")}
          style={[styles.segBtn, view === "scenarios" && { backgroundColor: colors.bgElev }]}
        >
          <Text style={[styles.segText, { color: view === "scenarios" ? colors.primary : colors.textDim }]}>
            Senaryolar
          </Text>
        </Pressable>
        <Pressable
          testID="admin-approvals-tab-batches"
          onPress={() => setView("batches")}
          style={[styles.segBtn, view === "batches" && { backgroundColor: colors.bgElev }]}
        >
          <Text style={[styles.segText, { color: view === "batches" ? colors.primary : colors.textDim }]}>
            Ülke Batch'leri
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="Durum Filtreleri" subtitle="Onay kuyruğunu daraltın" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s.key || "all"}
            label={s.label}
            active={statusFilter === s.key}
            onPress={() => setStatusFilter(s.key)}
            testID={`admin-approvals-filter-${s.key || "all"}`}
          />
        ))}
      </ScrollView>

      {err ? (
        <View
          style={[
            styles.errBox,
            { backgroundColor: alpha(colors.danger, 0.12), borderColor: alpha(colors.danger, 0.34) },
          ]}
          testID="admin-approvals-error"
        >
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.errText, { color: colors.danger }]}>{err}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScenarioApprovalCard({ row, onReview }: { row: ScenarioQueueRow; onReview: () => void }) {
  const { colors, isDark } = useAppTheme();
  const info = statusInfo(row.scenario.status);
  const accent = toneAccent(colors, info.tone);
  const currency = row.scenario.local_currency_code || row.scenario.input_currency || "TRY";
  const canReview = ["sent_for_approval", "submitted", "approved"].includes(row.scenario.status);
  const missingText = row.scenario.progress_missing_preview || (
    row.scenario.progress_missing_count ? `${row.scenario.progress_missing_count} eksik alan var.` : "Eksik alan bilgisi yok."
  );

  return (
    <View
      style={[
        styles.rewardCard,
        { backgroundColor: colors.bgElev, borderColor: colors.border },
        !isDark && shadow.card,
      ]}
      testID={`admin-approvals-scenario-${row.scenario.id}`}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIcon, { backgroundColor: alpha(accent, 0.12) }]}>
            <Ionicons name="document-text-outline" size={24} color={accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
              {row.school.name}
            </Text>
            <Text style={[styles.cardSub, { color: colors.textDim }]} numberOfLines={1}>
              {row.scenario.name} • {row.scenario.academic_year}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {row.country.name}
              {row.country.region ? ` • ${row.country.region}` : ""}
            </Text>
          </View>
          <StatusPill label={info.label} tone={info.tone} icon={info.icon} />
        </View>

        <Text style={[styles.explanation, { color: colors.textDim }]} numberOfLines={2}>
          {missingText}
        </Text>

        <View style={[styles.kpiStrip, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
          {(["y1", "y2", "y3"] as const).map((k) => {
            const kpi = row.kpis[k];
            if (!kpi) {
              return (
                <View key={k} style={[styles.kpiCell, { borderRightColor: colors.border }]}>
                  <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.toUpperCase()}</Text>
                  <Text style={[styles.kpiMissing, { color: colors.textMuted }]}>-</Text>
                </View>
              );
            }
            const margin = kpi.net_ciro && kpi.net_result != null ? (kpi.net_result / kpi.net_ciro) * 100 : null;
            return (
              <View key={k} style={[styles.kpiCell, { borderRightColor: colors.border }]}>
                <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{k.toUpperCase()}</Text>
                <Text style={[styles.kpiValue, { color: colors.text }]} numberOfLines={1}>
                  {formatMoney(Number(kpi.net_result || 0), currency)}
                </Text>
                <Text style={[styles.kpiSub, { color: colors.textDim }]}>
                  {margin != null ? formatPct(margin) : "-"}
                </Text>
              </View>
            );
          })}
        </View>

        {row.scenario.review_note ? (
          <View style={[styles.noteBox, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.textDim} />
            <Text style={[styles.noteText, { color: colors.textDim }]} numberOfLines={2}>
              {row.scenario.review_note}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.ctaBand, { backgroundColor: accent }]}>
        <Text style={styles.ctaBandText} numberOfLines={2}>
          %{Math.round(row.scenario.progress_pct || 0)} tamamlandı. Yıl ve modül kapsamını inceleyin.
        </Text>
        {canReview ? (
          <Pressable
            style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.84 : 1 }]}
            onPress={onReview}
            testID={`admin-approvals-review-${row.scenario.id}`}
          >
            <Text style={[styles.ctaButtonText, { color: accent }]}>İncele</Text>
            <Ionicons name="chevron-forward" size={15} color={accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function BatchApprovalCard({ row, onReview }: { row: ApprovalBatchRow; onReview: () => void }) {
  const { colors, isDark } = useAppTheme();
  const info = statusInfo(row.status);
  const accent = toneAccent(colors, info.tone);
  const canReview = ["submitted", "sent_for_approval"].includes(row.status);

  return (
    <View
      style={[
        styles.rewardCard,
        { backgroundColor: colors.bgElev, borderColor: colors.border },
        !isDark && shadow.card,
      ]}
      testID={`admin-approvals-batch-${row.batch_id}`}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIcon, { backgroundColor: alpha(accent, 0.12) }]}>
            <Ionicons name="albums-outline" size={24} color={accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
              {row.country.name}
            </Text>
            <Text style={[styles.cardSub, { color: colors.textDim }]} numberOfLines={1}>
              Batch #{row.batch_id} • {row.academic_year}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
              {row.scenario_count} senaryo • {row.school_count} okul
            </Text>
          </View>
          <StatusPill label={info.label} tone={info.tone} icon={info.icon} />
        </View>

        <Text style={[styles.explanation, { color: colors.textDim }]} numberOfLines={2}>
          {row.review_note || `${row.country.name} için toplu onay paketi. İçerik detayları inceleme ekranında listelenir.`}
        </Text>

        <View style={styles.batchStats}>
          <MiniMetric icon="school-outline" label="Okul" value={String(row.school_count)} />
          <MiniMetric icon="layers-outline" label="Senaryo" value={String(row.scenario_count)} />
          <MiniMetric icon="calendar-outline" label="Tarih" value={new Date(row.created_at).toLocaleDateString("tr-TR")} />
        </View>
      </View>

      <View style={[styles.ctaBand, { backgroundColor: accent }]}>
        <Text style={styles.ctaBandText} numberOfLines={2}>
          Ülke batch içeriğini kontrol edip onay veya revizyon kararı verin.
        </Text>
        {canReview ? (
          <Pressable
            style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.84 : 1 }]}
            onPress={onReview}
            testID={`admin-approvals-batch-review-${row.batch_id}`}
          >
            <Text style={[styles.ctaButtonText, { color: accent }]}>İncele</Text>
            <Ionicons name="chevron-forward" size={15} color={accent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ReviewSheet({
  target,
  onClose,
  onDone,
}: {
  target:
    | { kind: "scenario"; row: ScenarioQueueRow }
    | { kind: "batch"; row: ApprovalBatchRow }
    | null;
  onClose: () => void;
  onDone: (label: string) => void;
}) {
  const { colors } = useAppTheme();
  const [action, setAction] = useState<"approve" | "revise">("approve");
  const [note, setNote] = useState("");
  const [years, setYears] = useState<Record<string, boolean>>({ y1: true, y2: true, y3: true });
  const [workIds, setWorkIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[] | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  const visible = !!target;

  useEffect(() => {
    if (!visible) return;
    setAction("approve");
    setNote("");
    setYears({ y1: true, y2: true, y3: true });
    setWorkIds({});
    setErr("");
    setBatchItems(null);
    if (target?.kind === "batch") {
      setItemsLoading(true);
      api
        .adminGetApprovalBatch(target.row.batch_id)
        .then((res) => setBatchItems(res.items))
        .catch(() => setBatchItems([]))
        .finally(() => setItemsLoading(false));
    }
  }, [visible, target]);

  const title = useMemo(() => {
    if (!target) return "";
    if (target.kind === "scenario") return `${target.row.school.name}`;
    return `${target.row.country.name} Batch #${target.row.batch_id}`;
  }, [target]);

  async function submit() {
    if (!target) return;
    setErr("");
    if (action === "revise" && !note.trim()) {
      return setErr("Revizyon isteği için not zorunlu");
    }
    const includedYears = Object.entries(years).filter(([, v]) => v).map(([k]) => k);
    if (action === "approve" && includedYears.length === 0) {
      return setErr("En az bir yıl seçin");
    }
    const revisionWorkIds = Object.entries(workIds).filter(([, v]) => v).map(([k]) => k);
    if (action === "revise" && revisionWorkIds.length === 0) {
      return setErr("En az bir modül seçin");
    }
    setSaving(true);
    try {
      const body: any = { action, note: note.trim() || null };
      if (action === "approve") body.includedYears = includedYears;
      else body.revisionWorkIds = revisionWorkIds;
      if (target.kind === "scenario") {
        await api.adminReviewScenario(target.row.scenario.id, body);
      } else {
        await api.adminReviewApprovalBatch(target.row.batch_id, body);
      }
      onDone(action === "approve" ? "Onaylandı" : "Revizyon istendi");
    } catch (e: any) {
      setErr(e?.message || "İşlem başarısız");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} testID="review-sheet">
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {err ? (
          <View
            style={[
              styles.errBox,
              { backgroundColor: alpha(colors.danger, 0.12), borderColor: alpha(colors.danger, 0.34) },
            ]}
            testID="review-error"
          >
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.errText, { color: colors.danger }]}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.actionSwitch}>
          <Pressable
            testID="review-action-approve"
            onPress={() => setAction("approve")}
            style={[
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: colors.bgElev2 },
              action === "approve" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={action === "approve" ? colors.primaryText : colors.textDim}
            />
            <Text style={[styles.actionText, { color: action === "approve" ? colors.primaryText : colors.textDim }]}>
              Onayla
            </Text>
          </Pressable>
          <Pressable
            testID="review-action-revise"
            onPress={() => setAction("revise")}
            style={[
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: colors.bgElev2 },
              action === "revise" && { backgroundColor: colors.danger, borderColor: colors.danger },
            ]}
          >
            <Ionicons
              name="return-up-back"
              size={16}
              color={action === "revise" ? "#FFFFFF" : colors.textDim}
            />
            <Text style={[styles.actionText, { color: action === "revise" ? "#FFFFFF" : colors.textDim }]}>
              Revizyon İste
            </Text>
          </Pressable>
        </View>

        {action === "approve" ? (
          <>
            <Text style={[styles.groupLabel, { color: colors.textDim }]}>Dahil Edilecek Yıllar</Text>
            <View style={styles.chipGroup}>
              {YEARS.map((y) => (
                <Chip
                  key={y.key}
                  label={y.label}
                  active={!!years[y.key]}
                  onPress={() => setYears((s) => ({ ...s, [y.key]: !s[y.key] }))}
                  testID={`review-year-${y.key}`}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.groupLabel, { color: colors.textDim }]}>Revizyon Gereken Modüller</Text>
            <View style={styles.chipGroup}>
              {WORK_IDS.map((w) => (
                <Chip
                  key={w.key}
                  label={w.label}
                  active={!!workIds[w.key]}
                  onPress={() => setWorkIds((s) => ({ ...s, [w.key]: !s[w.key] }))}
                  testID={`review-work-${w.key}`}
                />
              ))}
            </View>
          </>
        )}

        <Text style={[styles.groupLabel, { color: colors.textDim }]}>
          Not {action === "revise" ? "(Zorunlu)" : "(Opsiyonel)"}
        </Text>
        <TextInput
          testID="review-note-input"
          value={note}
          onChangeText={setNote}
          placeholder={action === "approve" ? "İsteğe bağlı not..." : "Ne düzeltilmeli? Açıklayın."}
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          style={[
            styles.noteInput,
            {
              backgroundColor: colors.bgElev2,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />

        {target?.kind === "batch" ? (
          <View style={[styles.itemsBox, { backgroundColor: colors.bgElev2, borderColor: colors.border }]}>
            <Text style={[styles.groupLabel, { color: colors.textDim }]}>Batch İçeriği</Text>
            {itemsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : batchItems && batchItems.length > 0 ? (
              batchItems.map((it) => (
                <View key={String(it.scenario_id)} style={styles.batchItem}>
                  <Ionicons name="school-outline" size={14} color={colors.textDim} />
                  <Text style={[styles.batchItemText, { color: colors.text }]} numberOfLines={1}>
                    {it.school_name} - {it.scenario_name}
                  </Text>
                  {it.is_source ? (
                    <View style={[styles.sourceBadge, { backgroundColor: alpha(colors.accent, 0.18), borderColor: colors.accent }]}>
                      <Text style={[styles.sourceBadgeText, { color: colors.primary }]}>Kaynak</Text>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>Batch içeriği yok.</Text>
            )}
          </View>
        ) : null}

        <Button
          label={action === "approve" ? "Onayı Kaydet" : "Revizyon İste"}
          icon={action === "approve" ? "checkmark-done" : "return-up-back"}
          variant={action === "revise" ? "danger" : "primary"}
          onPress={submit}
          loading={saving}
          style={{ marginTop: spacing.md }}
          testID="review-submit"
        />
      </ScrollView>
    </BottomSheet>
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
  headerLabel: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { ...font.h3, marginTop: 2 },
  listHeader: { gap: spacing.lg, marginBottom: spacing.xs },
  heroFooterText: { color: "rgba(255,255,255,0.86)", ...font.small, lineHeight: 18 },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  segText: { ...font.bodyMd, fontSize: 14 },
  chipsContent: { gap: spacing.sm, alignItems: "center" },
  rewardCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardBody: { padding: spacing.lg, gap: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { ...font.h3, fontSize: 18 },
  cardSub: { ...font.small, marginTop: 2 },
  cardMeta: { ...font.tiny, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  explanation: { ...font.body, lineHeight: 21 },
  kpiStrip: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  kpiCell: {
    flex: 1,
    padding: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  kpiLabel: { ...font.tiny, letterSpacing: 0.5 },
  kpiValue: { ...font.mono, fontSize: 13 },
  kpiSub: { ...font.tiny, marginTop: 1 },
  kpiMissing: { ...font.mono, fontSize: 14 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { ...font.small, flex: 1 },
  batchStats: { gap: spacing.sm },
  metric: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  metricLabel: { ...font.tiny },
  metricValue: { ...font.bodyMd, marginTop: 1 },
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
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaButtonText: { ...font.bodyMd, fontWeight: "900" },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errText: { ...font.small, flex: 1 },
  actionSwitch: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { ...font.bodyMd },
  groupLabel: {
    ...font.small,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 15,
    marginBottom: spacing.md,
  },
  itemsBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: 8,
  },
  batchItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  batchItemText: { ...font.small, flex: 1 },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceBadgeText: { ...font.tiny, letterSpacing: 0.5 },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { ...font.bodyMd },
});
