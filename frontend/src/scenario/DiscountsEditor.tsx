import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { Button, Card } from "@/src/ui/components";

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
  compact?: boolean;
  stickyActions?: boolean;
  stickyBottomInset?: number;
  stickyScrollHeight?: number;
  onLivePreviewChange?: (draft: DiscountRow[], preview: DiscountsLivePreview) => void;
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

export type DiscountsLivePreview = {
  counts: Record<DiscountYearKey, number>;
  amounts: Record<DiscountYearKey, number>;
  weightedPct: Record<DiscountYearKey, number>;
  incomeYears: Record<DiscountYearKey, IncomeYear>;
};

export function computeDiscountsLivePreview(inputs: Inputs | null, discounts: unknown): DiscountsLivePreview {
  const incomeYears = computeIncomeYears(inputs);
  const rows = normalizeDiscountsDraft(discounts);
  return rows.reduce(
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
      incomeYears,
    } as DiscountsLivePreview,
  );
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
  onLivePreviewChange,
  stickyActions = false,
  stickyBottomInset = 0,
  stickyScrollHeight,
}: Props) {
  const [activeYear, setActiveYear] = React.useState<DiscountYearKey>("y1");
  const [draft, setDraft] = React.useState<DiscountRow[]>(() => normalizeDiscountsDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const incomeYears = React.useMemo(() => computeIncomeYears(inputs), [inputs]);
  const isDirty = dirtyPaths.length > 0;
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionPadding = stickyActionBottom + 84;

  React.useEffect(() => {
    setDraft(normalizeDiscountsDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  function markDirty(paths: readonly PathToken[][]) {
    setDirtyPaths((prev) => Array.from(new Set([...prev, ...paths.map(dirtyPath)])));
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
      setMessage("İndirimler kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "İndirimler kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(normalizeDiscountsDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  const livePreview = React.useMemo(
    () => computeDiscountsLivePreview(inputs, draft),
    [draft, inputs],
  );
  const totals = livePreview;

  React.useEffect(() => {
    onLivePreviewChange?.(draft, livePreview);
  }, [draft, livePreview, onLivePreviewChange]);

  const activeIncome = incomeYears[activeYear];

  function renderBody() {
    return (
      <>
        <Card style={styles.infoCard}>
          <View style={styles.infoHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Burs ve İndirimler</Text>
              <Text style={styles.infoText}>
                Giderler içinde ayrı section olarak gösterilir. Satırlar kompakt tablo düzeninde, yıl sekmesiyle düzenlenir.
              </Text>
            </View>
            <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
              <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
              <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
                {canEdit ? "Açık" : "Kilitli"}
              </Text>
            </View>
          </View>
          {!canEdit ? <Text style={styles.warningText}>{disabledReason}</Text> : null}
        </Card>

        <View style={styles.tableCard}>
          <View style={styles.tableHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tableTitle}>Burs ve İndirimler</Text>
              <Text style={styles.tableSub}>Öğrenci × indirim = toplam indirim etkisi</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{totals.amounts.y1 > 0 ? "Tamam" : "Eksik"}</Text>
            </View>
          </View>

          <View style={styles.yearTabs}>
            {DISCOUNT_YEAR_KEYS.map((yearKey) => {
              const active = activeYear === yearKey;
              return (
                <Pressable
                  key={yearKey}
                  onPress={() => setActiveYear(yearKey)}
                  style={[styles.yearTab, active ? styles.yearTabActive : null]}
                  testID={`discounts-mobile-year-${yearKey}`}
                >
                  <Text style={[styles.yearTabText, active ? styles.yearTabTextActive : null]}>{yearKey.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.compactHeader}>
            <Text style={styles.compactHeaderText}>Satır</Text>
            <Text style={styles.compactHeaderText}>Öğr.</Text>
            <Text style={styles.compactHeaderText}>İndirim</Text>
            <Text style={[styles.compactHeaderText, styles.compactHeaderRight]}>Toplam</Text>
          </View>

          <View style={styles.compactRows}>
            {draft.map((row, index) => {
              const mode = modeOf(row);
              const count = countForRow(row, activeYear, activeIncome.tuitionStudents);
              const effectiveValue = effectiveValueForRow(row, activeYear, activeIncome);
              const displayValue = mode === "percent" ? effectiveValue * 100 : effectiveValue;
              const amount = discountAmount(row, activeYear, activeIncome, count);
              const fallbackHint = usesFixedInflationFallback(row, activeYear);

              return (
                <View key={`${index}-${row.name}`} style={styles.compactRow}>
                  <View style={styles.nameCell}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{row.name}</Text>
                    <View style={styles.modeTabs}>
                      <Pressable
                        onPress={() => canEdit && updateMode(index, "percent")}
                        style={[styles.modeChip, mode === "percent" ? styles.modeChipActive : null]}
                        testID={`discounts-mode-percent-${index}`}
                      >
                        <Text style={[styles.modeChipText, mode === "percent" ? styles.modeChipTextActive : null]}>%</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => canEdit && updateMode(index, "fixed")}
                        style={[styles.modeChip, mode === "fixed" ? styles.modeChipActive : null]}
                        testID={`discounts-mode-fixed-${index}`}
                      >
                        <Text style={[styles.modeChipText, mode === "fixed" ? styles.modeChipTextActive : null]}>Tutar</Text>
                      </Pressable>
                    </View>
                  </View>

                  <CompactNumberInput
                    value={count}
                    editable={canEdit}
                    onChange={(next) => updateYear(index, activeYear, next, displayValue)}
                    testID={`discounts-${index}-${activeYear}-count`}
                  />

                  <CompactNumberInput
                    value={displayValue}
                    unit={mode === "percent" ? "%" : currencyCode}
                    editable={canEdit}
                    warning={fallbackHint}
                    onChange={(next) => updateYear(index, activeYear, count, next)}
                    testID={`discounts-${index}-${activeYear}-value`}
                  />

                  <View style={styles.totalCell}>
                    <Text style={styles.totalText}>{formatMoney(amount, currencyCode)}</Text>
                    <Text style={styles.totalSub}>
                      {formatInt(count)} × {mode === "percent" ? formatPct(displayValue) : formatMoney(displayValue, currencyCode)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>{activeYear.toUpperCase()} toplam indirim</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(totals.amounts[activeYear], currencyCode)}</Text>
          </View>
        </View>

        <Card style={styles.summaryCard}>
          <SummaryRow label={`${yearLabel(scenario, activeYear)} toplam öğrenci`} value={formatInt(activeIncome.tuitionStudents)} />
          <SummaryRow label={`${activeYear.toUpperCase()} indirimli öğrenci`} value={formatInt(totals.counts[activeYear])} />
          <SummaryRow
            label={`${activeYear.toUpperCase()} indirimli öğrenci oranı`}
            value={formatPct(activeIncome.tuitionStudents > 0 ? (totals.counts[activeYear] / activeIncome.tuitionStudents) * 100 : 0)}
          />
        </Card>
      </>
    );
  }

  function renderActions() {
    return (
      <View style={styles.actions}>
        <Button
          label="Vazgeç"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="discounts-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Değişiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="discounts-save-button"
        />
      </View>
    );
  }

  if (stickyActions) {
    return (
      <View testID="discounts-editor" style={[styles.stickyShell, stickyScrollHeight ? { height: stickyScrollHeight } : null]}>
        <ScrollView
          style={styles.stickyScroll}
          contentContainerStyle={[styles.stickyScrollContent, { paddingBottom: stickyActionPadding }]}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderBody()}
        </ScrollView>
        <View style={[styles.stickyActions, { bottom: stickyActionBottom }]}>
          {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
          {renderActions()}
        </View>
      </View>
    );
  }

  return (
    <View testID="discounts-editor" style={styles.root}>
      {renderBody()}
      {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
      {renderActions()}
    </View>
  );
}

function CompactNumberInput({
  value,
  unit,
  editable,
  warning,
  onChange,
  testID,
}: {
  value: number;
  unit?: string;
  editable: boolean;
  warning?: boolean;
  onChange: (value: number | null) => void;
  testID?: string;
}) {
  const [text, setText] = React.useState(value > 0 && editable ? String(Number(value.toFixed(2))) : "");

  React.useEffect(() => {
    if (editable) setText(value > 0 ? String(Number(value.toFixed(2))) : "");
  }, [editable, value]);

  if (!editable) {
    return (
      <View style={[styles.inputReadonly, warning ? styles.inputWarning : null]}>
        <Text style={styles.inputReadonlyText} numberOfLines={1}>
          {unit ? `${Number(value.toFixed(2))} ${unit}` : formatInt(value)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.inputWrap, warning ? styles.inputWarning : null]}>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={(nextText) => {
          setText(nextText);
          onChange(parseDiscountNumber(nextText));
        }}
        keyboardType="decimal-pad"
        placeholder="Gir"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function parseDiscountNumber(text: string) {
  const normalized = text.replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  stickyShell: {
    position: "relative",
    gap: spacing.sm,
  },
  stickyScroll: {
    flex: 1,
  },
  stickyScrollContent: {
    gap: spacing.md,
  },
  stickyActions: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoCard: {
    gap: spacing.sm,
  },
  infoHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  infoTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  infoText: {
    marginTop: 4,
    color: colors.textDim,
    ...font.small,
    lineHeight: 18,
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
  tableCard: {
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  tableTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  tableSub: {
    marginTop: 3,
    color: colors.textDim,
    ...font.small,
    lineHeight: 17,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    backgroundColor: "#F973161A",
    borderColor: "#F9731655",
  },
  statusBadgeText: {
    color: colors.warn,
    ...font.tiny,
    fontWeight: "900",
  },
  yearTabs: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  yearTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearTabText: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  yearTabTextActive: {
    color: colors.primaryText,
  },
  compactHeader: {
    flexDirection: "row",
    gap: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactHeaderText: {
    flex: 1,
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  compactHeaderRight: {
    textAlign: "right",
  },
  compactRows: {
    gap: 7,
    padding: 10,
  },
  compactRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  nameCell: {
    flex: 1.25,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    lineHeight: 16,
  },
  modeTabs: {
    flexDirection: "row",
    gap: 5,
    marginTop: 5,
  },
  modeChip: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeChipText: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
  },
  modeChipTextActive: {
    color: colors.primaryText,
  },
  inputWrap: {
    flex: 0.82,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    overflow: "hidden",
  },
  inputWarning: {
    borderColor: "#F9731655",
    backgroundColor: "#F9731610",
  },
  input: {
    flex: 1,
    color: colors.text,
    textAlign: "right",
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    alignSelf: "stretch",
    paddingHorizontal: 7,
    textAlignVertical: "center",
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
    backgroundColor: colors.bgElev2,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  inputReadonly: {
    flex: 0.82,
    minHeight: 34,
    alignItems: "flex-end",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    paddingHorizontal: 8,
  },
  inputReadonlyText: {
    color: colors.text,
    ...font.tiny,
    fontWeight: "900",
    textAlign: "right",
  },
  totalCell: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  totalText: {
    color: colors.text,
    ...font.tiny,
    fontWeight: "900",
    textAlign: "right",
  },
  totalSub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "right",
  },
  grandTotal: {
    marginHorizontal: 10,
    marginBottom: 12,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: "#E8F2FF",
    borderWidth: 1,
    borderColor: "#3B82F655",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  grandTotalLabel: {
    flex: 1,
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    lineHeight: 17,
  },
  grandTotalValue: {
    color: colors.primary,
    ...font.bodyMd,
    fontWeight: "900",
    textAlign: "right",
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryRow: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    color: colors.text,
    ...font.small,
    fontWeight: "900",
  },
  summaryValue: {
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    textAlign: "right",
  },
  warningText: {
    color: colors.warn,
    ...font.small,
  },
  successText: {
    color: colors.success,
    ...font.small,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
