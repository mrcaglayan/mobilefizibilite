// School detail - scenario list and safe scenario metadata operations.

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
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, Scenario, School } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import { colors, font, radius, spacing } from "@/src/theme";
import { BottomSheet } from "@/src/ui/BottomSheet";
import { Button, Card, Chip, EmptyState, Input, ProgressBar } from "@/src/ui/components";

type ScenarioForm = {
  name: string;
  academicYear: string;
  inputCurrency: "USD" | "LOCAL";
  localCurrencyCode: string;
  fxUsdToLocal: string;
  programType: "local" | "international";
};

type FormMode = "create" | "edit";

function nextAcademicYear() {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

function blankForm(): ScenarioForm {
  return {
    name: "",
    academicYear: nextAcademicYear(),
    inputCurrency: "USD",
    localCurrencyCode: "",
    fxUsdToLocal: "",
    programType: "local",
  };
}

function formFromScenario(scenario: Scenario): ScenarioForm {
  return {
    name: scenario.name || "",
    academicYear: scenario.academic_year || "",
    inputCurrency: scenario.input_currency === "LOCAL" ? "LOCAL" : "USD",
    localCurrencyCode: scenario.local_currency_code || "",
    fxUsdToLocal: scenario.fx_usd_to_local == null ? "" : String(scenario.fx_usd_to_local),
    programType: scenario.program_type === "international" ? "international" : "local",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
}

function normalizeCurrencyCode(value: string) {
  return value.trim().toUpperCase();
}

function validAcademicYear(value: string) {
  const raw = value.trim();
  const match = /^(\d{4})(?:\s*-\s*(\d{4}))?$/.exec(raw);
  if (!match) return false;
  if (!match[2]) return true;
  return Number(match[2]) === Number(match[1]) + 1;
}

function isScenarioLocked(scenario: Scenario) {
  const status = String(scenario.status || "draft");
  const submittedAt = scenario.submitted_at != null;
  const sentAt = scenario.sent_at != null;
  return (
    status === "sent_for_approval" ||
    status === "submitted" ||
    (status === "approved" && sentAt) ||
    (status === "in_review" && submittedAt)
  );
}

function statusMeta(scenario: Scenario) {
  const status = String(scenario.status || scenario.state || "draft");
  switch (status) {
    case "revision_requested":
      return {
        label: "Revize istendi",
        bg: "#F9731622",
        border: "#F9731655",
        text: "#FDBA74",
        dot: colors.warn,
      };
    case "sent_for_approval":
    case "submitted":
      return {
        label: "Merkeze iletildi",
        bg: "#4C8DFF22",
        border: "#4C8DFF55",
        text: "#93B5FF",
        dot: colors.accent,
      };
    case "in_review":
      return {
        label: "Incelemede",
        bg: "#4C8DFF22",
        border: "#4C8DFF55",
        text: "#93B5FF",
        dot: colors.accent,
      };
    case "approved":
      return {
        label: scenario.sent_at ? "Onaylandi" : "Kontrol edildi",
        bg: "#22C55E22",
        border: "#22C55E55",
        text: "#86EFAC",
        dot: colors.success,
      };
    case "draft":
    default:
      return {
        label: status === "draft" ? "Taslak" : status,
        bg: colors.bgElev2,
        border: colors.border,
        text: colors.textDim,
        dot: colors.textMuted,
      };
  }
}

function currencyLabel(scenario: Scenario) {
  if (scenario.input_currency === "LOCAL") {
    const code = scenario.local_currency_code || "LOCAL";
    const fx = Number(scenario.fx_usd_to_local);
    return Number.isFinite(fx) && fx > 0 ? `${code} · Kur ${fx}` : code;
  }
  return "USD";
}

function scenarioProgressValue(scenario: Scenario, progressByScenarioId: Record<string, number | null>) {
  const livePct = progressByScenarioId[String(scenario.id)];
  const pct = Number(livePct ?? scenario.progress_pct ?? 0);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

export default function SchoolScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [progressByScenarioId, setProgressByScenarioId] = useState<Record<string, number | null>>({});
  const [progressWarning, setProgressWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [form, setForm] = useState<ScenarioForm>(() => blankForm());
  const [actionErr, setActionErr] = useState("");
  const [savingScenario, setSavingScenario] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Scenario | null>(null);
  const [deletingScenario, setDeletingScenario] = useState(false);

  const permissionScope = useMemo(
    () => ({
      countryId: user?.country_id ?? null,
      schoolId: id ? Number(id) : null,
    }),
    [id, user?.country_id],
  );
  const schoolClosed = school?.status === "closed";
  const canCreateScenario =
    Boolean(id) &&
    can(user, "scenario.create", "write", permissionScope) &&
    (!schoolClosed || user?.role === "admin");
  const canEditScenario = Boolean(id) && can(user, "scenario.plan_edit", "write", permissionScope);
  const canDeleteScenario = Boolean(id) && can(user, "scenario.delete", "write", permissionScope);

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    try {
      const [schoolResult, scenarioResult] = await Promise.all([
        api.getSchool(id),
        api.listScenarios(id, { fields: "all", order: "academic_year:desc" }),
      ]);
      setSchool(schoolResult);
      const scenarioItems = scenarioResult.items;
      setScenarios(scenarioItems);

      const progressTargets = scenarioItems.slice(0, 50);
      if (!progressTargets.length) {
        setProgressByScenarioId({});
        setProgressWarning("");
        return;
      }

      const progressResults = await Promise.allSettled(
        progressTargets.map(async (scenario) => {
          const snapshot = await api.getScenarioProgress(id, scenario.id);
          const progress = snapshot.progress && typeof snapshot.progress === "object"
            ? (snapshot.progress as Record<string, unknown>)
            : {};
          const pct = Number(progress.pct ?? scenario.progress_pct ?? 0);
          return [String(scenario.id), Number.isFinite(pct) ? pct : null] as const;
        }),
      );
      const nextProgress: Record<string, number | null> = {};
      progressResults.forEach((result, index) => {
        const fallbackId = String(progressTargets[index]?.id || "");
        if (result.status === "fulfilled") {
          nextProgress[result.value[0]] = result.value[1];
        } else if (fallbackId) {
          nextProgress[fallbackId] = null;
        }
      });
      setProgressByScenarioId(nextProgress);
      setProgressWarning(
        scenarioItems.length > progressTargets.length
          ? `Ilk ${progressTargets.length} senaryo icin ilerleme gosteriliyor.`
          : "",
      );
    } catch (e: any) {
      setErr(e?.message || "Yuklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setFormMode("create");
    setSelectedScenario(null);
    setForm(blankForm());
    setActionErr("");
    setFormOpen(true);
  }

  function openEdit(scenario: Scenario) {
    if (isScenarioLocked(scenario)) {
      setErr("Senaryo onay surecinde oldugu icin duzenlenemez.");
      return;
    }
    setFormMode("edit");
    setSelectedScenario(scenario);
    setForm(formFromScenario(scenario));
    setActionErr("");
    setFormOpen(true);
  }

  function validateForm() {
    const name = form.name.trim();
    const academicYear = form.academicYear.trim();
    if (!name) return "Senaryo adi zorunludur.";
    if (!validAcademicYear(academicYear)) return "Akademik yil YYYY veya YYYY-YYYY formatinda olmalidir.";

    const usesLocalCurrency =
      formMode === "create" ? form.inputCurrency === "LOCAL" : selectedScenario?.input_currency === "LOCAL";
    if (usesLocalCurrency) {
      const code = normalizeCurrencyCode(form.localCurrencyCode);
      const fx = Number(form.fxUsdToLocal);
      if (!/^[A-Z]{3}$/.test(code)) return "Yerel para birimi 3 harfli kod olmalidir.";
      if (!Number.isFinite(fx) || fx <= 0) return "Kur degeri 0'dan buyuk olmalidir.";
    }
    return "";
  }

  async function submitScenario() {
    if (!id) return;
    const validation = validateForm();
    if (validation) {
      setActionErr(validation);
      return;
    }

    setSavingScenario(true);
    setActionErr("");
    try {
      const usesLocalCurrency =
        formMode === "create" ? form.inputCurrency === "LOCAL" : selectedScenario?.input_currency === "LOCAL";
      const localCurrencyCode = usesLocalCurrency ? normalizeCurrencyCode(form.localCurrencyCode) : null;
      const fxUsdToLocal = usesLocalCurrency ? Number(form.fxUsdToLocal) : null;

      if (formMode === "create") {
        await api.createScenario(id, {
          name: form.name.trim(),
          academicYear: form.academicYear.trim(),
          inputCurrency: form.inputCurrency,
          localCurrencyCode,
          fxUsdToLocal,
          programType: form.programType,
        });
      } else if (selectedScenario) {
        await api.updateScenario(id, selectedScenario.id, {
          name: form.name.trim(),
          academicYear: form.academicYear.trim(),
          localCurrencyCode: usesLocalCurrency ? localCurrencyCode : undefined,
          fxUsdToLocal: usesLocalCurrency ? fxUsdToLocal : undefined,
        });
      }

      setFormOpen(false);
      setSelectedScenario(null);
      await load();
    } catch (e: any) {
      setActionErr(e?.message || "Senaryo kaydedilemedi.");
    } finally {
      setSavingScenario(false);
    }
  }

  async function confirmDeleteScenario() {
    if (!id || !deleteTarget) return;
    if (isScenarioLocked(deleteTarget)) {
      setActionErr("Senaryo onayda veya onaylandi, silinemez.");
      return;
    }

    setDeletingScenario(true);
    setActionErr("");
    try {
      await api.deleteScenario(id, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setActionErr(e?.message || "Senaryo silinemedi.");
    } finally {
      setDeletingScenario(false);
    }
  }

  const formUsesLocalCurrency =
    formMode === "create" ? form.inputCurrency === "LOCAL" : selectedScenario?.input_currency === "LOCAL";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="school-detail-screen">
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          testID="school-back-button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>OKUL</Text>
          <Text numberOfLines={1} style={styles.headerTitle} testID="school-name">
            {school?.name || "Yukleniyor..."}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={styles.errorWrap}>
          <Card>
            <Text style={{ color: colors.danger, ...font.body }}>{err}</Text>
            <Button
              label="Tekrar Dene"
              icon="refresh-outline"
              variant="secondary"
              onPress={load}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      ) : (
        <FlatList
          data={scenarios}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.md,
          }}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Senaryolar</Text>
                <Text style={styles.sectionSub}>
                  Durum, akademik yil, para birimi ve gider dagitimi bilgileri
                </Text>
              </View>
              {canCreateScenario ? (
                <Pressable
                  onPress={openCreate}
                  style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}
                  testID="scenario-create-button"
                >
                  <Ionicons name="add" size={20} color={colors.primaryText} />
                </Pressable>
              ) : null}
              {schoolClosed ? (
                <View style={styles.closedNotice}>
                  <Ionicons name="lock-closed-outline" size={15} color={colors.warn} />
                  <Text style={styles.closedNoticeText}>Okul kapali. Yeni senaryo yetkisi sinirli olabilir.</Text>
                </View>
              ) : null}
              {progressWarning ? (
                <View style={styles.closedNotice}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.warn} />
                  <Text style={styles.closedNoticeText}>{progressWarning}</Text>
                </View>
              ) : null}
            </View>
          }
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
              icon="layers-outline"
              title="Senaryo bulunamadi"
              subtitle={
                canCreateScenario
                  ? "Bu okul icin ilk senaryoyu olusturabilirsiniz."
                  : "Bu okul icin henuz senaryo olusturulmamis."
              }
            />
          }
          renderItem={({ item }) => {
            const meta = statusMeta(item);
            const locked = isScenarioLocked(item);
            const canEditItem = canEditScenario && !locked;
            const canDeleteItem = canDeleteScenario && !locked;
            const progress = scenarioProgressValue(item, progressByScenarioId);
            return (
              <Pressable
                testID={`scenario-card-${item.id}`}
                onPress={() => router.push(`/scenario/${id}/${item.id}`)}
                style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {item.academic_year || "-"} · {currencyLabel(item)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </View>

                <View style={styles.cardProgress}>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={progress} />
                  </View>
                  <Text style={styles.progressText}>{Math.round(progress)}%</Text>
                </View>

                <View style={styles.badgeRow}>
                  <View style={[styles.stateBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                    <View style={[styles.dot, { backgroundColor: meta.dot }]} />
                    <Text style={[styles.stateText, { color: meta.text }]}>{meta.label}</Text>
                  </View>
                  {item.expense_split_applied ? (
                    <View style={[styles.stateBadge, item.expense_split_stale ? styles.staleBadge : styles.okBadge]}>
                      <Ionicons
                        name={item.expense_split_stale ? "alert-circle-outline" : "git-branch-outline"}
                        size={13}
                        color={item.expense_split_stale ? colors.warn : colors.success}
                      />
                      <Text
                        style={[
                          styles.stateText,
                          { color: item.expense_split_stale ? colors.warn : colors.success, letterSpacing: 0 },
                        ]}
                      >
                        {item.expense_split_stale ? "Dagitim eski" : "Dagitim guncel"}
                      </Text>
                    </View>
                  ) : null}
                  {locked ? (
                    <View style={styles.lockPill}>
                      <Ionicons name="lock-closed-outline" size={13} color={colors.textDim} />
                      <Text style={styles.lockText}>Kilitli</Text>
                    </View>
                  ) : null}
                </View>

                {(canEditScenario || canDeleteScenario) ? (
                  <View style={styles.actionRow}>
                    {canEditScenario ? (
                      <Button
                        label="Duzenle"
                        icon="create-outline"
                        variant="secondary"
                        small
                        disabled={!canEditItem}
                        onPress={() => openEdit(item)}
                        testID={`scenario-edit-${item.id}`}
                      />
                    ) : null}
                    {canDeleteScenario ? (
                      <Button
                        label="Sil"
                        icon="trash-outline"
                        variant="danger"
                        small
                        disabled={!canDeleteItem}
                        onPress={() => {
                          setActionErr("");
                          setDeleteTarget(item);
                        }}
                        testID={`scenario-delete-${item.id}`}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheet
        visible={formOpen}
        onClose={() => {
          if (!savingScenario) setFormOpen(false);
        }}
        title={formMode === "create" ? "Senaryo Olustur" : "Senaryo Duzenle"}
        testID="scenario-form-sheet"
      >
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Input
            label="Senaryo adi"
            value={form.name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            autoCapitalize="words"
            testID="scenario-form-name"
          />
          <Input
            label="Akademik yil"
            value={form.academicYear}
            onChangeText={(value) => setForm((prev) => ({ ...prev, academicYear: value }))}
            placeholder="2026-2027"
            hint="YYYY veya YYYY-YYYY"
            testID="scenario-form-year"
          />

          {formMode === "create" ? (
            <>
              <Text style={styles.inputGroupLabel}>Para birimi</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="USD"
                  active={form.inputCurrency === "USD"}
                  onPress={() => setForm((prev) => ({ ...prev, inputCurrency: "USD" }))}
                  testID="scenario-form-currency-usd"
                />
                <Chip
                  label="LOCAL"
                  active={form.inputCurrency === "LOCAL"}
                  onPress={() => setForm((prev) => ({ ...prev, inputCurrency: "LOCAL" }))}
                  testID="scenario-form-currency-local"
                />
              </View>
              <Text style={styles.inputGroupLabel}>Program tipi</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="Yerel"
                  active={form.programType === "local"}
                  onPress={() => setForm((prev) => ({ ...prev, programType: "local" }))}
                  testID="scenario-form-program-local"
                />
                <Chip
                  label="Uluslararasi"
                  active={form.programType === "international"}
                  onPress={() => setForm((prev) => ({ ...prev, programType: "international" }))}
                  testID="scenario-form-program-international"
                />
              </View>
            </>
          ) : (
            <View style={styles.readOnlyBlock}>
              <Text style={styles.readOnlyLabel}>Para birimi</Text>
              <Text style={styles.readOnlyValue}>{selectedScenario ? currencyLabel(selectedScenario) : "-"}</Text>
            </View>
          )}

          {formUsesLocalCurrency ? (
            <>
              <Input
                label="Yerel para birimi"
                value={form.localCurrencyCode}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, localCurrencyCode: normalizeCurrencyCode(value).slice(0, 3) }))
                }
                autoCapitalize="characters"
                maxLength={3}
                placeholder="TRY"
                testID="scenario-form-local-code"
              />
              <Input
                label="USD kuru"
                value={form.fxUsdToLocal}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fxUsdToLocal: value.replace(/[^\d.]/g, "") }))}
                keyboardType="decimal-pad"
                placeholder="32.50"
                testID="scenario-form-fx"
              />
            </>
          ) : null}

          {actionErr ? <Text style={styles.actionError}>{actionErr}</Text> : null}
          <Button
            label={formMode === "create" ? "Senaryo Olustur" : "Degisiklikleri Kaydet"}
            icon={formMode === "create" ? "add-circle-outline" : "save-outline"}
            onPress={submitScenario}
            loading={savingScenario}
            testID="scenario-form-submit"
          />
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletingScenario) setDeleteTarget(null);
        }}
        title="Senaryo Sil"
        testID="scenario-delete-sheet"
      >
        <View style={styles.sheetBody}>
          <Text style={styles.deleteText}>
            {deleteTarget?.name || "Bu senaryo"} kalici olarak silinecek. Bu islem okul silmez.
          </Text>
          {actionErr ? <Text style={styles.actionError}>{actionErr}</Text> : null}
          <View style={styles.deleteActions}>
            <Button
              label="Vazgec"
              icon="close-outline"
              variant="secondary"
              onPress={() => setDeleteTarget(null)}
              disabled={deletingScenario}
              style={{ flex: 1 }}
            />
            <Button
              label="Sil"
              icon="trash-outline"
              variant="danger"
              onPress={confirmDeleteScenario}
              loading={deletingScenario}
              style={{ flex: 1 }}
              testID="scenario-delete-confirm"
            />
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.text, ...font.h2 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  closedNotice: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F9731644",
    backgroundColor: "#F9731614",
  },
  closedNoticeText: { color: colors.textDim, ...font.small, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorWrap: { padding: spacing.lg },
  card: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { ...font.h3, color: colors.text },
  cardMeta: { color: colors.textDim, ...font.small, marginTop: 4 },
  cardProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
  },
  progressText: { color: colors.textDim, ...font.small, minWidth: 44, textAlign: "right" },
  badgeRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  okBadge: {
    borderColor: "#22C55E55",
    backgroundColor: "#22C55E16",
  },
  staleBadge: {
    borderColor: "#F9731655",
    backgroundColor: "#F9731614",
  },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
  },
  lockText: { color: colors.textDim, ...font.tiny, letterSpacing: 0 },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  stateText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.4 },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  inputGroupLabel: {
    color: colors.textDim,
    ...font.small,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  readOnlyBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  readOnlyLabel: { color: colors.textDim, ...font.small, marginBottom: 4 },
  readOnlyValue: { color: colors.text, ...font.bodyMd },
  actionError: { color: colors.danger, ...font.small, marginBottom: spacing.md },
  deleteText: { color: colors.text, ...font.body, marginBottom: spacing.md },
  deleteActions: { flexDirection: "row", gap: spacing.sm },
});
