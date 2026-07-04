// Admin: Approvals — segmented (Scenarios | Batches) + status filter + review sheet.

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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import {
  ApprovalBatchRow,
  BatchItem,
  ScenarioQueueRow,
  api,
} from "@/src/api/client";
import { colors, font, formatMoney, formatPct, radius, spacing } from "@/src/theme";
import { Button, Chip, EmptyState } from "@/src/ui/components";
import { BottomSheet } from "@/src/ui/BottomSheet";
import { AppBottomNav } from "@/src/ui/AppBottomNav";

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
  { key: "ik.local_staff", label: "IK" },
  { key: "gelirler.unit_fee", label: "Gelirler" },
  { key: "giderler.isletme", label: "Giderler" },
];

const YEARS = [
  { key: "y1", label: "Yıl 1" },
  { key: "y2", label: "Yıl 2" },
  { key: "y3", label: "Yıl 3" },
];

function statusStyle(status: string) {
  switch (status) {
    case "approved":
      return { label: "Onaylandı", bg: "#22C55E22", border: "#22C55E55", text: "#86EFAC", dot: colors.success };
    case "sent_for_approval":
      return { label: "Onay Bekliyor", bg: "#F5B30122", border: "#F5B30155", text: colors.primary, dot: colors.primary };
    case "submitted":
      return { label: "Gönderildi", bg: "#4C8DFF22", border: "#4C8DFF55", text: "#93B5FF", dot: colors.accent };
    case "revision_requested":
      return { label: "Revizyon İstendi", bg: "#F9731622", border: "#F9731655", text: "#FDBA74", dot: colors.warn };
    case "draft":
    default:
      return { label: status || "Taslak", bg: colors.bgElev2, border: colors.border, text: colors.textDim, dot: colors.textMuted };
  }
}

export default function AdminApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="admin-approvals-screen">
      <View style={styles.header}>
        <Pressable
          testID="admin-approvals-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>YÖNETİM</Text>
          <Text style={styles.headerTitle}>Onaylar</Text>
        </View>
      </View>

      {/* Segmented */}
      <View style={styles.segWrap}>
        <View style={styles.segmented}>
          <Pressable
            testID="admin-approvals-tab-scenarios"
            onPress={() => setView("scenarios")}
            style={[styles.segBtn, view === "scenarios" && styles.segBtnActive]}
          >
            <Text style={[styles.segText, view === "scenarios" && styles.segTextActive]}>
              Senaryolar
            </Text>
          </Pressable>
          <Pressable
            testID="admin-approvals-tab-batches"
            onPress={() => setView("batches")}
            style={[styles.segBtn, view === "batches" && styles.segBtnActive]}
          >
            <Text style={[styles.segText, view === "batches" && styles.segTextActive]}>
              Ülke Batch{"'"}leri
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Status filter */}
      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
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
      </View>

      {err ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <View style={styles.errBox} testID="admin-approvals-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        </View>
      ) : null}

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
            paddingBottom: insets.bottom + 112,
            gap: spacing.sm,
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
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title="Sıra boş"
              subtitle="Bu filtreye uyan senaryo bulunmuyor."
            />
          }
          renderItem={({ item }) => (
            <ScenarioCard row={item} onReview={() => setReviewTarget({ kind: "scenario", row: item })} />
          )}
        />
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(r) => String(r.batch_id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + 112,
            gap: spacing.sm,
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
          ListEmptyComponent={
            <EmptyState
              icon="albums-outline"
              title="Batch yok"
              subtitle="Bu filtreye uyan ülke onay batch'i bulunmuyor."
            />
          }
          renderItem={({ item }) => (
            <BatchCard row={item} onReview={() => setReviewTarget({ kind: "batch", row: item })} />
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
        <View style={[styles.toast, { bottom: insets.bottom + 20 }]} testID="admin-approvals-toast">
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      <AppBottomNav activeKey="review" />
    </SafeAreaView>
  );
}

// -------- Cards --------
function ScenarioCard({ row, onReview }: { row: ScenarioQueueRow; onReview: () => void }) {
  const st = statusStyle(row.scenario.status);
  const currency = row.scenario.local_currency_code || row.scenario.input_currency || "TRY";
  const canReview = ["sent_for_approval", "submitted", "approved"].includes(row.scenario.status);
  return (
    <View style={styles.card} testID={`admin-approvals-scenario-${row.scenario.id}`}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {row.school.name}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {row.scenario.name} · {row.scenario.academic_year}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {row.country.name}
            {row.country.region ? ` · ${row.country.region}` : ""}
          </Text>
        </View>
        <View style={[styles.stateBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
          <View style={[styles.dot, { backgroundColor: st.dot }]} />
          <Text style={[styles.stateText, { color: st.text }]}>{st.label}</Text>
        </View>
      </View>

      {/* KPI mini strip */}
      <View style={styles.kpiStrip}>
        {(["y1", "y2", "y3"] as const).map((k) => {
          const kpi = row.kpis[k];
          if (!kpi) {
            return (
              <View key={k} style={styles.kpiCell}>
                <Text style={styles.kpiLabel}>{k.toUpperCase()}</Text>
                <Text style={styles.kpiMissing}>—</Text>
              </View>
            );
          }
          const margin =
            kpi.net_ciro && kpi.net_result != null ? (kpi.net_result / kpi.net_ciro) * 100 : null;
          return (
            <View key={k} style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>{k.toUpperCase()}</Text>
              <Text style={styles.kpiValue} numberOfLines={1}>
                {formatMoney(Number(kpi.net_result || 0), currency)}
              </Text>
              <Text style={styles.kpiSub}>
                {margin != null ? formatPct(margin) : "-"}
              </Text>
            </View>
          );
        })}
      </View>

      {row.scenario.review_note ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textDim} />
          <Text style={styles.noteText} numberOfLines={2}>
            {row.scenario.review_note}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardFoot}>
        <Text style={styles.cardMeta}>
          %{Math.round(row.scenario.progress_pct || 0)} tamamlandı
        </Text>
        {canReview ? (
          <Button
            label="İncele"
            icon="checkmark-done-outline"
            small
            onPress={onReview}
            testID={`admin-approvals-review-${row.scenario.id}`}
          />
        ) : null}
      </View>
    </View>
  );
}

function BatchCard({ row, onReview }: { row: ApprovalBatchRow; onReview: () => void }) {
  const st = statusStyle(row.status);
  const canReview = ["submitted", "sent_for_approval"].includes(row.status);
  return (
    <View style={styles.card} testID={`admin-approvals-batch-${row.batch_id}`}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {row.country.name}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            Batch #{row.batch_id} · {row.academic_year}
          </Text>
          <Text style={styles.cardMeta}>
            {row.scenario_count} senaryo · {row.school_count} okul
          </Text>
        </View>
        <View style={[styles.stateBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
          <View style={[styles.dot, { backgroundColor: st.dot }]} />
          <Text style={[styles.stateText, { color: st.text }]}>{st.label}</Text>
        </View>
      </View>

      {row.review_note ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textDim} />
          <Text style={styles.noteText} numberOfLines={2}>
            {row.review_note}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardFoot}>
        <Text style={styles.cardMeta}>
          {new Date(row.created_at).toLocaleDateString("tr-TR")}
        </Text>
        {canReview ? (
          <Button
            label="İncele"
            icon="checkmark-done-outline"
            small
            onPress={onReview}
            testID={`admin-approvals-batch-review-${row.batch_id}`}
          />
        ) : null}
      </View>
    </View>
  );
}

// -------- Review sheet --------
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
          <View style={styles.errBox} testID="review-error">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {/* Action switch */}
        <View style={styles.actionSwitch}>
          <Pressable
            testID="review-action-approve"
            onPress={() => setAction("approve")}
            style={[styles.actionBtn, action === "approve" && styles.actionBtnActiveApprove]}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={action === "approve" ? "#0B1220" : colors.textDim}
            />
            <Text
              style={{
                color: action === "approve" ? "#0B1220" : colors.textDim,
                ...font.bodyMd,
              }}
            >
              Onayla
            </Text>
          </Pressable>
          <Pressable
            testID="review-action-revise"
            onPress={() => setAction("revise")}
            style={[styles.actionBtn, action === "revise" && styles.actionBtnActiveRevise]}
          >
            <Ionicons
              name="return-up-back"
              size={16}
              color={action === "revise" ? "#FFFFFF" : colors.textDim}
            />
            <Text
              style={{
                color: action === "revise" ? "#FFFFFF" : colors.textDim,
                ...font.bodyMd,
              }}
            >
              Revizyon İste
            </Text>
          </Pressable>
        </View>

        {action === "approve" ? (
          <>
            <Text style={styles.groupLabel}>DAHIL EDİLECEK YILLAR</Text>
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
            <Text style={styles.groupLabel}>REVİZYON GEREKEN MODÜLLER</Text>
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

        <Text style={styles.groupLabel}>
          NOT {action === "revise" ? "(ZORUNLU)" : "(OPSİYONEL)"}
        </Text>
        <TextInput
          testID="review-note-input"
          value={note}
          onChangeText={setNote}
          placeholder={
            action === "approve"
              ? "İsteğe bağlı not..."
              : "Ne düzeltilmeli? Açıklayın."
          }
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          style={styles.noteInput}
        />

        {target?.kind === "batch" ? (
          <View style={styles.itemsBox}>
            <Text style={styles.groupLabel}>BATCH İÇERİĞİ</Text>
            {itemsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : batchItems && batchItems.length > 0 ? (
              batchItems.map((it) => (
                <View key={String(it.scenario_id)} style={styles.batchItem}>
                  <Ionicons name="school-outline" size={14} color={colors.textDim} />
                  <Text style={styles.batchItemText} numberOfLines={1}>
                    {it.school_name} — {it.scenario_name}
                  </Text>
                  {it.is_source ? (
                    <View style={styles.sourceBadge}>
                      <Text style={styles.sourceBadgeText}>Kaynak</Text>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.cardMeta}>Batch içeriği yok.</Text>
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
  headerLabel: { color: colors.textMuted, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { color: colors.text, ...font.h3, marginTop: 2 },
  segWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  segBtnActive: { backgroundColor: colors.bgElev },
  segText: { color: colors.textDim, ...font.bodyMd, fontSize: 14 },
  segTextActive: { color: colors.text },
  chipsRow: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.sm,
  },
  card: {
    padding: spacing.md,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { color: colors.text, ...font.h3, fontSize: 16 },
  cardSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  cardMeta: { color: colors.textMuted, ...font.tiny, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  cardFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 999 },
  stateText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiStrip: {
    flexDirection: "row",
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  kpiCell: {
    flex: 1,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    gap: 2,
  },
  kpiLabel: { color: colors.textMuted, ...font.tiny, letterSpacing: 0.5 },
  kpiValue: { color: colors.text, ...font.mono, fontSize: 13 },
  kpiSub: { color: colors.textDim, ...font.tiny, marginTop: 1 },
  kpiMissing: { color: colors.textMuted, ...font.mono, fontSize: 14 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: { color: colors.textDim, ...font.small, flex: 1 },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EF444422",
    borderColor: "#EF444455",
    borderWidth: 1,
    padding: 10,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errText: { color: "#FCA5A5", ...font.small, flex: 1 },
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  actionBtnActiveApprove: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionBtnActiveRevise: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  groupLabel: {
    color: colors.textDim,
    ...font.small,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  noteInput: {
    backgroundColor: colors.bgElev2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 15,
    marginBottom: spacing.md,
  },
  itemsBox: {
    padding: spacing.md,
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: 8,
  },
  batchItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  batchItemText: { color: colors.text, ...font.small, flex: 1 },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#F5B30122",
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  sourceBadgeText: { color: colors.primary, ...font.tiny, letterSpacing: 0.5 },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgElev,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: colors.text, ...font.bodyMd },
});
