import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  computeIncomeStudentsFromGrades,
  GelirlerDraft,
  GelirlerObject,
  GelirlerRow,
  GelirlerSectionKey,
  GELIRLER_SECTION_KEYS,
  GELIRLER_SECTION_LABELS,
  GELIRLER_YEAR_KEYS,
  normalizeGelirlerDraft,
  normalizeGelirlerKademeConfig,
} from "@/src/scenario/gelirlerAdapter";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { colors, font, formatInt, formatMoney, radius, spacing } from "@/src/theme";
import { Button, Card, Chip } from "@/src/ui/components";
import { FinancialNumberInput, FormRow, FormSection, ReadonlyValueRow } from "@/src/ui/financialForm";

type Props = {
  value: unknown;
  inputs: Inputs | null;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: GelirlerDraft) => Promise<void>;
};

type GradeRow = Record<string, unknown>;

const SECTION_SHORT_LABELS: Record<GelirlerSectionKey, string> = {
  tuition: "Ucret",
  nonEducationFees: "Ek Ucret",
  dormitory: "Yurt",
  otherInstitutionIncome: "Diger",
};

const TUITION_BASE_BY_KEY: Record<string, "kg" | "ilkokul" | "ortaokul" | "lise"> = {
  okulOncesi: "kg",
  ilkokulYerel: "ilkokul",
  ilkokulInt: "ilkokul",
  ortaokulYerel: "ortaokul",
  ortaokulInt: "ortaokul",
  liseYerel: "lise",
  liseInt: "lise",
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function normalizeProgramType(inputs: Inputs | null, scenario: Scenario | null) {
  const raw = str(inputs?.temelBilgiler?.programType || scenario?.program_type || "local").toLowerCase();
  return raw === "international" ? "international" : "local";
}

function isKademeKeyVisible(rowKey: string, programType: string) {
  if (rowKey === "okulOncesi") return true;
  if (rowKey.endsWith("Yerel")) return programType === "local";
  if (rowKey.endsWith("Int")) return programType === "international";
  return true;
}

function normalizePlanningGrades(gradesYearsInput: unknown, legacyGradesInput: unknown) {
  const legacy = Array.isArray(legacyGradesInput) ? legacyGradesInput as GradeRow[] : [];
  if (Array.isArray(gradesYearsInput)) {
    const rows = gradesYearsInput as GradeRow[];
    return { y1: rows, y2: rows, y3: rows };
  }
  if (gradesYearsInput && typeof gradesYearsInput === "object") {
    const source = gradesYearsInput as Record<string, unknown>;
    const years = source.years && typeof source.years === "object"
      ? source.years as Record<string, unknown>
      : source;
    const y1 = Array.isArray(years.y1) ? years.y1 as GradeRow[] : legacy;
    const y2 = Array.isArray(years.y2) ? years.y2 as GradeRow[] : y1;
    const y3 = Array.isArray(years.y3) ? years.y3 as GradeRow[] : y2;
    return { y1, y2, y3 };
  }
  return { y1: legacy, y2: legacy, y3: legacy };
}

function getInflationFactors(temelBilgiler: unknown) {
  const inflation = getAtPath(temelBilgiler, ["inflation"]) as Record<string, unknown> | undefined;
  const y2 = num(inflation?.y2);
  const y3 = num(inflation?.y3);
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

function dirtyPath(path: readonly PathToken[]) {
  return `gelirler.${path.map(String).join(".")}`;
}

function getRows(draft: GelirlerObject, section: GelirlerSectionKey): GelirlerRow[] {
  const rows = getAtPath(draft, [section, "rows"]);
  return Array.isArray(rows) ? rows as GelirlerRow[] : [];
}

function getManualStudentCount(row: GelirlerRow, yearKey: "y1" | "y2" | "y3") {
  if (yearKey === "y1") return num(row.studentCount);
  if (yearKey === "y2") return row.studentCountY2 == null ? num(row.studentCount) : num(row.studentCountY2);
  return row.studentCountY3 == null ? num(row.studentCount) : num(row.studentCountY3);
}

function rowLabel(row: GelirlerRow) {
  return str(row.label || row.key || "-");
}

function yearLabel(scenario: Scenario | null, yearKey: "y1" | "y2" | "y3") {
  const match = str(scenario?.academic_year).match(/\d{4}/);
  const offset = yearKey === "y1" ? 0 : yearKey === "y2" ? 1 : 2;
  if (!match) return yearKey.toUpperCase();
  const start = Number(match[0]) + offset;
  return `${offset + 1}. Yil (${start}-${start + 1})`;
}

export function GelirlerEditor({
  value,
  inputs,
  scenario,
  currencyCode,
  canEdit,
  disabledReason,
  saving,
  onDirtyPathsChange,
  onSave,
}: Props) {
  const planningGrades = React.useMemo(
    () => normalizePlanningGrades(inputs?.gradesYears, inputs?.grades),
    [inputs?.grades, inputs?.gradesYears],
  );
  const [activeSection, setActiveSection] = React.useState<GelirlerSectionKey>("tuition");
  const [draft, setDraft] = React.useState<GelirlerObject>(() =>
    normalizeGelirlerDraft(value, planningGrades.y1, inputs?.temelBilgiler?.kademeler),
  );
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setDraft(normalizeGelirlerDraft(value, planningGrades.y1, inputs?.temelBilgiler?.kademeler));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [inputs?.temelBilgiler?.kademeler, onDirtyPathsChange, planningGrades.y1, value]);

  const programType = normalizeProgramType(inputs, scenario);
  const kademeConfig = React.useMemo(
    () => normalizeGelirlerKademeConfig(inputs?.temelBilgiler?.kademeler),
    [inputs?.temelBilgiler?.kademeler],
  );
  const factors = React.useMemo(() => getInflationFactors(inputs?.temelBilgiler), [inputs?.temelBilgiler]);
  const suggestedByYear = React.useMemo(
    () => ({
      y1: computeIncomeStudentsFromGrades(planningGrades.y1, inputs?.temelBilgiler?.kademeler),
      y2: computeIncomeStudentsFromGrades(planningGrades.y2, inputs?.temelBilgiler?.kademeler),
      y3: computeIncomeStudentsFromGrades(planningGrades.y3, inputs?.temelBilgiler?.kademeler),
    }),
    [inputs?.temelBilgiler?.kademeler, planningGrades],
  );
  const isDirty = dirtyPaths.length > 0;

  const visibleRows = React.useMemo(() => {
    const rows = getRows(draft, activeSection);
    if (activeSection !== "tuition") return rows;
    return rows.filter((row) => {
      const baseKey = TUITION_BASE_BY_KEY[row.key];
      const baseEnabled = !baseKey || kademeConfig[baseKey === "kg" ? "okulOncesi" : baseKey]?.enabled !== false;
      return baseEnabled && isKademeKeyVisible(row.key, programType);
    });
  }, [activeSection, draft, kademeConfig, programType]);

  function markDirty(path: readonly PathToken[]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, dirtyPath(path)]));
      onDirtyPathsChange(next);
      return next;
    });
  }

  function update(path: readonly PathToken[], valueNext: number | null) {
    if (!canEdit) return;
    const safeValue = Math.max(0, num(valueNext));
    setDraft((prev) => setAtPath(prev, path, safeValue));
    markDirty(path);
    setMessage("");
  }

  function studentCountForRow(section: GelirlerSectionKey, row: GelirlerRow, yearKey: "y1" | "y2" | "y3") {
    if (section === "tuition") {
      const baseKey = TUITION_BASE_BY_KEY[row.key];
      return baseKey ? num(suggestedByYear[yearKey][baseKey]) : 0;
    }
    if (section === "nonEducationFees" || section === "dormitory") {
      return getManualStudentCount(row, yearKey);
    }
    return 0;
  }

  function totalsForSection(section: GelirlerSectionKey, rows: GelirlerRow[]) {
    return GELIRLER_YEAR_KEYS.reduce<Record<string, number>>((acc, yearKey) => {
      const factor = factors[yearKey];
      acc[yearKey] = rows.reduce((sum, row) => {
        if (section === "otherInstitutionIncome") return sum + num(row.amount) * factor;
        return sum + studentCountForRow(section, row, yearKey) * num(row.unitFee) * factor;
      }, 0);
      return acc;
    }, {});
  }

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ gelirler: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Gelirler kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Gelirler kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(normalizeGelirlerDraft(value, planningGrades.y1, inputs?.temelBilgiler?.kademeler));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  const activeTotals = totalsForSection(activeSection, visibleRows);
  const allRowsBySection = GELIRLER_SECTION_KEYS.reduce<Record<GelirlerSectionKey, GelirlerRow[]>>((acc, section) => {
    acc[section] = getRows(draft, section);
    return acc;
  }, {} as Record<GelirlerSectionKey, GelirlerRow[]>);
  const grossTotals = GELIRLER_YEAR_KEYS.reduce<Record<string, number>>((acc, yearKey) => {
    acc[yearKey] = GELIRLER_SECTION_KEYS.reduce((sum, section) => {
      const rows = section === "tuition"
        ? allRowsBySection.tuition.filter((row) => {
            const baseKey = TUITION_BASE_BY_KEY[row.key];
            const baseEnabled = !baseKey || kademeConfig[baseKey === "kg" ? "okulOncesi" : baseKey]?.enabled !== false;
            return baseEnabled && isKademeKeyVisible(row.key, programType);
          })
        : allRowsBySection[section];
      return sum + totalsForSection(section, rows)[yearKey];
    }, 0) + num(draft.governmentIncentives) * factors[yearKey];
    return acc;
  }, {});

  const editableHint = canEdit
    ? "Gelir satirlari yalniz leaf-field patch olarak kaydedilir; satir veya rows dizisi degistirilmez."
    : disabledReason;

  return (
    <Card testID="gelirler-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Gelirler Editoru</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
            {canEdit ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

      <View style={styles.sectionTabs}>
        {GELIRLER_SECTION_KEYS.map((section) => (
          <Chip
            key={section}
            label={SECTION_SHORT_LABELS[section]}
            active={activeSection === section}
            onPress={() => setActiveSection(section)}
            testID={`gelirler-section-${section}`}
          />
        ))}
      </View>

      <FormSection title={GELIRLER_SECTION_LABELS[activeSection]} subtitle={`Para birimi: ${currencyCode}`}>
        {visibleRows.map((row) => (
          <IncomeRowCard
            key={`${activeSection}-${row.key}`}
            section={activeSection}
            row={row}
            rowIndex={getRows(draft, activeSection).findIndex((candidate) => candidate.key === row.key)}
            scenario={scenario}
            currencyCode={currencyCode}
            canEdit={canEdit}
            factors={factors}
            studentCountForRow={studentCountForRow}
            onUpdate={update}
          />
        ))}
        {!visibleRows.length ? <Text style={styles.warningText}>Bu bolumde gorunur gelir satiri yok.</Text> : null}
        <ReadonlyValueRow label={`${yearLabel(scenario, "y1")} toplam`} value={formatMoney(activeTotals.y1 || 0, currencyCode)} />
        <ReadonlyValueRow label={`${yearLabel(scenario, "y2")} toplam`} value={formatMoney(activeTotals.y2 || 0, currencyCode)} />
        <ReadonlyValueRow label={`${yearLabel(scenario, "y3")} toplam`} value={formatMoney(activeTotals.y3 || 0, currencyCode)} />
      </FormSection>

      {activeSection === "otherInstitutionIncome" ? (
        <FormSection title="Devlet Tesvikleri" subtitle="Y1 girilir; Y2/Y3 enflasyonla turetilir.">
          <FormRow label="Devlet tesvikleri">
            <FinancialNumberInput
              value={num(draft.governmentIncentives)}
              unit={currencyCode}
              disabled={!canEdit}
              onChange={(next) => update(["governmentIncentives"], next)}
              testID="gelirler-government-incentives"
            />
          </FormRow>
          <ReadonlyValueRow label={yearLabel(scenario, "y2")} value={formatMoney(num(draft.governmentIncentives) * factors.y2, currencyCode)} />
          <ReadonlyValueRow label={yearLabel(scenario, "y3")} value={formatMoney(num(draft.governmentIncentives) * factors.y3, currencyCode)} />
        </FormSection>
      ) : null}

      <FormSection title="Brut Gelir Ozeti" subtitle="Indirimler PR 06B kapsaminda ayri port edilecek.">
        <ReadonlyValueRow label={yearLabel(scenario, "y1")} value={formatMoney(grossTotals.y1 || 0, currencyCode)} />
        <ReadonlyValueRow label={yearLabel(scenario, "y2")} value={formatMoney(grossTotals.y2 || 0, currencyCode)} />
        <ReadonlyValueRow label={yearLabel(scenario, "y3")} value={formatMoney(grossTotals.y3 || 0, currencyCode)} />
      </FormSection>

      {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
      <View style={styles.actions}>
        <Button
          label="Vazgec"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="gelirler-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="gelirler-save-button"
        />
      </View>
    </Card>
  );
}

function IncomeRowCard({
  section,
  row,
  rowIndex,
  scenario,
  currencyCode,
  canEdit,
  factors,
  studentCountForRow,
  onUpdate,
}: {
  section: GelirlerSectionKey;
  row: GelirlerRow;
  rowIndex: number;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  factors: Record<"y1" | "y2" | "y3", number>;
  studentCountForRow: (section: GelirlerSectionKey, row: GelirlerRow, yearKey: "y1" | "y2" | "y3") => number;
  onUpdate: (path: readonly PathToken[], value: number | null) => void;
}) {
  const unitFee = num(row.unitFee);
  const amount = num(row.amount);
  const totals = GELIRLER_YEAR_KEYS.reduce<Record<string, number>>((acc, yearKey) => {
    acc[yearKey] = section === "otherInstitutionIncome"
      ? amount * factors[yearKey]
      : studentCountForRow(section, row, yearKey) * unitFee * factors[yearKey];
    return acc;
  }, {});

  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{rowLabel(row)}</Text>
        <Text style={styles.rowKey}>{row.key}</Text>
      </View>

      {section === "otherInstitutionIncome" ? (
        <FormRow label={`${yearLabel(scenario, "y1")} tutar`}>
          <FinancialNumberInput
            value={amount}
            unit={currencyCode}
            disabled={!canEdit}
            onChange={(next) => onUpdate([section, "rows", rowIndex, "amount"], next)}
            testID={`gelirler-${section}-${row.key}-amount`}
          />
        </FormRow>
      ) : (
        <>
          {section === "tuition" ? (
            <View style={styles.readonlyGrid}>
              {GELIRLER_YEAR_KEYS.map((yearKey) => (
                <ReadonlyValueRow
                  key={yearKey}
                  label={`${yearLabel(scenario, yearKey)} ogrenci`}
                  value={formatInt(studentCountForRow(section, row, yearKey))}
                />
              ))}
            </View>
          ) : (
            GELIRLER_YEAR_KEYS.map((yearKey) => {
              const field = yearKey === "y1" ? "studentCount" : yearKey === "y2" ? "studentCountY2" : "studentCountY3";
              return (
                <FormRow key={yearKey} label={`${yearLabel(scenario, yearKey)} ogrenci`}>
                  <FinancialNumberInput
                    value={studentCountForRow(section, row, yearKey)}
                    disabled={!canEdit}
                    onChange={(next) => onUpdate([section, "rows", rowIndex, field], next)}
                    testID={`gelirler-${section}-${row.key}-${field}`}
                  />
                </FormRow>
              );
            })
          )}
          <FormRow label="Y1 birim ucret">
            <FinancialNumberInput
              value={unitFee}
              unit={currencyCode}
              disabled={!canEdit}
              onChange={(next) => onUpdate([section, "rows", rowIndex, "unitFee"], next)}
              testID={`gelirler-${section}-${row.key}-unitFee`}
            />
          </FormRow>
        </>
      )}

      <View style={styles.totalBlock}>
        {GELIRLER_YEAR_KEYS.map((yearKey) => (
          <ReadonlyValueRow
            key={yearKey}
            label={`${yearLabel(scenario, yearKey)} toplam`}
            value={formatMoney(totals[yearKey] || 0, currencyCode)}
          />
        ))}
      </View>
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
  sectionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rowCard: {
    gap: spacing.sm,
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  rowHead: {
    gap: 2,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: {
    color: colors.text,
    ...font.bodyMd,
  },
  rowKey: {
    color: colors.textMuted,
    ...font.tiny,
    letterSpacing: 0,
  },
  readonlyGrid: {
    gap: spacing.xs,
  },
  totalBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  warningText: {
    color: colors.warn,
    ...font.small,
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
