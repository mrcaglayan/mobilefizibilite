// PR 03B scenario shell: production-safe workflow overview and gated actions.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  Inputs,
  Report,
  Scenario,
  ScenarioContext,
  ScenarioProgressResponse,
  User,
  WorkItem,
  api,
} from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { can } from "@/src/auth/permissions";
import {
  areRequiredWorkItemsApproved,
  canForwardScenario,
  canReadWorkItem,
  canReviewWorkItems,
  canSubmitWorkItemState,
  canWriteWorkItem,
  buildModifiedResourcesFromPaths,
  getRequiredWorkIds,
  getSubmitResource,
  isHeadquarterScenario,
  type WorkId,
} from "@/src/scenario/workflow";
import { toDirtyInputPath } from "@/src/scenario/patch";
import { saveScenarioModule } from "@/src/scenario/saveHarness";
import { TemelBilgilerEditor } from "@/src/scenario/TemelBilgilerEditor";
import {
  temelBilgilerSaveAdapter,
  TemelBilgilerDraft,
} from "@/src/scenario/temelBilgilerAdapter";
import { colors, font, formatInt, formatMoney, formatPct, radius, spacing } from "@/src/theme";
import { Button, Card, Chip, ProgressBar, Row } from "@/src/ui/components";

type ModuleKey = WorkId | "rapor" | "detayli_rapor";

type ProgressTab = {
  key: string;
  label?: string;
  pct?: number | null;
  done?: boolean;
  missingPreview?: string;
  missingLines?: string[];
};

type ProgressModel = {
  pct: number;
  completedCount?: number;
  totalCount?: number;
  tabs: ProgressTab[];
  missingDetailsLines: string[];
};

type ModuleDef = {
  key: ModuleKey;
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  workId?: WorkId;
  progressKeys: string[];
  readResource?: string;
};

type ActionBusy = "save" | "submit" | "approve" | "revise" | "send" | null;

const MODULES: ModuleDef[] = [
  {
    key: "temel_bilgiler",
    label: "Temel Bilgiler",
    shortLabel: "Temel",
    icon: "document-text-outline",
    workId: "temel_bilgiler",
    progressKeys: ["temelBilgiler"],
  },
  {
    key: "kapasite",
    label: "Kapasite",
    shortLabel: "Kapasite",
    icon: "layers-outline",
    workId: "kapasite",
    progressKeys: ["kapasite"],
  },
  {
    key: "norm.ders_dagilimi",
    label: "Norm",
    shortLabel: "Norm",
    icon: "grid-outline",
    workId: "norm.ders_dagilimi",
    progressKeys: ["gradesPlan", "norm"],
  },
  {
    key: "ik.local_staff",
    label: "IK",
    shortLabel: "IK",
    icon: "people-outline",
    workId: "ik.local_staff",
    progressKeys: ["ik"],
  },
  {
    key: "gelirler.unit_fee",
    label: "Gelirler",
    shortLabel: "Gelir",
    icon: "trending-up-outline",
    workId: "gelirler.unit_fee",
    progressKeys: ["gelirler"],
  },
  {
    key: "giderler.isletme",
    label: "Giderler",
    shortLabel: "Gider",
    icon: "trending-down-outline",
    workId: "giderler.isletme",
    progressKeys: ["giderler"],
  },
  {
    key: "rapor",
    label: "Rapor",
    shortLabel: "Rapor",
    icon: "pie-chart-outline",
    progressKeys: [],
    readResource: "page.rapor",
  },
  {
    key: "detayli_rapor",
    label: "Detayli Rapor",
    shortLabel: "Detay",
    icon: "document-outline",
    progressKeys: [],
    readResource: "page.detayli_rapor",
  },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
}

function scenarioLocked(scenario?: Scenario | null) {
  const status = String(scenario?.status || "draft");
  const submittedAt = scenario?.submitted_at != null;
  const sentAt = scenario?.sent_at != null;
  return (
    status === "sent_for_approval" ||
    status === "submitted" ||
    (status === "approved" && sentAt) ||
    (status === "in_review" && submittedAt)
  );
}

function scenarioStatusMeta(scenario?: Scenario | null) {
  const status = String(scenario?.status || "draft");
  switch (status) {
    case "revision_requested":
      return { label: "Revizyon istendi", color: colors.warn, bg: "#F9731622", border: "#F9731655" };
    case "in_review":
      return { label: "Incelemede", color: "#93B5FF", bg: "#4C8DFF22", border: "#4C8DFF55" };
    case "sent_for_approval":
    case "submitted":
      return { label: "Merkeze iletildi", color: colors.primary, bg: "#F5B30122", border: "#F5B30155" };
    case "approved":
      return {
        label: scenario?.sent_at ? "Onaylandi" : "Kontrol edildi",
        color: colors.success,
        bg: "#22C55E22",
        border: "#22C55E55",
      };
    case "draft":
    default:
      return { label: status === "draft" ? "Taslak" : status, color: colors.textDim, bg: colors.bgElev2, border: colors.border };
  }
}

function workStateMeta(state?: string | null) {
  switch (String(state || "not_started")) {
    case "submitted":
      return { label: "Incelemede", color: colors.primary, icon: "time-outline" as const, locked: true };
    case "approved":
      return { label: "Onaylandi", color: colors.success, icon: "checkmark-circle-outline" as const, locked: true };
    case "needs_revision":
      return { label: "Revizyon", color: colors.warn, icon: "return-up-back-outline" as const, locked: false };
    case "in_progress":
      return { label: "Calisiliyor", color: colors.accent, icon: "create-outline" as const, locked: false };
    case "not_started":
    default:
      return { label: "Baslamadi", color: colors.textDim, icon: "ellipse-outline" as const, locked: false };
  }
}

function normalizeProgress(payload?: ScenarioProgressResponse | null): ProgressModel | null {
  const progress = payload?.progress && typeof payload.progress === "object"
    ? (payload.progress as Record<string, unknown>)
    : null;
  if (!progress) return null;
  return {
    pct: num(progress.pct),
    completedCount: progress.completedCount == null ? undefined : num(progress.completedCount),
    totalCount: progress.totalCount == null ? undefined : num(progress.totalCount),
    tabs: asArray(progress.tabs).map((tab) => asObject(tab)) as ProgressTab[],
    missingDetailsLines: asArray(progress.missingDetailsLines).map((line) => String(line)).filter(Boolean),
  };
}

function progressForModule(module: ModuleDef, progress: ProgressModel | null) {
  if (!progress || !module.progressKeys.length) {
    return { pct: null as number | null, done: false, missingLines: [] as string[] };
  }
  const tabs = progress.tabs.filter((tab) => module.progressKeys.includes(String(tab.key)));
  if (!tabs.length) return { pct: null, done: false, missingLines: [] };
  const pct = Math.round(tabs.reduce((sum, tab) => sum + num(tab.pct), 0) / tabs.length);
  const done = tabs.every((tab) => tab.done === true);
  const missingLines = tabs.flatMap((tab) => {
    const lines = asArray(tab.missingLines).map((line) => String(line)).filter(Boolean);
    if (lines.length) return lines;
    return tab.missingPreview ? [String(tab.missingPreview)] : [];
  });
  return { pct, done, missingLines: Array.from(new Set(missingLines)).slice(0, 8) };
}

function resolveCurrency(scenario?: Scenario | null) {
  if (scenario?.input_currency === "LOCAL") return scenario.local_currency_code || "LOCAL";
  return "USD";
}

function countObjectKeys(value: unknown) {
  return Object.keys(asObject(value)).length;
}

function countEnabledKademeler(inputs?: Inputs | null) {
  const raw = asObject(inputs?.temelBilgiler).kademeler;
  if (Array.isArray(raw)) return raw.length;
  const obj = asObject(raw);
  return Object.values(obj).filter((value) => {
    if (value && typeof value === "object" && "enabled" in value) return Boolean((value as { enabled?: unknown }).enabled);
    return Boolean(value);
  }).length;
}

function countTuitionRows(inputs?: Inputs | null) {
  return asArray(asObject(asObject(inputs?.gelirler).tuition).rows).length;
}

function countIncomeRows(inputs?: Inputs | null, key = "") {
  const rows = asArray(asObject(asObject(inputs?.gelirler)[key]).rows);
  return rows.length;
}

function countExpenseItems(inputs?: Inputs | null, key = "") {
  return countObjectKeys(asObject(asObject(asObject(inputs?.giderler)[key]).items));
}

function countCurriculumEntries(norm: unknown): number {
  const years = asObject(asObject(norm).years);
  return Object.values(years).reduce<number>((sum, year) => {
    const curriculum = asObject(asObject(year).curriculumWeeklyHours);
    return sum + Object.values(curriculum).reduce<number>((inner, grade) => inner + countObjectKeys(grade), 0);
  }, 0);
}

export default function ScenarioScreen() {
  const { schoolId, scenarioId } = useLocalSearchParams<{ schoolId: string; scenarioId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ModuleKey>("temel_bilgiler");
  const [context, setContext] = useState<ScenarioContext | null>(null);
  const [progressRaw, setProgressRaw] = useState<ScenarioProgressResponse | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [requiredWorkIds, setRequiredWorkIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const [metaWarning, setMetaWarning] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<ActionBusy>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [revisionComment, setRevisionComment] = useState("");
  const [dirtyResources, setDirtyResources] = useState<string[]>([]);

  const progress = useMemo(() => normalizeProgress(progressRaw), [progressRaw]);
  const scenario = context?.scenario || null;
  const inputs = context?.inputs || null;
  const locked = scenarioLocked(scenario);
  const statusMeta = scenarioStatusMeta(scenario);
  const effectiveRequiredWorkIds = useMemo(() => getRequiredWorkIds(inputs, requiredWorkIds), [inputs, requiredWorkIds]);
  const requiredSet = useMemo(() => new Set(effectiveRequiredWorkIds), [effectiveRequiredWorkIds]);
  const isHeadquarter = isHeadquarterScenario(inputs);
  const permissionScope = useMemo(
    () => ({
      countryId: user?.country_id ?? null,
      schoolId: schoolId ?? null,
    }),
    [schoolId, user?.country_id],
  );
  const visibleModules = useMemo(
    () =>
      MODULES.filter((module) => {
        if (module.workId) return canReadWorkItem(user, module.workId, permissionScope);
        if (module.readResource) return can(user, module.readResource, "read", permissionScope);
        return true;
      }),
    [permissionScope, user],
  );
  const dirty = dirtyResources.length > 0;

  const load = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    setErr("");
    setMetaWarning("");
    setActionMessage("");
    try {
      const contextResult = await api.getScenarioContext(schoolId, scenarioId);
      setContext(contextResult);

      const [progressResult, workResult] = await Promise.allSettled([
        api.getScenarioProgress(schoolId, scenarioId),
        api.listWorkItems(schoolId, scenarioId),
      ]);

      if (progressResult.status === "fulfilled") {
        setProgressRaw(progressResult.value);
      } else {
        setProgressRaw(null);
        setMetaWarning("Ilerleme bilgisi alinamadi.");
      }

      if (workResult.status === "fulfilled") {
        setWorkItems(workResult.value.workItems);
        setRequiredWorkIds(getRequiredWorkIds(contextResult.inputs, workResult.value.requiredWorkIds));
      } else {
        setWorkItems([]);
        setRequiredWorkIds(getRequiredWorkIds(contextResult.inputs));
        setMetaWarning((prev) => prev || "Is akisi bilgisi alinamadi.");
      }
    } catch (e: any) {
      setErr(e?.message || "Senaryo yuklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId, scenarioId]);

  const loadReport = useCallback(async () => {
    if (!schoolId || !scenarioId) return;
    setReportLoading(true);
    try {
      const data = await api.getScenarioReport(schoolId, scenarioId);
      setReport(data);
    } catch (e: any) {
      setReport({
        currency: resolveCurrency(scenario),
        kpis: {},
        gelirDagilim: [],
        giderDagilim: [],
        disabledMessage: e?.message || "Rapor yuklenemedi.",
      });
    } finally {
      setReportLoading(false);
    }
  }, [schoolId, scenarioId, scenario]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab === "rapor" && !report && !reportLoading) {
      loadReport();
    }
  }, [activeTab, loadReport, report, reportLoading]);

  useEffect(() => {
    if (visibleModules.length && !visibleModules.some((module) => module.key === activeTab)) {
      if (dirty) {
        setActionMessage("Once degisiklikleri kaydedin veya vazgecin.");
        return;
      }
      setActiveTab(visibleModules[0].key);
    }
  }, [activeTab, dirty, visibleModules]);

  const activeModule = visibleModules.find((module) => module.key === activeTab) || visibleModules[0] || MODULES[0];
  const activeWorkItem = activeModule.workId
    ? workItems.find((item) => String(item.work_id) === activeModule.workId)
    : undefined;
  const activeModuleProgress = progressForModule(activeModule, progress);
  const role = String(user?.role || "");
  const scenarioStatus = String(scenario?.status || "draft");
  const activeRequired = activeModule.workId ? requiredSet.has(activeModule.workId) : false;
  const activeCanWrite = activeModule.workId ? canWriteWorkItem(user, activeModule.workId, permissionScope) : false;
  const allRequiredApproved = areRequiredWorkItemsApproved(workItems, effectiveRequiredWorkIds);
  const canShowSubmit =
    visibleModules.length > 0 &&
    Boolean(activeModule.workId) &&
    ["admin", "principal", "hr", "manager", "accountant"].includes(role);
  const submitBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!activeModule.workId) {
      blockers.push("Gonderilecek modul yok.");
      return blockers;
    }
    if (!["draft", "in_review", "revision_requested"].includes(scenarioStatus)) {
      blockers.push("Senaryo bu durumda modul gonderimine kapali.");
    }
    if (!activeRequired) blockers.push("HQ senaryoda bu modul zorunlu degil.");
    if (!activeCanWrite) blockers.push("Bu modulu gonderme yetkiniz yok.");
    if (!canSubmitWorkItemState(activeWorkItem)) blockers.push("Modul zaten incelemede veya onayli.");
    if (!activeModuleProgress.done) blockers.push("Modul ilerlemesi tamamlanmali.");
    if (dirty) blockers.push("Once degisiklikleri kaydedin.");
    if (locked) blockers.push("Senaryo kilitli.");
    return blockers;
  }, [
    activeCanWrite,
    activeModule.workId,
    activeModuleProgress.done,
    activeRequired,
    activeWorkItem,
    dirty,
    locked,
    scenarioStatus,
  ]);
  const canSubmitActive = canShowSubmit && submitBlockers.length === 0;
  const canReviewActive =
    Boolean(activeModule.workId) &&
    String(activeWorkItem?.state || "") === "submitted" &&
    canReviewWorkItems(user, permissionScope) &&
    !locked;
  const showSendForApproval = canForwardScenario(user);
  const sendBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!showSendForApproval) return blockers;
    if (scenarioStatus !== "approved") blockers.push("Once tum zorunlu moduller onaylanmali.");
    if (scenario?.sent_at) blockers.push("Senaryo zaten merkeze iletilmis.");
    if (!scenario?.checked_at) blockers.push("Yonetici kontrol tarihi bekleniyor.");
    if (!allRequiredApproved) blockers.push("Zorunlu is kalemleri onayli degil.");
    if (num(progress?.pct) < 100) blockers.push("Ilerleme %100 olmali.");
    if (dirty) blockers.push("Once degisiklikleri kaydedin.");
    if (locked) blockers.push("Senaryo kilitli.");
    return blockers;
  }, [allRequiredApproved, dirty, locked, progress?.pct, scenario?.checked_at, scenario?.sent_at, scenarioStatus, showSendForApproval]);
  const canSendForApproval = showSendForApproval && sendBlockers.length === 0;
  const showAdminApprovalLink = role === "admin" && scenarioStatus === "sent_for_approval";
  const footerBlocker =
    actionMessage ||
    submitBlockers[0] ||
    sendBlockers[0] ||
    "Bu modulde islem yapilamiyor veya once engeller giderilmeli.";

  const changeTab = useCallback(
    (nextTab: ModuleKey) => {
      if (activeTab === nextTab) return;
      if (dirty) {
        setActionMessage("Once degisiklikleri kaydedin veya vazgecin.");
        return;
      }
      setActionMessage("");
      setActiveTab(nextTab);
    },
    [activeTab, dirty],
  );

  const refreshScenario = useCallback(() => {
    if (dirty) {
      setActionMessage("Yenilemeden once degisiklikleri kaydedin veya vazgecin.");
      return;
    }
    load();
  }, [dirty, load]);

  const refreshScenarioFromPull = useCallback(() => {
    if (dirty) {
      setActionMessage("Yenilemeden once degisiklikleri kaydedin veya vazgecin.");
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    load();
  }, [dirty, load]);

  const goBack = useCallback(() => {
    if (dirty) {
      setActionMessage("Once degisiklikleri kaydedin veya vazgecin.");
      return;
    }
    router.back();
  }, [dirty, router]);

  const handleSubmitActive = useCallback(async () => {
    if (!schoolId || !scenarioId || !activeModule.workId || !canSubmitActive) return;
    setActionBusy("submit");
    setActionMessage("");
    try {
      await api.submitWorkItem(schoolId, scenarioId, activeModule.workId, {
        resource: getSubmitResource(activeModule.workId),
      });
      await load();
      setActionMessage("Modul incelemeye gonderildi.");
    } catch (e: any) {
      setActionMessage(e?.message || "Modul gonderilemedi.");
    } finally {
      setActionBusy(null);
    }
  }, [activeModule.workId, canSubmitActive, load, scenarioId, schoolId]);

  const handleTemelDirtyPathsChange = useCallback((paths: string[]) => {
    const dirtyInputPaths = paths.map((path) => toDirtyInputPath(path));
    setDirtyResources(buildModifiedResourcesFromPaths(dirtyInputPaths));
  }, []);

  const handleSaveTemelBilgiler = useCallback(
    async (draft: TemelBilgilerDraft) => {
      if (!schoolId || !scenarioId || !inputs) return;
      setActionBusy("save");
      setActionMessage("");
      try {
        await saveScenarioModule({
          schoolId,
          scenarioId,
          adapter: temelBilgilerSaveAdapter,
          draft,
          currentInputs: inputs,
        });
        setDirtyResources([]);
        await load();
        setActionMessage("Temel Bilgiler kaydedildi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Temel Bilgiler kaydedilemedi.");
        throw e;
      } finally {
        setActionBusy(null);
      }
    },
    [inputs, load, scenarioId, schoolId],
  );

  const handleReviewActive = useCallback(
    async (action: "approve" | "revise") => {
      if (!schoolId || !scenarioId || !activeModule.workId || !canReviewActive) return;
      setActionBusy(action === "approve" ? "approve" : "revise");
      setActionMessage("");
      try {
        await api.reviewWorkItem(schoolId, scenarioId, activeModule.workId, {
          action,
          comment: action === "revise" ? revisionComment.trim() || undefined : undefined,
        });
        await load();
        if (action === "revise") setRevisionComment("");
        setActionMessage(action === "approve" ? "Modul onaylandi." : "Revizyon istendi.");
      } catch (e: any) {
        setActionMessage(e?.message || "Islem basarisiz.");
      } finally {
        setActionBusy(null);
      }
    },
    [activeModule.workId, canReviewActive, load, revisionComment, scenarioId, schoolId],
  );

  const handleSendForApproval = useCallback(async () => {
    if (!schoolId || !scenarioId || !canSendForApproval) return;
    setActionBusy("send");
    setActionMessage("");
    try {
      const response = await api.sendForApproval(schoolId, scenarioId);
      if (response.scenario) {
        setContext((prev) => (prev ? { ...prev, scenario: { ...prev.scenario, ...response.scenario } } : prev));
      }
      await load();
      setActionMessage("Senaryo merkeze iletildi.");
    } catch (e: any) {
      const reasons = Array.isArray(e?.data?.reasons) ? e.data.reasons.filter(Boolean) : [];
      setActionMessage(reasons.length ? `Merkeze iletilemez: ${reasons.join(", ")}` : e?.message || "Iletme basarisiz.");
    } finally {
      setActionBusy(null);
    }
  }, [canSendForApproval, load, scenarioId, schoolId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="scenario-screen">
      <View style={styles.header}>
        <Pressable
          testID="scenario-back-button"
          onPress={goBack}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>SENARYO</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {scenario?.name || "Senaryo"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {scenario?.academic_year || "-"} · {resolveCurrency(scenario)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}>
          <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>
      </View>

      {err ? (
        <View style={styles.errorWrap}>
          <Card>
            <Text style={styles.errorText}>{err}</Text>
            <Button
              label="Tekrar Dene"
              icon="refresh-outline"
              variant="secondary"
              onPress={() => {
                setLoading(true);
                load();
              }}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      ) : (
        <>
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshScenarioFromPull}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={{
              paddingBottom: insets.bottom + 180,
            }}
          >
            <View style={styles.summaryWrap}>
              <ScenarioSummary
                progress={progress}
                requiredCount={requiredSet.size}
                isHeadquarter={isHeadquarter}
                locked={locked}
                metaWarning={metaWarning}
              />
            </View>

            <View style={styles.tabRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabContent}
              >
                {visibleModules.map((module) => {
                  const required = module.workId ? requiredSet.has(module.workId) : false;
                  return (
                    <Chip
                      key={module.key}
                      label={required || !module.workId ? module.shortLabel : `${module.shortLabel} Ops.`}
                      active={activeTab === module.key}
                      onPress={() => changeTab(module.key)}
                      testID={`tab-${module.key}`}
                    />
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.body}>
              {!visibleModules.length ? (
                <NoAccessPanel />
              ) : activeTab === "rapor" ? (
                <ReportPanel
                  report={report}
                  loading={reportLoading}
                  onReload={loadReport}
                  currency={resolveCurrency(scenario)}
                />
              ) : activeTab === "detayli_rapor" ? (
                <DetailedReportPanel />
              ) : (
                <ModulePanel
                  module={activeModule}
                  context={context}
                  progress={progress}
                  workItem={activeWorkItem}
                  required={activeModule.workId ? requiredSet.has(activeModule.workId) : false}
                  isHeadquarter={isHeadquarter}
                  scenarioLocked={locked}
                  canWrite={activeCanWrite}
                  user={user}
                  savingTemelBilgiler={actionBusy === "save"}
                  onTemelDirtyPathsChange={handleTemelDirtyPathsChange}
                  onSaveTemelBilgiler={handleSaveTemelBilgiler}
                />
              )}
            </View>
          </ScrollView>

          <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + spacing.sm }]}>
            <View style={styles.footerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footerTitle}>
                  {dirty ? "Kaydedilmemis degisiklik var" : "Workflow hazir"}
                </Text>
                <Text style={styles.footerSub} numberOfLines={2}>
                  {footerBlocker}
                </Text>
              </View>
              <Button
                label="Yenile"
                icon="refresh-outline"
                variant="secondary"
                small
                onPress={refreshScenario}
                testID="scenario-refresh-button"
              />
            </View>
            {canReviewActive ? (
              <TextInput
                value={revisionComment}
                onChangeText={setRevisionComment}
                placeholder="Revizyon notu"
                placeholderTextColor={colors.textMuted}
                style={styles.revisionInput}
                multiline
                testID="scenario-review-comment-input"
              />
            ) : null}
            <View style={styles.footerActions}>
              {canShowSubmit ? (
                <Button
                  label="Gonder"
                  icon="paper-plane-outline"
                  small
                  disabled={!canSubmitActive || actionBusy != null}
                  loading={actionBusy === "submit"}
                  onPress={handleSubmitActive}
                  style={styles.footerActionButton}
                  testID="scenario-submit-work-item-button"
                />
              ) : null}
              {canReviewActive ? (
                <>
                  <Button
                    label="Onayla"
                    icon="checkmark-circle-outline"
                    small
                    disabled={actionBusy != null}
                    loading={actionBusy === "approve"}
                    onPress={() => handleReviewActive("approve")}
                    style={styles.footerActionButton}
                    testID="scenario-approve-work-item-button"
                  />
                  <Button
                    label="Revizyon"
                    icon="return-up-back-outline"
                    variant="secondary"
                    small
                    disabled={actionBusy != null}
                    loading={actionBusy === "revise"}
                    onPress={() => handleReviewActive("revise")}
                    style={styles.footerActionButton}
                    testID="scenario-revise-work-item-button"
                  />
                </>
              ) : null}
              {showSendForApproval ? (
                <Button
                  label="Merkeze Ilet"
                  icon="send-outline"
                  small
                  disabled={!canSendForApproval || actionBusy != null}
                  loading={actionBusy === "send"}
                  onPress={handleSendForApproval}
                  style={styles.footerActionButton}
                  testID="scenario-send-for-approval-button"
                />
              ) : null}
              {showAdminApprovalLink ? (
                <Button
                  label="Onaylar"
                  icon="shield-checkmark-outline"
                  variant="secondary"
                  small
                  onPress={() => router.push("/admin/approvals")}
                  style={styles.footerActionButton}
                  testID="scenario-admin-approvals-link"
                />
              ) : null}
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function NoAccessPanel() {
  return (
    <Card testID="scenario-no-module-access">
      <View style={styles.centerPad}>
        <Ionicons name="lock-closed-outline" size={30} color={colors.textDim} />
        <Text style={styles.sectionTitle}>Yetki Gerekli</Text>
        <Text style={styles.emptyText}>
          Bu senaryoda goruntuleyebileceginiz modul bulunmuyor. Modul veya rapor yetkisi icin yoneticinizle gorusun.
        </Text>
      </View>
    </Card>
  );
}

function ScenarioSummary({
  progress,
  requiredCount,
  isHeadquarter,
  locked,
  metaWarning,
}: {
  progress: ProgressModel | null;
  requiredCount: number;
  isHeadquarter: boolean;
  locked: boolean;
  metaWarning: string;
}) {
  const pct = progress?.pct ?? 0;
  return (
    <Card testID="scenario-shell-summary">
      <View style={styles.summaryHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Senaryo Durumu</Text>
          <Text style={styles.sectionSub}>
            {isHeadquarter ? "HQ senaryo: yalniz IK, Gelirler ve Giderler zorunlu." : "Normal senaryo: tum ana moduller zorunlu."}
          </Text>
        </View>
        {locked ? (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.warn} />
            <Text style={styles.lockBadgeText}>Kilitli</Text>
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: spacing.md }}>
        <ProgressBar value={pct} />
        <View style={styles.progressLine}>
          <Text style={styles.progressText}>{Math.round(pct)}%</Text>
          <Text style={styles.progressText}>
            {progress?.completedCount ?? 0}/{progress?.totalCount ?? requiredCount} bolum
          </Text>
        </View>
      </View>
      {metaWarning ? (
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={15} color={colors.warn} />
          <Text style={styles.noticeText}>{metaWarning}</Text>
        </View>
      ) : null}
      {progress?.missingDetailsLines?.length ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={styles.tinyLabel}>Eksik Alanlar</Text>
          {progress.missingDetailsLines.slice(0, 4).map((line) => (
            <Text key={line} style={styles.missingLine} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ModulePanel({
  module,
  context,
  progress,
  workItem,
  required,
  isHeadquarter,
  scenarioLocked,
  canWrite,
  user,
  savingTemelBilgiler,
  onTemelDirtyPathsChange,
  onSaveTemelBilgiler,
}: {
  module: ModuleDef;
  context: ScenarioContext | null;
  progress: ProgressModel | null;
  workItem?: WorkItem;
  required: boolean;
  isHeadquarter: boolean;
  scenarioLocked: boolean;
  canWrite: boolean;
  user: User | null | undefined;
  savingTemelBilgiler: boolean;
  onTemelDirtyPathsChange: (paths: string[]) => void;
  onSaveTemelBilgiler: (draft: TemelBilgilerDraft) => Promise<void>;
}) {
  const moduleProgress = progressForModule(module, progress);
  const workMeta = workStateMeta(workItem?.state);
  const optionalReason = isHeadquarter && module.workId && !required ? "HQ senaryoda opsiyonel" : "";
  const lockReason = scenarioLocked
    ? "Senaryo kilitli"
    : workMeta.locked
      ? "Modul inceleme/onay durumunda"
      : !canWrite
        ? "Bu modul icin yazma yetkiniz yok"
        : optionalReason || "Editor port edilene kadar salt okunur; tamamlanan modul footer'dan gonderilebilir";
  const canEditModule = canWrite && !scenarioLocked && !workMeta.locked;

  return (
    <>
      <Card testID={`module-${module.key}`}>
        <View style={styles.moduleTop}>
          <View style={styles.moduleIcon}>
            <Ionicons name={module.icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{module.label}</Text>
            <Text style={styles.sectionSub}>{required ? "Zorunlu modul" : "Opsiyonel veya rapor modulu"}</Text>
          </View>
          {canWrite ? (
            <View style={styles.writePill}>
              <Text style={styles.writePillText}>Yazma</Text>
            </View>
          ) : null}
          <View style={styles.workStatePill}>
            <Ionicons name={workMeta.icon} size={13} color={workMeta.color} />
            <Text style={[styles.workStateText, { color: workMeta.color }]}>{workMeta.label}</Text>
          </View>
        </View>

        {moduleProgress.pct != null ? (
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar value={moduleProgress.pct} />
            <View style={styles.progressLine}>
              <Text style={styles.progressText}>{Math.round(moduleProgress.pct)}%</Text>
              <Text style={styles.progressText}>{moduleProgress.done ? "Tamam" : "Eksik"}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.noticeBox}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.warn} />
          <Text style={styles.noticeText}>{lockReason}</Text>
        </View>

        {workItem?.manager_comment ? (
          <View style={styles.commentBox}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.textDim} />
            <Text style={styles.commentText}>{workItem.manager_comment}</Text>
          </View>
        ) : null}

        {moduleProgress.missingLines.length ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={styles.tinyLabel}>Modul Eksikleri</Text>
            {moduleProgress.missingLines.slice(0, 5).map((line) => (
              <Text key={line} style={styles.missingLine} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      {module.key === "temel_bilgiler" ? (
        <TemelBilgilerEditor
          value={context?.inputs?.temelBilgiler}
          scenario={context?.scenario || null}
          user={user}
          currencyCode={resolveCurrency(context?.scenario || null)}
          canEdit={canEditModule}
          disabledReason={lockReason}
          saving={savingTemelBilgiler}
          onDirtyPathsChange={onTemelDirtyPathsChange}
          onSave={onSaveTemelBilgiler}
        />
      ) : (
        <ModuleReadOnlySummary module={module} context={context} />
      )}
    </>
  );
}

function ModuleReadOnlySummary({ module, context }: { module: ModuleDef; context: ScenarioContext | null }) {
  const inputs = context?.inputs || null;
  const scenario = context?.scenario || null;
  const norm = context?.norm;
  const currency = resolveCurrency(scenario);
  const temel = asObject(inputs?.temelBilgiler);
  const kapasite = asObject(inputs?.kapasite);
  const years = asObject(kapasite.years);

  if (module.key === "temel_bilgiler") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Senaryo" value={scenario?.name || "-"} />
          <Row label="Akademik yil" value={scenario?.academic_year || "-"} />
          <Row label="Program tipi" value={String(temel.programType || scenario?.program_type || "-")} />
          <Row label="Etkin kademe" value={formatInt(countEnabledKademeler(inputs))} />
          <Row label="Input guncelleme" value={formatDate(context?.inputsUpdatedAt)} />
        </View>
      </Card>
    );
  }

  if (module.key === "kapasite") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Mevcut ogrenci" value={formatInt(num(kapasite.currentStudents))} />
          <Row label="Yil 1 kapasite" value={formatInt(num(years.y1))} />
          <Row label="Yil 2 kapasite" value={formatInt(num(years.y2))} />
          <Row label="Yil 3 kapasite" value={formatInt(num(years.y3))} />
          <Row label="Kademe detayi" value={formatInt(countObjectKeys(kapasite.byKademe))} />
        </View>
      </Card>
    );
  }

  if (module.key === "norm.ders_dagilimi") {
    const normYears = asObject(asObject(norm).years);
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        {norm ? (
          <View style={{ marginTop: spacing.sm }}>
            <Row label="Yil 1 haftalik max" value={String(asObject(normYears.y1).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Yil 2 haftalik max" value={String(asObject(normYears.y2).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Yil 3 haftalik max" value={String(asObject(normYears.y3).teacherWeeklyMaxHours ?? "-")} />
            <Row label="Ders saati tanimi" value={formatInt(countCurriculumEntries(norm))} />
            <Row label="Norm guncelleme" value={formatDate(context?.normUpdatedAt)} />
          </View>
        ) : (
          <Text style={styles.emptyText}>Norm konfigurasyonu bu kullanici icin okunamadi veya henuz yok.</Text>
        )}
      </Card>
    );
  }

  if (module.key === "ik.local_staff") {
    const ik = asObject(inputs?.ik);
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Yerel kadro yillari" value={formatInt(countObjectKeys(ik.years))} />
          <Row label="HQ kadro tanimi" value={formatInt(countObjectKeys(ik.hq))} />
          <Row label="Varsayim seti" value={formatInt(countObjectKeys(ik.assumptions))} />
        </View>
      </Card>
    );
  }

  if (module.key === "gelirler.unit_fee") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Ogrenim ucreti satiri" value={formatInt(countTuitionRows(inputs))} />
          <Row label="Egitim disi gelir" value={formatInt(countIncomeRows(inputs, "nonEducationFees"))} />
          <Row label="Yurt geliri" value={formatInt(countIncomeRows(inputs, "dormitory"))} />
          <Row label="Diger kurum geliri" value={formatInt(countIncomeRows(inputs, "otherInstitutionIncome"))} />
          <Row label="Para birimi" value={currency} />
        </View>
      </Card>
    );
  }

  if (module.key === "giderler.isletme") {
    return (
      <Card>
        <Text style={styles.sectionTitle}>Okuma Ozeti</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Isletme gider kalemi" value={formatInt(countExpenseItems(inputs, "isletme"))} />
          <Row label="Ogrenim disi gider" value={formatInt(countExpenseItems(inputs, "ogrenimDisi"))} />
          <Row label="Yurt gideri" value={formatInt(countExpenseItems(inputs, "yurt"))} />
          <Row label="Para birimi" value={currency} />
        </View>
      </Card>
    );
  }

  return null;
}

function ReportPanel({
  report,
  loading,
  onReload,
  currency,
}: {
  report: Report | null;
  loading: boolean;
  onReload: () => void;
  currency: string;
}) {
  if (loading) {
    return (
      <Card>
        <View style={styles.centerPad}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.emptyText}>Rapor yukleniyor...</Text>
        </View>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <View style={styles.centerPad}>
          <Ionicons name="pie-chart-outline" size={30} color={colors.textDim} />
          <Text style={styles.sectionTitle}>Rapor Durumu</Text>
          <Text style={styles.emptyText}>Rapor ozeti henuz yuklenmedi.</Text>
          <Button label="Raporu Yukle" icon="refresh-outline" variant="secondary" onPress={onReload} />
        </View>
      </Card>
    );
  }

  if (report.disabledMessage) {
    return (
      <Card>
        <View style={styles.centerPad}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.warn} />
          <Text style={styles.sectionTitle}>Rapor Kullanilamiyor</Text>
          <Text style={styles.emptyText}>{report.disabledMessage}</Text>
          <Button label="Tekrar Dene" icon="refresh-outline" variant="secondary" onPress={onReload} />
        </View>
      </Card>
    );
  }

  const cur = report.currency || currency;
  const kpis = report.kpis || {};
  return (
    <>
      <Card>
        <Text style={styles.sectionTitle}>Rapor Ozeti</Text>
        <Text style={styles.sectionSub}>
          {report.cached ? "Cache sonucu" : "Guncel sonuc"} · {formatDate(report.calculatedAt)}
        </Text>
        <View style={{ marginTop: spacing.sm }}>
          <Row label="Toplam gelir" value={formatMoney(num(kpis.toplamGelir), cur)} />
          <Row label="Toplam gider" value={formatMoney(num(kpis.toplamGider), cur)} />
          <Row label="Faaliyet kari" value={formatMoney(num(kpis.faaliyetKari), cur)} />
          <Row label="Kar marji" value={formatPct(num(kpis.karMarji))} />
        </View>
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>Rapor Notu</Text>
        <Text style={styles.emptyText}>
          Detayli tablo, export ve dagitilmis rapor akislari PR 07 ve PR 08 kapsaminda port edilecek.
        </Text>
      </Card>
    </>
  );
}

function DetailedReportPanel() {
  return (
    <Card testID="detailed-report-readonly">
      <View style={styles.centerPad}>
        <Ionicons name="document-outline" size={30} color={colors.textDim} />
        <Text style={styles.sectionTitle}>Detayli Rapor</Text>
        <Text style={styles.emptyText}>
          Bu sekme PR 03A'da yalnizca rota ve durum yeri olarak acildi. Detayli rapor tablolari PR 07'de port edilecek.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerPad: { padding: spacing.lg, alignItems: "center", gap: spacing.sm },
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
  headerSub: { color: colors.textDim, ...font.small, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 130,
  },
  statusText: { ...font.tiny, textTransform: "uppercase", letterSpacing: 0.3 },
  errorWrap: { padding: spacing.lg },
  errorText: { color: colors.danger, ...font.body },
  summaryWrap: { padding: spacing.lg, paddingBottom: spacing.md },
  summaryHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  sectionTitle: { color: colors.text, ...font.h3 },
  sectionSub: { color: colors.textDim, ...font.small, marginTop: 4 },
  progressLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  progressText: { color: colors.textDim, ...font.small },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F9731644",
    backgroundColor: "#F9731614",
  },
  noticeText: { color: colors.textDim, ...font.small, flex: 1 },
  missingLine: {
    color: colors.textDim,
    ...font.small,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tinyLabel: { color: colors.textDim, ...font.tiny, textTransform: "uppercase", letterSpacing: 0.6 },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#F9731655",
    backgroundColor: "#F9731614",
  },
  lockBadgeText: { color: colors.warn, ...font.tiny, letterSpacing: 0 },
  tabRow: {
    height: 56,
    justifyContent: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tabContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  body: { padding: spacing.lg, gap: spacing.md },
  moduleTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "#F5B30122",
    alignItems: "center",
    justifyContent: "center",
  },
  workStatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  workStateText: { ...font.tiny, letterSpacing: 0 },
  writePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#22C55E55",
    backgroundColor: "#22C55E18",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  writePillText: { color: colors.success, ...font.tiny, letterSpacing: 0 },
  commentBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentText: { color: colors.textDim, ...font.small, flex: 1 },
  emptyText: { color: colors.textDim, ...font.small, textAlign: "center", lineHeight: 20 },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  footerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  footerActionButton: {
    flexGrow: 1,
    minWidth: 112,
  },
  footerTitle: { color: colors.text, ...font.bodyMd },
  footerSub: { color: colors.textDim, ...font.tiny, marginTop: 2, letterSpacing: 0 },
  revisionInput: {
    minHeight: 44,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgElev2,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...font.small,
  },
});
