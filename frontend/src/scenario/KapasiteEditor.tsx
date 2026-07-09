import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario, User } from "@/src/api/client";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { KapasiteDraft } from "@/src/scenario/kapasiteAdapter";
import { colors, font, formatInt, formatPct, radius, spacing } from "@/src/theme";
import { Button, Card } from "@/src/ui/components";
import {
  FinancialNumberInput,
  FormRow,
  FormSection,
  ReadonlyValueRow,
} from "@/src/ui/financialForm";

type DraftObject = Record<string, unknown>;
type GradeRow = Record<string, unknown>;

export type KapasiteSectionFilter = "missing" | "done";
export type KapasiteSectionKey = "kampusOzeti" | "toplamlar" | "kademeKapasiteleri" | "gradePlanlama";

type Props = {
  value: unknown;
  inputs: Inputs | null;
  scenario: Scenario | null;
  user: User | null | undefined;
  canEdit: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: KapasiteDraft) => Promise<void>;
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: KapasiteSectionFilter;
  onSectionFilterChange?: (filter: KapasiteSectionFilter) => void;
  activeSectionKey?: KapasiteSectionKey | null;
  onActiveSectionKeyChange?: (section: KapasiteSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
};

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "Ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
] as const;

type KademeDef = (typeof KADEME_DEFS)[number];

const PERIODS = [
  { key: "cur", label: "Mevcut" },
  { key: "y1", label: "Yil 1" },
  { key: "y2", label: "Yil 2" },
  { key: "y3", label: "Yil 3" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

const GRADES = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function cloneDraft(value: unknown): DraftObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as DraftObject;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function dirtyPath(path: readonly PathToken[]) {
  return `kapasite.${path.map(String).join(".")}`;
}

function getCapacityValue(draft: DraftObject, kademeKey: string, periodKey: PeriodKey) {
  const modernValue = getAtPath(draft, ["byKademe", kademeKey, "caps", periodKey]);
  if (modernValue != null) return modernValue;

  const legacyValue = getAtPath(draft, ["byKademe", kademeKey, periodKey]);
  return legacyValue == null ? 0 : legacyValue;
}

function normalizeCapacityDraft(value: unknown): DraftObject {
  let draft = cloneDraft(value);

  KADEME_DEFS.forEach((def) => {
    PERIODS.forEach((period) => {
      const modernPath = ["byKademe", def.key, "caps", period.key] as const;
      const modernValue = getAtPath(draft, modernPath);
      if (modernValue != null) return;

      const legacyValue = getAtPath(draft, ["byKademe", def.key, period.key]);
      if (legacyValue != null) {
        draft = setAtPath(draft, modernPath, legacyValue);
      }
    });
  });

  return draft;
}

function normalizeProgramType(inputs: Inputs | null, scenario: Scenario | null) {
  const raw = str(inputs?.temelBilgiler?.programType || scenario?.program_type || "local").toLowerCase();
  return raw === "international" ? "international" : "local";
}

function isKademeKeyVisible(baseKey: string, programType: string) {
  if (baseKey === "okulOncesi") return true;
  return programType === "international" || programType === "local";
}

function gradeIndex(value: unknown) {
  const raw = str(value).trim().toUpperCase();
  const normalized = raw === "K" ? "KG" : raw;
  return GRADES.indexOf(normalized);
}

function normalizeKademeConfig(config: unknown) {
  const source = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, Record<string, unknown>>)
    : {};
  return KADEME_DEFS.reduce<Record<string, { enabled: boolean; from: string; to: string }>>((acc, def) => {
    const row = source[def.key] && typeof source[def.key] === "object" ? source[def.key] : {};
    const from = GRADES.includes(str(row.from).toUpperCase()) ? str(row.from).toUpperCase() : def.defaultFrom;
    const to = GRADES.includes(str(row.to).toUpperCase()) ? str(row.to).toUpperCase() : def.defaultTo;
    acc[def.key] = {
      enabled: row.enabled !== false,
      from,
      to,
    };
    return acc;
  }, {});
}

function gradeInKademe(grade: unknown, row: { enabled: boolean; from: string; to: string }) {
  if (!row.enabled) return false;
  const idx = gradeIndex(grade);
  const fromIdx = gradeIndex(row.from);
  const toIdx = gradeIndex(row.to);
  if (idx < 0 || fromIdx < 0 || toIdx < 0) return false;
  return fromIdx <= idx && idx <= toIdx;
}

function normalizePlanningGrades(input: unknown) {
  if (Array.isArray(input)) return { y1: input as GradeRow[], y2: input as GradeRow[], y3: input as GradeRow[] };
  if (input && typeof input === "object") {
    const source = input as Record<string, unknown>;
    const years = source.years && typeof source.years === "object"
      ? (source.years as Record<string, unknown>)
      : source;
    const y1 = Array.isArray(years.y1) ? (years.y1 as GradeRow[]) : [];
    const y2 = Array.isArray(years.y2) ? (years.y2 as GradeRow[]) : y1;
    const y3 = Array.isArray(years.y3) ? (years.y3 as GradeRow[]) : y1;
    return { y1, y2, y3 };
  }
  return { y1: [] as GradeRow[], y2: [] as GradeRow[], y3: [] as GradeRow[] };
}

function summarizeGradesByKademe(grades: unknown, kademeConfig: Record<string, { enabled: boolean; from: string; to: string }>) {
  const rows = Array.isArray(grades) ? (grades as GradeRow[]) : [];
  const out = { okulOncesi: 0, ilkokul: 0, ortaokul: 0, lise: 0, total: 0 };
  rows.forEach((row) => {
    const students = num(row.studentsPerBranch);
    if (!students) return;
    out.total += students;
    const def = KADEME_DEFS.find((item) => gradeInKademe(row.grade, kademeConfig[item.key]));
    if (def) out[def.key] += students;
  });
  return out;
}

function periodUtil(capacity: number, students: number) {
  if (!capacity) return null;
  return students / capacity;
}

function getYearLabel(scenario: Scenario | null, period: "cur" | "y1" | "y2" | "y3") {
  if (period === "cur") return "Mevcut";
  const match = str(scenario?.academic_year).match(/\d{4}/);
  const base = match ? Number(match[0]) : null;
  const offset = period === "y1" ? 0 : period === "y2" ? 1 : 2;
  return base ? `${offset + 1}. Yil (${base + offset}-${base + offset + 1})` : `${offset + 1}. Yil`;
}

export function KapasiteEditor({
  value,
  inputs,
  scenario,
  user,
  canEdit,
  disabledReason,
  saving,
  onDirtyPathsChange,
  onSave,
  sectionMode = false,
  onSectionModeBack,
  sectionFilter: controlledSectionFilter,
  onSectionFilterChange,
  activeSectionKey: controlledActiveSectionKey,
  onActiveSectionKeyChange,
  showSectionModeTopControls = true,
  stickySectionActions = false,
  stickyBottomInset = 0,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [draft, setDraft] = React.useState<DraftObject>(() => normalizeCapacityDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<KapasiteSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<KapasiteSectionKey | null>(null);
  const [selectedPeriods, setSelectedPeriods] = React.useState<Record<string, PeriodKey>>({});
  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const setSectionFilter = React.useCallback((next: KapasiteSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);
  const activeSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const setActiveSection = React.useCallback((next: KapasiteSectionKey | null) => {
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 76;
  const stickyEditorHeight = Math.max(440, windowHeight - 150);

  React.useEffect(() => {
    setDraft(normalizeCapacityDraft(value));
    setDirtyPaths([]);
    setActiveSection(null);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, setActiveSection, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  const kademeConfig = React.useMemo(
    () => normalizeKademeConfig(inputs?.temelBilgiler?.kademeler),
    [inputs?.temelBilgiler?.kademeler],
  );
  const programType = normalizeProgramType(inputs, scenario);
  const visibleKademeler = KADEME_DEFS.filter((def) => kademeConfig[def.key]?.enabled && isKademeKeyVisible(def.key, programType));
  const effectiveKademeler: KademeDef[] = visibleKademeler.length ? visibleKademeler : [...KADEME_DEFS];
  const planningGrades = React.useMemo(
    () => normalizePlanningGrades(inputs?.gradesYears || inputs?.grades),
    [inputs?.grades, inputs?.gradesYears],
  );
  const studentCounts = React.useMemo(
    () => ({
      cur: summarizeGradesByKademe(inputs?.gradesCurrent, kademeConfig),
      y1: summarizeGradesByKademe(planningGrades.y1, kademeConfig),
      y2: summarizeGradesByKademe(planningGrades.y2, kademeConfig),
      y3: summarizeGradesByKademe(planningGrades.y3, kademeConfig),
    }),
    [inputs?.gradesCurrent, kademeConfig, planningGrades],
  );
  const totals = PERIODS.reduce<Record<string, number>>((acc, period) => {
    acc[period.key] = effectiveKademeler.reduce<number>(
      (sum, def) => sum + num(getCapacityValue(draft, def.key, period.key)),
      0,
    );
    return acc;
  }, {});
  const isDirty = dirtyPaths.length > 0;
  const gradePlanCounts = {
    cur: Array.isArray(inputs?.gradesCurrent) ? inputs.gradesCurrent.length : 0,
    y1: planningGrades.y1.length,
    y2: planningGrades.y2.length,
    y3: planningGrades.y3.length,
  };
  const kademeCapacityDone =
    effectiveKademeler.length > 0 &&
    effectiveKademeler.every((def) =>
      PERIODS.every((period) => num(getCapacityValue(draft, def.key, period.key)) > 0),
    );
  const capacityMissingHint = kademeCapacityDone
    ? "Her kademe ve yıl için kapasite alanları dolu."
    : "Eksik kapasite alanlarını tamamlayın.";
  const sectionCards: KapasiteSectionCardModel[] = [
    {
      key: "kampusOzeti",
      title: "Kampüs Özeti",
      subtitle: "Bölge, ülke ve program tipi",
      helper: "Salt okunur kampüs bilgilerini görüntüle.",
      icon: "business-outline",
      status: "info",
      done: true,
    },
    {
      key: "toplamlar",
      title: "Toplamlar",
      subtitle: "Kapasite, öğrenci ve kullanım oranları",
      helper: "Otomatik hesaplanan toplamları kontrol et.",
      icon: "stats-chart-outline",
      status: "done",
      done: true,
    },
    {
      key: "kademeKapasiteleri",
      title: "Kademe Kapasiteleri",
      subtitle: "Her kademe ve yıl için kapasite girişleri",
      helper: capacityMissingHint,
      icon: "layers-outline",
      status: kademeCapacityDone ? "done" : "missing",
      done: kademeCapacityDone,
    },
    {
      key: "gradePlanlama",
      title: "Grade Planlama",
      subtitle: "Norm/grade akışından gelen plan satırları",
      helper: "Bu alan Norm akışında düzenlenir.",
      icon: "grid-outline",
      status: "info",
      done: true,
    },
  ];
  const missingSections = sectionCards.filter((section) => !section.done);
  const doneSections = sectionCards.filter((section) => section.done);
  const visibleSections = sectionFilter === "missing" ? missingSections : doneSections;

  function markDirty(paths: readonly PathToken[][]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, ...paths.map(dirtyPath)]));
      return next;
    });
  }

  function recalcAndPatchTotals(nextDraft: DraftObject) {
    let updated = nextDraft;
    const dirty: PathToken[][] = [];
    PERIODS.forEach((period) => {
      const total = effectiveKademeler.reduce<number>(
        (sum, def) => sum + num(getCapacityValue(updated, def.key, period.key)),
        0,
      );
      updated = setAtPath(updated, ["totals", period.key], total);
      dirty.push(["totals", period.key]);
      if (period.key !== "cur") {
        updated = setAtPath(updated, ["years", period.key], total);
        dirty.push(["years", period.key]);
      }
    });
    return { updated, dirty };
  }

  function updateCapacityCell(kademeKey: string, periodKey: PeriodKey, value: number) {
    if (!canEdit) return;
    const changedPaths: PathToken[][] = [["byKademe", kademeKey, "caps", periodKey]];
    let nextDraft = setAtPath(draft, ["byKademe", kademeKey, "caps", periodKey], value);

    if (periodKey === "cur") {
      const prevCur = num(getCapacityValue(draft, kademeKey, "cur"));
      (["y1", "y2", "y3"] as const).forEach((nextPeriod) => {
        const nextPath = ["byKademe", kademeKey, "caps", nextPeriod] as const;
        const dirtyFuture = dirtyPaths.includes(dirtyPath(nextPath));
        const previousValue = num(getCapacityValue(draft, kademeKey, nextPeriod));
        if (!dirtyFuture && (previousValue === 0 || previousValue === prevCur)) {
          nextDraft = setAtPath(nextDraft, nextPath, value);
          changedPaths.push([...nextPath]);
        }
      });
    }

    const recalculated = recalcAndPatchTotals(nextDraft);
    changedPaths.push(...recalculated.dirty);
    setDraft(recalculated.updated);
    markDirty(changedPaths);
    setMessage("");
  }

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ kapasite: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Kapasite kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Kapasite kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(normalizeCapacityDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  function renderActionButtons(containerStyle?: any) {
    return (
      <View style={[styles.actions, sectionMode ? styles.mobileActions : null, containerStyle]}>
        <Button
          label="Vazgec"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="kapasite-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="kapasite-save-button"
        />
      </View>
    );
  }

  function renderStickyActions() {
    return (
      <View style={[styles.stickySectionActions, { bottom: stickyActionBottom }]}>
        {message ? <Text style={styles.stickySuccessText}>{message}</Text> : null}
        {renderActionButtons(styles.stickyActionButtons)}
      </View>
    );
  }

  function renderSectionModeTop(showTabs: boolean) {
    if (!showSectionModeTopControls) return null;
    return (
      <View style={styles.sectionModeTopRow}>
        {activeSection ? (
          <Pressable
            onPress={() => setActiveSection(null)}
            hitSlop={12}
            style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
            testID="kapasite-section-back-button"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onSectionModeBack}
            hitSlop={12}
            style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
            testID="scenario-back-button"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        )}

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="kapasite-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="kapasite-filter-done"
            >
              <Text style={[styles.topTabText, sectionFilter === "done" ? styles.topTabTextActive : null]}>
                Tamam {doneSections.length}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  function renderKampusOzetiSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Salt okunur kampüs bilgileri</Text>
          <Text style={styles.mobileInfoText}>
            Bu bilgiler Temel Bilgiler ve kullanıcı profilinden okunur; Kapasite içinde değiştirilmez.
          </Text>
        </View>
        <FormSection title="Kampüs" style={styles.mobileFormCard}>
          <ReadonlyValueRow label="Bölge" value={str(user?.region || "-")} />
          <ReadonlyValueRow label="Ülke" value={str(user?.country_name || "-")} />
          <ReadonlyValueRow label="Program tipi" value={programType === "international" ? "International" : "Yerel"} />
        </FormSection>
      </>
    );
  }

  function renderToplamlarSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Kapasite kullanım özeti</Text>
          <Text style={styles.mobileInfoText}>
            Öğrenci sayıları Norm/Grade akışından okunur. Kullanım oranı otomatik hesaplanır.
          </Text>
        </View>
        <FormSection title="Dönem özetleri" style={styles.mobileFormCard}>
          {PERIODS.map((period) => {
            const students = num(studentCounts[period.key as keyof typeof studentCounts]?.total);
            const capacity = num(totals[period.key]);
            const util = periodUtil(capacity, students);
            return (
              <View key={period.key} style={styles.summaryMiniCard}>
                <View style={styles.summaryMiniHead}>
                  <Text style={styles.summaryMiniTitle}>{period.label}</Text>
                  <Text style={styles.summaryMiniPill}>{util == null ? "-" : formatPct(util * 100, 1)}</Text>
                </View>
                <View style={styles.mobileTwoCols}>
                  <CompactValueRow label="Kapasite" value={formatInt(capacity)} />
                  <CompactValueRow label="Öğrenci" value={formatInt(students)} />
                </View>
              </View>
            );
          })}
        </FormSection>
      </>
    );
  }

  function renderKademeKapasiteleriSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Kademe ve yıl bazlı giriş</Text>
          <Text style={styles.mobileInfoText}>
            Her kademe kartında dönem seçilir; kapasite düzenlenir, öğrenci ve kullanım otomatik görünür.
          </Text>
        </View>
        {effectiveKademeler.map((def) => {
          const selectedPeriod = selectedPeriods[def.key] || "cur";
          const kRow = kademeConfig[def.key];
          const range = kRow?.from === kRow?.to ? kRow?.from : `${kRow?.from}-${kRow?.to}`;
          const capacity = num(getCapacityValue(draft, def.key, selectedPeriod));
          const students = num(studentCounts[selectedPeriod as keyof typeof studentCounts]?.[def.key]);
          const util = periodUtil(capacity, students);
          return (
            <View key={def.key} style={[styles.mobileFormCard, styles.capacityKademeCard]}>
              <View style={styles.capacityKademeHead}>
                <Text style={styles.capacityKademeTitle}>{def.label}</Text>
                <Text style={styles.capacityRangePill}>{range}</Text>
              </View>
              <View style={styles.periodTabs}>
                {PERIODS.map((period) => {
                  const active = selectedPeriod === period.key;
                  return (
                    <Pressable
                      key={period.key}
                      onPress={() => setSelectedPeriods((prev) => ({ ...prev, [def.key]: period.key }))}
                      style={[styles.periodTab, active ? styles.periodTabActive : null]}
                    >
                      <Text style={[styles.periodTabText, active ? styles.periodTabTextActive : null]}>
                        {period.key === "cur" ? "Mevcut" : period.key.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <FormRow label="Kapasite">
                <FinancialNumberInput
                  value={capacity}
                  disabled={!canEdit}
                  onChange={(next) => updateCapacityCell(def.key, selectedPeriod, num(next))}
                />
              </FormRow>
              <View style={styles.mobileTwoCols}>
                <CompactValueRow label="Öğrenci" value={formatInt(students)} />
                <CompactValueRow label="Kullanım" value={util == null ? "-" : formatPct(util * 100, 1)} />
              </View>
            </View>
          );
        })}
      </>
    );
  }

  function renderGradePlanlamaSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Bu bölüm salt okunur</Text>
          <Text style={styles.mobileInfoText}>
            Grade satırları Kapasite içinde düzenlenmez. Öğrenci planlaması Norm akışı içinde yönetilir.
          </Text>
        </View>
        <FormSection title="Plan satırları" style={styles.mobileFormCard}>
          <ReadonlyValueRow label="Mevcut grade satırı" value={formatInt(gradePlanCounts.cur)} />
          <ReadonlyValueRow label="Yıl 1 plan satırı" value={formatInt(gradePlanCounts.y1)} />
          <ReadonlyValueRow label="Yıl 2 plan satırı" value={formatInt(gradePlanCounts.y2)} />
          <ReadonlyValueRow label="Yıl 3 plan satırı" value={formatInt(gradePlanCounts.y3)} />
        </FormSection>
      </>
    );
  }

  function renderSectionForm(section: KapasiteSectionKey) {
    switch (section) {
      case "kampusOzeti":
        return renderKampusOzetiSection();
      case "toplamlar":
        return renderToplamlarSection();
      case "gradePlanlama":
        return renderGradePlanlamaSection();
      case "kademeKapasiteleri":
      default:
        return renderKademeKapasiteleriSection();
    }
  }

  const editableHint = canEdit
    ? "Kapasite alanlari kaydedilir; grade/branch planlama PR 05A'ya kadar salt okunur."
    : disabledReason;

  if (sectionMode) {
    if (activeSection) {
      const showEditableActions = activeSection === "kademeKapasiteleri";
      if (stickySectionActions && showEditableActions) {
        return (
          <View testID="kapasite-editor" style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}>
            {renderSectionModeTop(false)}
            <ScrollView
              style={styles.sectionEditorScroll}
              contentContainerStyle={[styles.sectionEditorContent, { paddingBottom: stickyActionScrollPadding }]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {renderSectionForm(activeSection)}
            </ScrollView>
            {renderStickyActions()}
          </View>
        );
      }
      return (
        <View testID="kapasite-editor" style={styles.sectionModeRoot}>
          {renderSectionModeTop(false)}
          {renderSectionForm(activeSection)}
          {showEditableActions ? (
            <>
              {message ? <Text style={styles.successText}>{message}</Text> : null}
              {renderActionButtons()}
            </>
          ) : null}
        </View>
      );
    }

    return (
      <View testID="kapasite-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}
        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <KapasiteSectionCard
                key={section.key}
                section={section}
                onPress={() => setActiveSection(section.key)}
              />
            ))
          ) : (
            <Card style={styles.emptySectionCard}>
              <Ionicons
                name={sectionFilter === "missing" ? "checkmark-circle-outline" : "ellipse-outline"}
                size={32}
                color={sectionFilter === "missing" ? colors.success : colors.textMuted}
              />
              <Text style={styles.emptySectionTitle}>
                {sectionFilter === "missing" ? "Eksik bölüm kalmadı" : "Tamamlanan bölüm yok"}
              </Text>
              <Text style={styles.emptySectionText}>
                {sectionFilter === "missing"
                  ? "Kapasite bölümlerinin tamamı kontrol edildi."
                  : "Bir bölüm tamamlandığında burada görünür."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card testID="kapasite-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Kapasite Editoru</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
            {canEdit ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

      <FormSection title="Kampus Ozeti" subtitle="Ogrenci sayilari Norm/Grade akisindan okunur.">
        <ReadonlyValueRow label="Bolge" value={str(user?.region || "-")} />
        <ReadonlyValueRow label="Ulke" value={str(user?.country_name || "-")} />
        <ReadonlyValueRow label="Program tipi" value={programType === "international" ? "International" : "Yerel"} />
      </FormSection>

      <FormSection title="Toplamlar" subtitle="Toplam kapasite ve kullanim oranlari otomatik hesaplanir.">
        {PERIODS.map((period) => {
          const students = num(studentCounts[period.key as keyof typeof studentCounts]?.total);
          const capacity = num(totals[period.key]);
          const util = periodUtil(capacity, students);
          return (
            <View key={period.key} style={styles.totalRow}>
              <Text style={styles.totalTitle}>{getYearLabel(scenario, period.key)}</Text>
              <ReadonlyValueRow label="Kapasite" value={formatInt(capacity)} />
              <ReadonlyValueRow label="Ogrenci" value={formatInt(students)} />
              <ReadonlyValueRow label="Kullanim" value={util == null ? "-" : formatPct(util * 100, 1)} />
            </View>
          );
        })}
      </FormSection>

      <FormSection title="Kademe Kapasiteleri" subtitle="Kapasiteyi her kademe ve yil icin girin.">
        {effectiveKademeler.map((def) => {
          const kRow = kademeConfig[def.key];
          const range = kRow?.from === kRow?.to ? kRow?.from : `${kRow?.from}-${kRow?.to}`;
          return (
            <View key={def.key} style={styles.kademeBlock}>
              <Text style={styles.kademeTitle}>{def.label} ({range})</Text>
              {PERIODS.map((period) => {
                const capacity = num(getCapacityValue(draft, def.key, period.key));
                const students = num(studentCounts[period.key as keyof typeof studentCounts]?.[def.key]);
                const util = periodUtil(capacity, students);
                return (
                  <View key={period.key} style={styles.periodBlock}>
                    <Text style={styles.periodTitle}>{getYearLabel(scenario, period.key)}</Text>
                    <FormRow label="Kapasite">
                      <FinancialNumberInput
                        value={capacity}
                        disabled={!canEdit}
                        onChange={(next) => updateCapacityCell(def.key, period.key, num(next))}
                      />
                    </FormRow>
                    <View style={styles.readonlyGrid}>
                      <ReadonlyValueRow label="Ogrenci" value={formatInt(students)} />
                      <ReadonlyValueRow label="Kullanim" value={util == null ? "-" : formatPct(util * 100, 1)} />
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </FormSection>

      <FormSection title="Grade Planlama" subtitle="Bu bilgiler PR 05A Norm akisi icinde duzenlenecek.">
        <ReadonlyValueRow label="Mevcut grade satiri" value={formatInt(Array.isArray(inputs?.gradesCurrent) ? inputs.gradesCurrent.length : 0)} />
        <ReadonlyValueRow label="Yil 1 plan satiri" value={formatInt(planningGrades.y1.length)} />
        <ReadonlyValueRow label="Yil 2 plan satiri" value={formatInt(planningGrades.y2.length)} />
        <ReadonlyValueRow label="Yil 3 plan satiri" value={formatInt(planningGrades.y3.length)} />
      </FormSection>

      {message ? <Text style={styles.successText}>{message}</Text> : null}
      <View style={styles.actions}>
        <Button
          label="Vazgec"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="kapasite-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="kapasite-save-button"
        />
      </View>
    </Card>
  );
}

type KapasiteSectionCardModel = {
  key: KapasiteSectionKey;
  title: string;
  subtitle: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: "missing" | "done" | "info";
  done: boolean;
};

function KapasiteSectionCard({
  section,
  onPress,
}: {
  section: KapasiteSectionCardModel;
  onPress: () => void;
}) {
  const statusLabel = section.status === "missing" ? "Eksik" : section.status === "done" ? "Tamam" : "Bilgi";
  const statusStyle =
    section.status === "missing"
      ? styles.sectionStatusMissing
      : section.status === "done"
        ? styles.sectionStatusDone
        : styles.sectionStatusInfo;
  const statusTextStyle =
    section.status === "missing"
      ? styles.sectionStatusTextMissing
      : section.status === "done"
        ? styles.sectionStatusTextDone
        : styles.sectionStatusTextInfo;
  const iconColor = section.status === "missing" ? colors.warn : section.status === "done" ? colors.success : colors.primary;
  const actionLabel = section.status === "missing" ? "Doldur" : "Aç";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sectionCard, pressed ? styles.pressed : null]}
      testID={`kapasite-section-${section.key}`}
    >
      <View style={styles.sectionMainRow}>
        <View style={[styles.sectionIcon, { backgroundColor: section.status === "missing" ? "#FFF7D8" : section.status === "done" ? "#EAF8EF" : colors.chipBg }]}>
          <Ionicons name={section.icon} size={23} color={iconColor} />
        </View>
        <View style={styles.sectionTextBlock}>
          <Text style={styles.sectionCardTitle} numberOfLines={2}>{section.title}</Text>
          <Text style={styles.sectionCardSubtitle} numberOfLines={2}>{section.subtitle}</Text>
        </View>
        <View style={[styles.sectionStatusPill, statusStyle]}>
          <Text style={[styles.sectionStatusText, statusTextStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.sectionDivider} />
      <View style={styles.sectionCardBottom}>
        <Text style={styles.sectionHelper} numberOfLines={2}>{section.helper}</Text>
        <View style={[styles.sectionActionButton, section.status !== "missing" ? styles.sectionActionButtonDone : null]}>
          <Text style={[styles.sectionActionText, section.status !== "missing" ? styles.sectionActionTextDone : null]}>
            {actionLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function CompactValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.compactValueRow}>
      <Text style={styles.compactValueLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.compactValueText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  editorHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    ...font.h3,
  },
  subtitle: {
    color: colors.textDim,
    ...font.small,
    marginTop: 4,
  },
  editBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  editBadgeOn: {
    backgroundColor: colors.primary,
  },
  editBadgeOff: {
    backgroundColor: "#F9731622",
    borderWidth: 1,
    borderColor: "#F9731655",
  },
  editBadgeText: {
    ...font.tiny,
    fontWeight: "900",
  },
  totalRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  totalTitle: {
    color: colors.text,
    ...font.bodyMd,
    marginBottom: spacing.xs,
  },
  kademeBlock: {
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  kademeTitle: {
    color: colors.text,
    ...font.h3,
  },
  periodBlock: {
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  periodTitle: {
    color: colors.text,
    ...font.bodyMd,
  },
  readonlyGrid: {
    gap: spacing.xs,
  },
  successText: {
    color: colors.success,
    ...font.small,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  mobileActions: {
    marginTop: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.bgElev,
  },
  sectionEditorShell: {
    flex: 1,
    minHeight: 620,
    position: "relative",
    overflow: "hidden",
  },
  sectionEditorScroll: {
    flex: 1,
  },
  sectionEditorContent: {
    gap: spacing.md,
  },
  stickySectionActions: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.bgElev,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  stickyActionButtons: {
    marginTop: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  stickySuccessText: {
    color: colors.success,
    ...font.small,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  sectionModeRoot: {
    gap: spacing.md,
  },
  sectionModeTopRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTopBackButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  topTabs: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
    padding: 4,
    gap: 4,
  },
  topTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topTabActive: {
    backgroundColor: colors.bgElev,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  topTabText: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  topTabTextActive: {
    color: colors.primary,
  },
  sectionCardList: {
    gap: spacing.md,
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    overflow: "hidden",
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ translateY: 1 }],
  },
  sectionMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sectionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  sectionCardTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
  },
  sectionCardSubtitle: {
    color: colors.textDim,
    ...font.body,
    lineHeight: 21,
    marginTop: 5,
  },
  sectionStatusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  sectionStatusMissing: {
    backgroundColor: "#FFF7D8",
    borderColor: "#FDE68A",
  },
  sectionStatusDone: {
    backgroundColor: "#EAF8EF",
    borderColor: "#BBF7D0",
  },
  sectionStatusInfo: {
    backgroundColor: colors.chipBg,
    borderColor: "#BFDBFE",
  },
  sectionStatusText: {
    ...font.tiny,
    fontWeight: "900",
  },
  sectionStatusTextMissing: {
    color: colors.warn,
  },
  sectionStatusTextDone: {
    color: colors.success,
  },
  sectionStatusTextInfo: {
    color: colors.primary,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  sectionCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionHelper: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
  },
  sectionActionButton: {
    minWidth: 96,
    minHeight: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  sectionActionButtonDone: {
    backgroundColor: colors.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  sectionActionText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: "900",
  },
  sectionActionTextDone: {
    color: colors.primary,
  },
  emptySectionCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  emptySectionTitle: {
    color: colors.text,
    ...font.h3,
    textAlign: "center",
  },
  emptySectionText: {
    color: colors.textDim,
    ...font.small,
    textAlign: "center",
    lineHeight: 19,
  },
  mobileFormCard: {
    borderTopWidth: 0,
    marginBottom: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.bgElev,
    padding: spacing.md,
    shadowColor: "#19314F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  mobileInfoCard: {
    gap: 5,
    backgroundColor: "#F8FBFF",
  },
  mobileInfoTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
  },
  mobileInfoText: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
  },
  mobileTwoCols: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  compactValueRow: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "space-between",
    gap: 4,
  },
  compactValueLabel: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
  },
  compactValueText: {
    color: colors.text,
    ...font.mono,
    textAlign: "right",
  },
  summaryMiniCard: {
    borderRadius: 20,
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    gap: spacing.sm,
  },
  summaryMiniHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  summaryMiniTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  summaryMiniPill: {
    color: colors.primary,
    ...font.tiny,
    fontWeight: "900",
    borderRadius: radius.pill,
    backgroundColor: colors.chipBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  capacityKademeCard: {
    gap: spacing.md,
  },
  capacityKademeHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  capacityKademeTitle: {
    flex: 1,
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
  },
  capacityRangePill: {
    color: colors.textMuted,
    ...font.tiny,
    fontWeight: "900",
    borderRadius: radius.pill,
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  periodTabs: {
    flexDirection: "row",
    gap: 6,
  },
  periodTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4E8FF",
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  periodTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodTabText: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
  },
  periodTabTextActive: {
    color: colors.primaryText,
  },
});
