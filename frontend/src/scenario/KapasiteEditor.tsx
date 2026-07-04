import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
}: Props) {
  const [draft, setDraft] = React.useState<DraftObject>(() => normalizeCapacityDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setDraft(normalizeCapacityDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, value]);

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

  const editableHint = canEdit
    ? "Kapasite alanlari kaydedilir; grade/branch planlama PR 05A'ya kadar salt okunur."
    : disabledReason;

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
});
