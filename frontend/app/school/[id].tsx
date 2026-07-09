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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Scenario, School } from "@/src/api/client";
import { can } from "@/src/auth/permissions";
import { useAuth } from "@/src/auth/AuthContext";
import { ExpenseDistributionSheet } from "@/src/operations/Pr08Sheets";
import { AppThemeColors, alpha, font, radius, shadow, spacing } from "@/src/theme";
import { useAppTheme } from "@/src/theme-provider";
import { BottomSheet } from "@/src/ui/BottomSheet";
import {
  Button,
  Card,
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
import { StickyBackHeader } from "@/src/ui/StickyBackHeader";

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

function statusMeta(scenario: Scenario): { label: string; tone: StatusTone; icon: keyof typeof Ionicons.glyphMap } {
  const status = String(scenario.status || scenario.state || "draft");
  switch (status) {
    case "revision_requested":
      return { label: "Revize istendi", tone: "revision", icon: "alert-circle-outline" };
    case "sent_for_approval":
    case "submitted":
      return { label: "Merkeze iletildi", tone: "review", icon: "paper-plane-outline" };
    case "in_review":
      return { label: "İncelemede", tone: "review", icon: "search-outline" };
    case "approved":
      return {
        label: scenario.sent_at ? "Onaylandı" : "Kontrol edildi",
        tone: "complete",
        icon: "checkmark-circle-outline",
      };
    case "draft":
    default:
      return { label: status === "draft" ? "Taslak" : status, tone: "notStarted", icon: "document-outline" };
  }
}

function currencyLabel(scenario: Scenario) {
  if (scenario.input_currency === "LOCAL") {
    const code = scenario.local_currency_code || "LOCAL";
    const fx = Number(scenario.fx_usd_to_local);
    return Number.isFinite(fx) && fx > 0 ? `${code} • Kur ${fx}` : code;
  }
  return "USD";
}

function programLabel(scenario: Scenario) {
  if (scenario.program_type === "international") return "Uluslararası";
  if (scenario.program_type === "local") return "Yerel";
  return "Program yok";
}

function scenarioProgressValue(scenario: Scenario, progressByScenarioId: Record<string, number | null>) {
  const livePct = progressByScenarioId[String(scenario.id)];
  const pct = Number(livePct ?? scenario.progress_pct ?? 0);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

function scenarioActionLabel(scenario: Scenario, progress: number, locked: boolean) {
  if (locked) return "Onay sürecini takip et";
  if (scenario.expense_split_stale) return "Gider dağıtımını yenile";
  if (progress < 100) return "Eksik modülleri tamamla";
  return "Senaryoyu aç";
}

function schoolLocation(school: School | null) {
  if (!school) return "";
  const parts = [school.city, school.country_name].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Konum bilgisi yok";
}

export default function SchoolScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
  const [distributionTarget, setDistributionTarget] = useState<Scenario | null>(null);

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
  const canExpenseSplit = Boolean(id) && can(user, "scenario.expense_split", "write", permissionScope);
  const canManageAssignments =
    Boolean(id) &&
    user?.role !== "admin" &&
    can(user, "page.manage_permissions", "write", permissionScope);
  const isPrincipal = user?.role === "principal";

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
          const progress =
            snapshot.progress && typeof snapshot.progress === "object"
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
          ? `İlk ${progressTargets.length} senaryo için ilerleme gösteriliyor.`
          : "",
      );
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
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
      setErr("Senaryo onay sürecinde olduğu için düzenlenemez.");
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
    if (!name) return "Senaryo adı zorunludur.";
    if (!validAcademicYear(academicYear)) return "Akademik yıl YYYY veya YYYY-YYYY formatında olmalıdır.";

    const usesLocalCurrency =
      formMode === "create" ? form.inputCurrency === "LOCAL" : selectedScenario?.input_currency === "LOCAL";
    if (usesLocalCurrency) {
      const code = normalizeCurrencyCode(form.localCurrencyCode);
      const fx = Number(form.fxUsdToLocal);
      if (!/^[A-Z]{3}$/.test(code)) return "Yerel para birimi 3 harfli kod olmalıdır.";
      if (!Number.isFinite(fx) || fx <= 0) return "Kur değeri 0'dan büyük olmalıdır.";
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
      setActionErr("Senaryo onayda veya onaylandı, silinemez.");
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

  const averageProgress = scenarios.length
    ? Math.round(
        scenarios.reduce((sum, scenario) => sum + scenarioProgressValue(scenario, progressByScenarioId), 0) /
          scenarios.length,
      )
    : 0;
  const activeScenario = scenarios.find((scenario) => !isScenarioLocked(scenario)) || scenarios[0] || null;
  const activePeriod = activeScenario?.academic_year || "Dönem yok";
  const lockedCount = scenarios.filter(isScenarioLocked).length;
  const staleCount = scenarios.filter((scenario) => scenario.expense_split_stale).length;
  const schoolHeaderRight = canManageAssignments ? (
    <Pressable
      onPress={() => router.push({ pathname: "/manager/schools/[id]/assignments", params: { id: String(id) } })}
      hitSlop={10}
      style={styles.headerActionBtn}
      testID="school-manager-assignments-link"
    >
      <Ionicons name="person-add-outline" size={19} color={colors.primary} />
    </Pressable>
  ) : null;

  return (
    <ScreenScaffold testID="school-detail-screen">
      <StickyBackHeader
        testID="school-back-button"
        onPress={() => router.back()}
        title={school?.name || "Okul"}
        subtitle="Senaryolar"
        right={schoolHeaderRight}
        backgroundColor={colors.bg}
        borderColor={colors.border}
        iconColor={colors.text}
        buttonBackgroundColor={colors.bgElev}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : err ? (
        <View style={styles.errorWrap}>
          <EmptyStateCard
            icon="alert-circle-outline"
            title="Okul yüklenemedi"
            subtitle={err}
            actionLabel="Tekrar Dene"
            onActionPress={load}
          />
        </View>
      ) : (
        <FlatList
          data={scenarios}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: isPrincipal ? spacing.md : spacing.lg,
            paddingBottom: insets.bottom + 32,
            gap: spacing.md,
          }}
          ListHeaderComponent={
            isPrincipal ? null : (
              <View style={styles.listHeader}>
                <GradientHeroCard
                  icon="business-outline"
                  eyebrow={schoolClosed ? "Kapalı okul" : "Okul özeti"}
                  title={school?.name || "-"}
                  subtitle={`${schoolLocation(school)} • ${scenarios.length} senaryo`}
                  metricValue={`${averageProgress}%`}
                  metricLabel="ortalama ilerleme"
                  progress={averageProgress}
                  actionLabel={canCreateScenario ? "Yeni senaryo" : undefined}
                  onAction={canCreateScenario ? openCreate : undefined}
                  footer={
                    <Text style={styles.heroFooterText} numberOfLines={2}>
                      Aktif dönem: {activePeriod}
                      {staleCount ? ` • ${staleCount} gider uyarısı` : ""}
                    </Text>
                  }
                  testID="school-summary-card"
                />

                <View style={styles.statsRow}>
                  <SummaryStat icon="layers-outline" label="Senaryo" value={String(scenarios.length)} />
                  <SummaryStat icon="calendar-outline" label="Dönem" value={activePeriod} />
                  <SummaryStat icon="lock-closed-outline" label="Kilitli" value={String(lockedCount)} />
                </View>

                {schoolClosed ? (
                  <NoticeCard icon="lock-closed-outline" tone="warning">
                    Okul kapalı. Yeni senaryo yetkisi sınırlı olabilir.
                  </NoticeCard>
                ) : null}
                {progressWarning ? (
                  <NoticeCard icon="information-circle-outline" tone="warning">
                    {progressWarning}
                  </NoticeCard>
                ) : null}

                <SectionHeader
                  title="Senaryolar"
                  subtitle="Durum, dönem, para birimi ve gerekli aksiyonlar"
                  right={
                    canCreateScenario ? (
                      <Pressable
                        onPress={openCreate}
                        style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.85 : 1 }]}
                        testID="scenario-create-button"
                      >
                        <Ionicons name="add" size={21} color={colors.primaryText} />
                      </Pressable>
                    ) : null
                  }
                />
              </View>
            )
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
            <EmptyStateCard
              icon="layers-outline"
              title="Senaryo bulunamadı"
              subtitle={
                canCreateScenario
                  ? "Bu okul için ilk senaryoyu oluşturabilirsiniz."
                  : "Bu okul için henüz senaryo oluşturulmamış."
              }
              actionLabel={canCreateScenario ? "Senaryo Oluştur" : undefined}
              onActionPress={canCreateScenario ? openCreate : undefined}
            />
          }
          renderItem={({ item }) => {
            const locked = isScenarioLocked(item);
            const canEditItem = canEditScenario && !locked;
            const canDeleteItem = canDeleteScenario && !locked;
            const progress = scenarioProgressValue(item, progressByScenarioId);
            return (
              <ScenarioCard
                scenario={item}
                progress={progress}
                locked={locked}
                canEditScenario={canEditScenario}
                canEditItem={canEditItem}
                canDeleteScenario={canDeleteScenario}
                canDeleteItem={canDeleteItem}
                canExpenseSplit={canExpenseSplit}
                minimal={isPrincipal}
                onOpen={() => router.push(`/scenario/${id}/${item.id}`)}
                onExpenseSplit={() => {
                  setActionErr("");
                  setDistributionTarget(item);
                }}
                onEdit={() => openEdit(item)}
                onDelete={() => {
                  setActionErr("");
                  setDeleteTarget(item);
                }}
              />
            );
          }}
        />
      )}

      <BottomSheet
        visible={formOpen}
        onClose={() => {
          if (!savingScenario) setFormOpen(false);
        }}
        title={formMode === "create" ? "Senaryo Oluştur" : "Senaryo Düzenle"}
        testID="scenario-form-sheet"
      >
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Input
            label="Senaryo adı"
            value={form.name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            autoCapitalize="words"
            testID="scenario-form-name"
          />
          <Input
            label="Akademik yıl"
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
                  label="Uluslararası"
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
            label={formMode === "create" ? "Senaryo Oluştur" : "Değişiklikleri Kaydet"}
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
            {deleteTarget?.name || "Bu senaryo"} kalıcı olarak silinecek. Bu işlem okul silmez.
          </Text>
          {actionErr ? <Text style={styles.actionError}>{actionErr}</Text> : null}
          <View style={styles.deleteActions}>
            <Button
              label="Vazgeç"
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

      <ExpenseDistributionSheet
        visible={Boolean(distributionTarget)}
        sourceScenario={distributionTarget}
        sourceSchoolId={id || null}
        sourceSchoolName={school?.name || null}
        onClose={() => setDistributionTarget(null)}
        onApplied={load}
        onReverted={load}
      />
    </ScreenScaffold>
  );
}

function SummaryStat({
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
    <Card style={summaryStyles.card}>
      <View style={[summaryStyles.icon, { backgroundColor: alpha(colors.primary, 0.12) }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[summaryStyles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[summaryStyles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </Card>
  );
}

function NoticeCard({
  icon,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: "warning";
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const color = tone === "warning" ? colors.warn : colors.primary;
  return (
    <View
      style={[
        noticeStyles.wrap,
        {
          borderColor: alpha(color, 0.28),
          backgroundColor: alpha(color, 0.1),
        },
      ]}
    >
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[noticeStyles.text, { color: colors.textDim }]}>{children}</Text>
    </View>
  );
}

function ScenarioCard({
  scenario,
  progress,
  locked,
  canEditScenario,
  canEditItem,
  canDeleteScenario,
  canDeleteItem,
  canExpenseSplit,
  minimal = false,
  onOpen,
  onExpenseSplit,
  onEdit,
  onDelete,
}: {
  scenario: Scenario;
  progress: number;
  locked: boolean;
  canEditScenario: boolean;
  canEditItem: boolean;
  canDeleteScenario: boolean;
  canDeleteItem: boolean;
  canExpenseSplit: boolean;
  minimal?: boolean;
  onOpen: () => void;
  onExpenseSplit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const meta = statusMeta(scenario);
  const accent =
    meta.tone === "complete"
      ? colors.success
      : meta.tone === "revision"
        ? colors.warn
        : meta.tone === "review"
          ? colors.primary
          : colors.accent;
  const actionLabel = scenarioActionLabel(scenario, progress, locked);

  if (minimal) {
    return (
      <Pressable
        testID={`scenario-card-${scenario.id}`}
        onPress={onOpen}
        style={({ pressed }) => [
          scenarioStyles.minimalCard,
          {
            backgroundColor: colors.bgElev,
            borderColor: colors.border,
            opacity: pressed ? 0.9 : 1,
            transform: [{ translateY: pressed ? 1 : 0 }],
          },
          !isDark && shadow.card,
        ]}
      >
        <View style={scenarioStyles.minimalTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[scenarioStyles.title, { color: colors.text }]} numberOfLines={2}>
              {scenario.name}
            </Text>
            <Text style={[scenarioStyles.meta, { color: colors.textDim }]} numberOfLines={1}>
              {scenario.academic_year || "-"} • {currencyLabel(scenario)} • {programLabel(scenario)}
            </Text>
          </View>
          <StatusPill label={meta.label} tone={meta.tone} icon={meta.icon} style={scenarioStyles.minimalStatus} />
        </View>

        <View style={scenarioStyles.minimalProgress}>
          <View style={scenarioStyles.minimalProgressTrack}>
            <ProgressBar value={progress} height={9} />
          </View>
          <Text style={[scenarioStyles.minimalPercent, { color: colors.text }]}>{Math.round(progress)}%</Text>
        </View>

        <View style={[scenarioStyles.minimalFooter, { borderTopColor: colors.border }]}>
          <Text style={[scenarioStyles.actionHint, { color: colors.textDim, flex: 1 }]} numberOfLines={2}>
            {actionLabel}
          </Text>
          <View style={[scenarioStyles.minimalCta, { backgroundColor: locked ? colors.bgElev2 : colors.primary, borderColor: locked ? colors.borderStrong : colors.primary }]}>
            <Text style={[scenarioStyles.minimalCtaText, { color: locked ? colors.primary : colors.primaryText }]}>
              {locked ? "Takip et" : "Devam et"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={`scenario-card-${scenario.id}`}
      onPress={onOpen}
      style={({ pressed }) => [
        scenarioStyles.card,
        {
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
        !isDark && shadow.card,
      ]}
    >
      <View style={[scenarioStyles.stripe, { backgroundColor: accent }]} />
      <View style={scenarioStyles.body}>
        <View style={scenarioStyles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[scenarioStyles.title, { color: colors.text }]} numberOfLines={2}>
              {scenario.name}
            </Text>
            <Text style={[scenarioStyles.meta, { color: colors.textDim }]} numberOfLines={1}>
              {scenario.academic_year || "-"} • {currencyLabel(scenario)} • {programLabel(scenario)}
            </Text>
          </View>
          <StatusPill label={meta.label} tone={meta.tone} icon={meta.icon} />
        </View>

        <View style={scenarioStyles.packageRow}>
          <View style={scenarioStyles.packageMetric}>
            <Text style={[scenarioStyles.packageValue, { color: colors.text }]}>{Math.round(progress)}%</Text>
            <Text style={[scenarioStyles.packageLabel, { color: colors.textDim }]}>tamamlanma</Text>
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <ProgressBar value={progress} height={7} />
            <Text style={[scenarioStyles.actionHint, { color: colors.textDim }]} numberOfLines={2}>
              {actionLabel}
            </Text>
          </View>
        </View>

        <View style={scenarioStyles.badgeRow}>
          {scenario.expense_split_applied ? (
            <StatusPill
              label={scenario.expense_split_stale ? "Dağıtım eski" : "Dağıtım güncel"}
              tone={scenario.expense_split_stale ? "warning" : "success"}
              icon={scenario.expense_split_stale ? "alert-circle-outline" : "git-branch-outline"}
            />
          ) : null}
          {locked ? <StatusPill label="Kilitli" tone="muted" icon="lock-closed-outline" /> : null}
          <StatusPill label={`Güncelleme ${formatDate(scenario.updated_at || scenario.created_at)}`} tone="muted" showDot={false} />
        </View>
      </View>

      <View style={[scenarioStyles.footer, { backgroundColor: alpha(accent, 0.1), borderTopColor: colors.border }]}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [
            scenarioStyles.openCta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <Text style={[scenarioStyles.openCtaText, { color: colors.primaryText }]}>Senaryoyu aç</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </Pressable>

        {(canEditScenario || canDeleteScenario || canExpenseSplit) ? (
          <View style={scenarioStyles.actionRow}>
            {canExpenseSplit ? (
              <Button
                label="Gider"
                icon="git-branch-outline"
                variant="secondary"
                small
                onPress={onExpenseSplit}
                testID={`scenario-expense-split-${scenario.id}`}
              />
            ) : null}
            {canEditScenario ? (
              <Button
                label="Düzenle"
                icon="create-outline"
                variant="secondary"
                small
                disabled={!canEditItem}
                onPress={onEdit}
                testID={`scenario-edit-${scenario.id}`}
              />
            ) : null}
            {canDeleteScenario ? (
              <Button
                label="Sil"
                icon="trash-outline"
                variant="danger"
                small
                disabled={!canDeleteItem}
                onPress={onDelete}
                testID={`scenario-delete-${scenario.id}`}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const summaryStyles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: spacing.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: { ...font.tiny },
  value: { ...font.bodyMd, textAlign: "center" },
});

const noticeStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { ...font.small, flex: 1, lineHeight: 19 },
});

const scenarioStyles = StyleSheet.create({
  minimalCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
  },
  minimalTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  minimalStatus: { maxWidth: 142 },
  minimalProgress: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  minimalProgressTrack: { flex: 1, minWidth: 0 },
  minimalPercent: { ...font.small, width: 42, flexShrink: 0, textAlign: "right", fontWeight: "900" },
  minimalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  minimalCta: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  minimalCtaText: { ...font.small, fontWeight: "900" },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  stripe: { height: 8 },
  body: { padding: spacing.md, gap: spacing.md },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { ...font.h3, fontSize: 18 },
  meta: { ...font.small, marginTop: 4 },
  packageRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  packageMetric: { width: 78 },
  packageValue: { ...font.h2, fontSize: 24 },
  packageLabel: { ...font.tiny, marginTop: 2 },
  actionHint: { ...font.small },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  openCta: {
    minHeight: 42,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
  },
  openCtaText: { ...font.bodyMd, fontWeight: "900" },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});

function createStyles(colors: AppThemeColors, isDark: boolean) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElev,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      ...(!isDark ? shadow.soft : {}),
    },
    headerActionBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElev,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      ...(!isDark ? shadow.soft : {}),
    },
    headerLabel: { color: colors.textMuted, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
    headerTitle: { color: colors.text, ...font.h3, marginTop: 2 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorWrap: { padding: spacing.lg },
    listHeader: { gap: spacing.lg, marginBottom: spacing.xs },
    principalListHeader: { marginBottom: spacing.xs },
    heroFooterText: { color: "rgba(255,255,255,0.86)", ...font.small, lineHeight: 18 },
    statsRow: { flexDirection: "row", gap: spacing.sm },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
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
      borderWidth: StyleSheet.hairlineWidth,
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
}
