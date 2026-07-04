import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  DiscountsDraft,
  DiscountRow,
  DISCOUNT_YEAR_KEYS,
  DiscountYearKey,
  normalizeDiscountsDraft,
} from "@/src/scenario/discountsAdapter";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { colors, font, formatInt, formatMoney, formatPct, radius, spacing } from "@/src/theme";
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
  onSave: (draft: DiscountsDraft) => Promise<void>;
};

type IncomeYear = {
  tuitionStudents: number;
  grossTuition: number;
  avgTuitionFee: number;
  factor: number;
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function yearLabel(scenario: Scenario | null, yearKey: DiscountYearKey) {
  const match = str(scenario?.academic_year).match(/\d{4}/);
  const offset = yearKey === "y1" ? 0 : yearKey === "y2" ? 1 : 2;
  if (!match) return yearKey.toUpperCase();
  const start = Number(match[0]) + offset;
  return `${offset + 1}. Yil (${start}-${start + 1})`;
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

function studentCountForYear(row: Record<string, unknown>, yearKey: DiscountYearKey) {
  if (yearKey === "y2") return num(row.studentCountY2 ?? row.studentCount);
  if (yearKey === "y3") return num(row.studentCountY3 ?? row.studentCountY2 ?? row.studentCount);
  return num(row.studentCount);
}

function computeIncomeYears(inputs: Inputs | null): Record<DiscountYearKey, IncomeYear> {
  const gelirler = inputs?.gelirler || {};
  const grades = Array.isArray(inputs?.grades) ? inputs.grades : [];
  const totalStudents = grades.reduce((sum: number, row: Record<string, unknown>) => sum + num(row?.studentsPerBranch), 0);
  const factors = getInflationFactors(inputs?.temelBilgiler);
  const tuitionRows = Array.isArray(gelirler?.tuition?.rows) ? gelirler.tuition.rows : [];

  return DISCOUNT_YEAR_KEYS.reduce<Record<DiscountYearKey, IncomeYear>>((acc, yearKey) => {
    const factor = factors[yearKey];
    const tuitionStudents = tuitionRows.length
      ? tuitionRows.reduce((sum: number, row: Record<string, unknown>) => sum + studentCountForYear(row, yearKey), 0)
      : totalStudents;
    const grossTuition = tuitionRows.length
      ? tuitionRows.reduce(
          (sum: number, row: Record<string, unknown>) => sum + studentCountForYear(row, yearKey) * num(row?.unitFee) * factor,
          0,
        )
      : tuitionStudents * num(gelirler?.tuitionFeePerStudentYearly) * factor;
    acc[yearKey] = {
      tuitionStudents,
      grossTuition,
      avgTuitionFee: tuitionStudents > 0 ? grossTuition / tuitionStudents : 0,
      factor,
    };
    return acc;
  }, {} as Record<DiscountYearKey, IncomeYear>);
}

function dirtyPath(path: readonly PathToken[]) {
  return `discounts.${path.map(String).join(".")}`;
}

function fieldForYear(yearKey: DiscountYearKey, baseField: "studentCount" | "ratio" | "value") {
  if (yearKey === "y1") return baseField;
  return `${baseField}${yearKey.toUpperCase()}` as "studentCountY2" | "ratioY2" | "valueY2" | "studentCountY3" | "ratioY3" | "valueY3";
}

function modeOf(row: DiscountRow) {
  return String(row.mode || "percent") === "fixed" ? "fixed" : "percent";
}

function countForRow(row: DiscountRow, yearKey: DiscountYearKey, tuitionStudents: number) {
  const countField = fieldForYear(yearKey, "studentCount");
  const ratioField = fieldForYear(yearKey, "ratio");
  const rawCount = row[countField];
  const rawRatio = row[ratioField];
  const hasCount = rawCount != null;
  const count = hasCount ? Math.max(0, Math.round(num(rawCount))) : null;
  if (tuitionStudents > 0) {
    const derived = count != null ? count : Math.round(clamp(num(rawRatio), 0, 1) * tuitionStudents);
    return Math.min(derived, tuitionStudents);
  }
  return count != null ? count : 0;
}

function valueForRow(row: DiscountRow, yearKey: DiscountYearKey) {
  const valueField = fieldForYear(yearKey, "value");
  return Math.max(0, num(row[valueField]));
}

function hasExplicitValue(value: unknown) {
  return value != null && String(value).trim() !== "";
}

function hasYearSpecificValue(row: DiscountRow, yearKey: DiscountYearKey) {
  if (yearKey === "y2") return hasExplicitValue(row.valueY2);
  if (yearKey === "y3") return hasExplicitValue(row.valueY3);
  return hasExplicitValue(row.value);
}

function fixedValueForRow(row: DiscountRow, yearKey: DiscountYearKey, factor: number) {
  if (yearKey === "y1") return Math.max(0, num(row.value));
  const valueField = fieldForYear(yearKey, "value");
  if (hasYearSpecificValue(row, yearKey)) return Math.max(0, num(row[valueField]));
  return Math.max(0, num(row.value)) * factor;
}

function effectiveValueForRow(row: DiscountRow, yearKey: DiscountYearKey, income: IncomeYear) {
  if (modeOf(row) === "fixed") return fixedValueForRow(row, yearKey, income.factor);
  return valueForRow(row, yearKey);
}

function usesFixedInflationFallback(row: DiscountRow, yearKey: DiscountYearKey) {
  return modeOf(row) === "fixed" && yearKey !== "y1" && !hasYearSpecificValue(row, yearKey);
}

function discountAmount(row: DiscountRow, yearKey: DiscountYearKey, income: IncomeYear, count: number) {
  const value = effectiveValueForRow(row, yearKey, income);
  if (modeOf(row) === "fixed") return count * value;
  return income.avgTuitionFee * count * clamp(value, 0, 1);
}

export function DiscountsEditor({
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
  const [draft, setDraft] = React.useState<DiscountRow[]>(() => normalizeDiscountsDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const incomeYears = React.useMemo(() => computeIncomeYears(inputs), [inputs]);
  const isDirty = dirtyPaths.length > 0;

  React.useEffect(() => {
    setDraft(normalizeDiscountsDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  function markDirty(paths: readonly PathToken[][]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, ...paths.map(dirtyPath)]));
      return next;
    });
  }

  function patchRow(index: number, updates: Record<string, unknown>) {
    if (!canEdit) return;
    setDraft((prev) => {
      let next = prev;
      Object.entries(updates).forEach(([field, fieldValue]) => {
        next = setAtPath(next, [index, field], fieldValue);
      });
      return next;
    });
    markDirty(Object.keys(updates).map((field) => [index, field]));
    setMessage("");
  }

  function updateMode(index: number, mode: "percent" | "fixed") {
    patchRow(index, { mode });
  }

  function updateYear(index: number, yearKey: DiscountYearKey, nextCount: number | null, nextValue: number | null) {
    const row = draft[index];
    if (!row) return;
    const income = incomeYears[yearKey];
    const count = Math.max(0, Math.round(num(nextCount)));
    const bounded = income.tuitionStudents > 0 ? Math.min(count, income.tuitionStudents) : count;
    const ratio = income.tuitionStudents > 0 ? clamp(bounded / income.tuitionStudents, 0, 1) : 0;
    const rawValue = Math.max(0, num(nextValue));
    const valueNext = modeOf(row) === "percent" ? clamp(rawValue / 100, 0, 1) : rawValue;

    patchRow(index, {
      [fieldForYear(yearKey, "studentCount")]: bounded,
      [fieldForYear(yearKey, "ratio")]: ratio,
      [fieldForYear(yearKey, "value")]: valueNext,
    });
  }

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ discounts: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Indirimler kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Indirimler kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(normalizeDiscountsDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  const totals = draft.reduce(
    (acc, row) => {
      DISCOUNT_YEAR_KEYS.forEach((yearKey) => {
        const income = incomeYears[yearKey];
        const count = countForRow(row, yearKey, income.tuitionStudents);
        const valueRow = effectiveValueForRow(row, yearKey, income);
        const amount = discountAmount(row, yearKey, income, count);
        acc.counts[yearKey] += count;
        acc.amounts[yearKey] += amount;
        if (modeOf(row) === "percent") acc.weightedPct[yearKey] += count * clamp(valueRow, 0, 1);
      });
      return acc;
    },
    {
      counts: { y1: 0, y2: 0, y3: 0 },
      amounts: { y1: 0, y2: 0, y3: 0 },
      weightedPct: { y1: 0, y2: 0, y3: 0 },
    } as {
      counts: Record<DiscountYearKey, number>;
      amounts: Record<DiscountYearKey, number>;
      weightedPct: Record<DiscountYearKey, number>;
    },
  );

  const editableHint = canEdit
    ? "Indirim satirlari leaf-field patch olarak kaydedilir; satir veya discounts dizisi degistirilmez."
    : disabledReason;

  return (
    <Card testID="discounts-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Burs ve Indirimler</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
            {canEdit ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

      <FormSection title="Ozet" subtitle="Indirimler yalniz ogrenci ucret gelirlerine uygulanir.">
        {DISCOUNT_YEAR_KEYS.map((yearKey) => (
          <ReadonlyValueRow
            key={yearKey}
            label={`${yearLabel(scenario, yearKey)} toplam`}
            value={`${formatMoney(totals.amounts[yearKey], currencyCode)} / ${formatInt(totals.counts[yearKey])} ogr.`}
          />
        ))}
        <ReadonlyValueRow
          label="Y1 indirimli ogrenci orani"
          value={formatPct(incomeYears.y1.tuitionStudents > 0 ? (totals.counts.y1 / incomeYears.y1.tuitionStudents) * 100 : 0)}
        />
      </FormSection>

      <FormSection title="Satirlar" subtitle="Satir ekleme/silme PR 06B kapsaminda kapali; mevcut/default satirlar korunur.">
        {draft.map((row, index) => (
          <DiscountRowCard
            key={`${index}-${row.name}`}
            row={row}
            index={index}
            scenario={scenario}
            currencyCode={currencyCode}
            canEdit={canEdit}
            incomeYears={incomeYears}
            onModeChange={updateMode}
            onYearChange={updateYear}
          />
        ))}
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
          testID="discounts-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="discounts-save-button"
        />
      </View>
    </Card>
  );
}

function DiscountRowCard({
  row,
  index,
  scenario,
  currencyCode,
  canEdit,
  incomeYears,
  onModeChange,
  onYearChange,
}: {
  row: DiscountRow;
  index: number;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  incomeYears: Record<DiscountYearKey, IncomeYear>;
  onModeChange: (index: number, mode: "percent" | "fixed") => void;
  onYearChange: (index: number, yearKey: DiscountYearKey, count: number | null, value: number | null) => void;
}) {
  const mode = modeOf(row);
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{row.name}</Text>
        <View style={styles.modeTabs}>
          <Chip label="%" active={mode === "percent"} onPress={() => canEdit && onModeChange(index, "percent")} testID={`discounts-mode-percent-${index}`} />
          <Chip label="Tutar" active={mode === "fixed"} onPress={() => canEdit && onModeChange(index, "fixed")} testID={`discounts-mode-fixed-${index}`} />
        </View>
      </View>

      {DISCOUNT_YEAR_KEYS.map((yearKey) => {
        const income = incomeYears[yearKey];
        const count = countForRow(row, yearKey, income.tuitionStudents);
        const effectiveValue = effectiveValueForRow(row, yearKey, income);
        const displayValue = mode === "percent" ? effectiveValue * 100 : effectiveValue;
        const amount = discountAmount(row, yearKey, income, count);
        const fallbackHint = usesFixedInflationFallback(row, yearKey)
          ? "Yil degeri yok; Y1 tutari enflasyonla gosteriliyor."
          : undefined;
        return (
          <View key={yearKey} style={styles.yearBlock}>
            <Text style={styles.yearTitle}>{yearLabel(scenario, yearKey)}</Text>
            <FormRow label="Ogrenci">
              <FinancialNumberInput
                value={count}
                disabled={!canEdit}
                onChange={(next) => onYearChange(index, yearKey, next, displayValue)}
                testID={`discounts-${index}-${yearKey}-count`}
              />
            </FormRow>
            <FormRow label={mode === "percent" ? "Ortalama indirim" : "Kisi basi indirim"} hint={fallbackHint}>
              <FinancialNumberInput
                value={displayValue}
                unit={mode === "percent" ? "%" : currencyCode}
                disabled={!canEdit}
                onChange={(next) => onYearChange(index, yearKey, count, next)}
                testID={`discounts-${index}-${yearKey}-value`}
              />
            </FormRow>
            <ReadonlyValueRow label="Toplam" value={formatMoney(amount, currencyCode)} />
          </View>
        );
      })}
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
  rowCard: {
    gap: spacing.sm,
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  rowHead: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: {
    color: colors.text,
    ...font.bodyMd,
  },
  modeTabs: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  yearBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  yearTitle: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
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
