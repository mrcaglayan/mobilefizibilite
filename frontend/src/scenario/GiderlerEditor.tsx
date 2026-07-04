import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  DORM_ITEMS,
  DORM_TO_INCOME_KEY,
  ExpenseItemDef,
  ExpenseRow,
  GiderlerDraft,
  GiderlerObject,
  GIDERLER_YEAR_KEYS,
  GiderlerYearKey,
  IK_AUTO_KEYS,
  normalizeGiderlerDraft,
  OPERATING_ITEMS,
  SERVICE_ITEMS,
  SERVICE_TO_INCOME_KEY,
} from "@/src/scenario/giderlerAdapter";
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
  onSave: (draft: GiderlerDraft) => Promise<void>;
};

type SectionKey = "isletme" | "ogrenimDisi" | "yurt";
type YearMap = Record<GiderlerYearKey, number>;
type SalaryByYear = Record<GiderlerYearKey, Record<string, number>>;

const SECTION_LABELS: Record<SectionKey, string> = {
  isletme: "Isletme",
  ogrenimDisi: "Ogrenim Disi",
  yurt: "Yurt",
};

const IK_ROLES = [
  "turk_mudur",
  "turk_mdyard",
  "turk_egitimci",
  "turk_temsil",
  "yerel_yonetici_egitimci",
  "yerel_destek",
  "yerel_ulke_temsil_destek",
  "int_yonetici_egitimci",
];

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getInflationFactors(temelBilgiler: unknown): YearMap {
  const inflation = asObject(getAtPath(temelBilgiler, ["inflation"]));
  const y2 = num(inflation.y2);
  const y3 = num(inflation.y3);
  return {
    y1: 1,
    y2: 1 + y2,
    y3: (1 + y2) * (1 + y3),
  };
}

function yearLabel(scenario: Scenario | null, yearKey: GiderlerYearKey) {
  const match = str(scenario?.academic_year).match(/\d{4}/);
  const offset = yearKey === "y1" ? 0 : yearKey === "y2" ? 1 : 2;
  if (!match) return yearKey.toUpperCase();
  const start = Number(match[0]) + offset;
  return `${offset + 1}. Yil (${start}-${start + 1})`;
}

function dirtyPath(path: readonly PathToken[]) {
  return `giderler.${path.map(String).join(".")}`;
}

function getGiderlerValue(draft: GiderlerObject, path: readonly PathToken[], fallback = 0) {
  const value = getAtPath(draft, path);
  return value == null ? fallback : value;
}

function rowsByKey(rows: unknown) {
  const list = Array.isArray(rows) ? rows : [];
  return new Map(list.map((row) => [String(asObject(row).key || ""), asObject(row)]));
}

function incomeRowsByKey(inputs: Inputs | null, section: "nonEducationFees" | "dormitory") {
  return rowsByKey(getAtPath(inputs, ["gelirler", section, "rows"]));
}

function studentCountFromIncomeRow(row: Record<string, unknown> | undefined, yearKey: GiderlerYearKey) {
  if (!row) return 0;
  if (yearKey === "y2") return num(row.studentCountY2 ?? row.studentCount);
  if (yearKey === "y3") return num(row.studentCountY3 ?? row.studentCountY2 ?? row.studentCount);
  return num(row.studentCount);
}

function salaryMapForYear(yearIK: unknown) {
  const unitCosts = asObject(getAtPath(yearIK, ["unitCosts"]));
  const headcountsByLevel = asObject(getAtPath(yearIK, ["headcountsByLevel"]));
  const roleAnnual = IK_ROLES.reduce<Record<string, number>>((acc, role) => {
    const totalCount = Object.values(headcountsByLevel).reduce<number>(
      (sum, level) => sum + num(asObject(level)[role]),
      0,
    );
    acc[role] = num(unitCosts[role]) * totalCount;
    return acc;
  }, {});
  const sum = (roles: string[]) => roles.reduce((total, role) => total + num(roleAnnual[role]), 0);
  return {
    turkPersonelMaas: sum(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
    turkDestekPersonelMaas: sum(["turk_temsil"]),
    yerelPersonelMaas: sum(["yerel_yonetici_egitimci"]),
    yerelDestekPersonelMaas: sum(["yerel_destek", "yerel_ulke_temsil_destek"]),
    internationalPersonelMaas: sum(["int_yonetici_egitimci"]),
  };
}

function buildSalaryByYear(ik: unknown): SalaryByYear {
  const years = asObject(getAtPath(ik, ["years"]));
  return {
    y1: salaryMapForYear(years.y1),
    y2: salaryMapForYear(years.y2),
    y3: salaryMapForYear(years.y3),
  };
}

function getSalaryAmount(
  draft: GiderlerObject,
  salaryByYear: SalaryByYear,
  factors: YearMap,
  key: string,
  yearKey: GiderlerYearKey,
) {
  const baseIsletmeVal = num(getGiderlerValue(draft, ["isletme", "items", key]));
  const ikBaseY1 = num(salaryByYear.y1[key]);
  const extraY1 = ikBaseY1 > 0 ? Math.max(0, baseIsletmeVal - ikBaseY1) : 0;
  const base = ikBaseY1 > 0 ? ikBaseY1 : baseIsletmeVal;
  const fromIk = num(salaryByYear[yearKey][key]);
  const baseYearVal = fromIk > 0 ? fromIk : yearKey === "y1" ? base : base * factors[yearKey];
  const extraYearVal = yearKey === "y1" ? extraY1 : extraY1 * factors[yearKey];
  return baseYearVal + extraYearVal;
}

function operatingAmount(
  draft: GiderlerObject,
  salaryByYear: SalaryByYear,
  factors: YearMap,
  key: string,
  yearKey: GiderlerYearKey,
) {
  if (IK_AUTO_KEYS.has(key)) return getSalaryAmount(draft, salaryByYear, factors, key, yearKey);
  const base = num(getGiderlerValue(draft, ["isletme", "items", key]));
  return yearKey === "y1" ? base : base * factors[yearKey];
}

function expenseRow(draft: GiderlerObject, section: "ogrenimDisi" | "yurt", key: string): ExpenseRow {
  return asObject(getAtPath(draft, [section, "items", key])) as ExpenseRow;
}

function serviceUnitCost(row: ExpenseRow, factors: YearMap, yearKey: GiderlerYearKey) {
  const base = num(row.unitCost);
  return yearKey === "y1" ? base : base * factors[yearKey];
}

function totalByYear(
  items: ExpenseItemDef[],
  getAmount: (item: ExpenseItemDef, yearKey: GiderlerYearKey) => number,
) {
  return GIDERLER_YEAR_KEYS.reduce<YearMap>((acc, yearKey) => {
    acc[yearKey] = items.reduce((sum, item) => sum + getAmount(item, yearKey), 0);
    return acc;
  }, { y1: 0, y2: 0, y3: 0 });
}

export function GiderlerEditor({
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
  const [activeSection, setActiveSection] = React.useState<SectionKey>("isletme");
  const [draft, setDraft] = React.useState<GiderlerObject>(() => normalizeGiderlerDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setDraft(normalizeGiderlerDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  const factors = React.useMemo(() => getInflationFactors(inputs?.temelBilgiler), [inputs?.temelBilgiler]);
  const salaryByYear = React.useMemo(() => buildSalaryByYear(inputs?.ik), [inputs?.ik]);
  const nonEdIncomeByKey = React.useMemo(() => incomeRowsByKey(inputs, "nonEducationFees"), [inputs]);
  const dormIncomeByKey = React.useMemo(() => incomeRowsByKey(inputs, "dormitory"), [inputs]);
  const isDirty = dirtyPaths.length > 0;

  function markDirty(path: readonly PathToken[]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, dirtyPath(path)]));
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

  function updateOperating(key: string, valueNext: number | null) {
    if (IK_AUTO_KEYS.has(key)) return;
    update(["isletme", "items", key], valueNext);
  }

  function updateService(key: string, valueNext: number | null) {
    update(["ogrenimDisi", "items", key, "unitCost"], valueNext);
  }

  function updateDorm(key: string, valueNext: number | null) {
    update(["yurt", "items", key, "unitCost"], valueNext);
  }

  function serviceStudentCount(item: ExpenseItemDef, yearKey: GiderlerYearKey) {
    return studentCountFromIncomeRow(nonEdIncomeByKey.get(SERVICE_TO_INCOME_KEY[item.key]), yearKey);
  }

  function dormStudentCount(item: ExpenseItemDef, yearKey: GiderlerYearKey) {
    return studentCountFromIncomeRow(dormIncomeByKey.get(DORM_TO_INCOME_KEY[item.key]), yearKey);
  }

  const operatingTotals = React.useMemo(
    () => totalByYear(OPERATING_ITEMS, (item, yearKey) => operatingAmount(draft, salaryByYear, factors, item.key, yearKey)),
    [draft, factors, salaryByYear],
  );
  const serviceTotals = React.useMemo(
    () => totalByYear(SERVICE_ITEMS, (item, yearKey) => {
      const row = expenseRow(draft, "ogrenimDisi", item.key);
      return serviceStudentCount(item, yearKey) * serviceUnitCost(row, factors, yearKey);
    }),
    [draft, factors, nonEdIncomeByKey],
  );
  const dormTotals = React.useMemo(
    () => totalByYear(DORM_ITEMS, (item, yearKey) => {
      const row = expenseRow(draft, "yurt", item.key);
      return dormStudentCount(item, yearKey) * serviceUnitCost(row, factors, yearKey);
    }),
    [dormIncomeByKey, draft, factors],
  );
  const totalExpenses = GIDERLER_YEAR_KEYS.reduce<YearMap>((acc, yearKey) => {
    acc[yearKey] = operatingTotals[yearKey] + serviceTotals[yearKey] + dormTotals[yearKey];
    return acc;
  }, { y1: 0, y2: 0, y3: 0 });

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ giderler: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Giderler kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Giderler kaydedilemedi.");
    }
  }

  function handleCancel() {
    setDraft(normalizeGiderlerDraft(value));
    setDirtyPaths([]);
    onDirtyPathsChange([]);
    setMessage("");
  }

  const editableHint = canEdit
    ? "Giderler leaf-field patch olarak kaydedilir; HR kaynakli maas satirlari salt okunurdur."
    : disabledReason;

  return (
    <Card testID="giderler-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Giderler Editoru</Text>
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
        {(["isletme", "ogrenimDisi", "yurt"] as SectionKey[]).map((section) => (
          <Chip
            key={section}
            label={SECTION_LABELS[section]}
            active={activeSection === section}
            onPress={() => setActiveSection(section)}
            testID={`giderler-section-${section}`}
          />
        ))}
      </View>

      <FormSection title="Gider Ozeti" subtitle={`Para birimi: ${currencyCode}`}>
        {GIDERLER_YEAR_KEYS.map((yearKey) => (
          <ReadonlyValueRow
            key={yearKey}
            label={yearLabel(scenario, yearKey)}
            value={formatMoney(totalExpenses[yearKey], currencyCode)}
          />
        ))}
      </FormSection>

      {activeSection === "isletme" ? (
        <OperatingSection
          draft={draft}
          scenario={scenario}
          currencyCode={currencyCode}
          canEdit={canEdit}
          factors={factors}
          salaryByYear={salaryByYear}
          totals={operatingTotals}
          onUpdate={updateOperating}
        />
      ) : activeSection === "ogrenimDisi" ? (
        <ServiceSection
          draft={draft}
          scenario={scenario}
          currencyCode={currencyCode}
          canEdit={canEdit}
          factors={factors}
          incomeByKey={nonEdIncomeByKey}
          totals={serviceTotals}
          onUpdate={updateService}
        />
      ) : (
        <DormSection
          draft={draft}
          scenario={scenario}
          currencyCode={currencyCode}
          canEdit={canEdit}
          factors={factors}
          incomeByKey={dormIncomeByKey}
          totals={dormTotals}
          onUpdate={updateDorm}
        />
      )}

      {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
      <View style={styles.actions}>
        <Button
          label="Vazgec"
          icon="close-outline"
          variant="secondary"
          disabled={!isDirty || saving}
          onPress={handleCancel}
          style={styles.actionButton}
          testID="giderler-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="giderler-save-button"
        />
      </View>
    </Card>
  );
}

function OperatingSection({
  draft,
  scenario,
  currencyCode,
  canEdit,
  factors,
  salaryByYear,
  totals,
  onUpdate,
}: {
  draft: GiderlerObject;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  factors: YearMap;
  salaryByYear: SalaryByYear;
  totals: YearMap;
  onUpdate: (key: string, value: number | null) => void;
}) {
  return (
    <FormSection title="Isletme Giderleri" subtitle="Y1 girilir; Y2/Y3 enflasyonla turetilir. HR maas satirlari IK'dan gelir.">
      {OPERATING_ITEMS.map((item) => {
        const isHr = IK_AUTO_KEYS.has(item.key);
        const y1 = operatingAmount(draft, salaryByYear, factors, item.key, "y1");
        return (
          <View key={item.key} style={styles.rowCard}>
            <View style={styles.rowHead}>
              <Text style={styles.rowTitle}>{item.no}. {item.label}</Text>
              <Text style={styles.rowKey}>{item.code} / {item.key}</Text>
            </View>
            <FormRow label={yearLabel(scenario, "y1")} hint={isHr ? "IK editorunden otomatik hesaplanir." : undefined}>
              <FinancialNumberInput
                value={y1}
                unit={currencyCode}
                disabled={!canEdit || isHr}
                onChange={(next) => onUpdate(item.key, next)}
                testID={`giderler-isletme-${item.key}`}
              />
            </FormRow>
            <ReadonlyValueRow label={yearLabel(scenario, "y2")} value={formatMoney(operatingAmount(draft, salaryByYear, factors, item.key, "y2"), currencyCode)} />
            <ReadonlyValueRow label={yearLabel(scenario, "y3")} value={formatMoney(operatingAmount(draft, salaryByYear, factors, item.key, "y3"), currencyCode)} />
          </View>
        );
      })}
      <ReadonlyValueRow label="Isletme Y1 toplam" value={formatMoney(totals.y1, currencyCode)} />
      <ReadonlyValueRow label="Isletme Y2 toplam" value={formatMoney(totals.y2, currencyCode)} />
      <ReadonlyValueRow label="Isletme Y3 toplam" value={formatMoney(totals.y3, currencyCode)} />
    </FormSection>
  );
}

function ServiceSection({
  draft,
  scenario,
  currencyCode,
  canEdit,
  factors,
  incomeByKey,
  totals,
  onUpdate,
}: {
  draft: GiderlerObject;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  factors: YearMap;
  incomeByKey: Map<string, Record<string, unknown>>;
  totals: YearMap;
  onUpdate: (key: string, value: number | null) => void;
}) {
  return (
    <FormSection title="Ogrenim Disi Hizmet Giderleri" subtitle="Ogrenci sayilari Gelirler sekmesinden gelir; burada yalniz birim maliyet girilir.">
      {SERVICE_ITEMS.map((item) => {
        const row = expenseRow(draft, "ogrenimDisi", item.key);
        const incomeRow = incomeByKey.get(SERVICE_TO_INCOME_KEY[item.key]);
        return (
          <ServiceCostCard
            key={item.key}
            item={item}
            row={row}
            incomeRow={incomeRow}
            scenario={scenario}
            currencyCode={currencyCode}
            canEdit={canEdit}
            factors={factors}
            onUpdate={onUpdate}
          />
        );
      })}
      <ReadonlyValueRow label="Ogrenim disi Y1 toplam" value={formatMoney(totals.y1, currencyCode)} />
      <ReadonlyValueRow label="Ogrenim disi Y2 toplam" value={formatMoney(totals.y2, currencyCode)} />
      <ReadonlyValueRow label="Ogrenim disi Y3 toplam" value={formatMoney(totals.y3, currencyCode)} />
    </FormSection>
  );
}

function DormSection({
  draft,
  scenario,
  currencyCode,
  canEdit,
  factors,
  incomeByKey,
  totals,
  onUpdate,
}: {
  draft: GiderlerObject;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  factors: YearMap;
  incomeByKey: Map<string, Record<string, unknown>>;
  totals: YearMap;
  onUpdate: (key: string, value: number | null) => void;
}) {
  return (
    <FormSection title="Yurt ve Konaklama Giderleri" subtitle="Ogrenci sayilari Gelirler sekmesinden gelir; burada yalniz birim maliyet girilir.">
      {DORM_ITEMS.map((item) => {
        const row = expenseRow(draft, "yurt", item.key);
        const incomeRow = incomeByKey.get(DORM_TO_INCOME_KEY[item.key]);
        return (
          <ServiceCostCard
            key={item.key}
            item={item}
            row={row}
            incomeRow={incomeRow}
            scenario={scenario}
            currencyCode={currencyCode}
            canEdit={canEdit}
            factors={factors}
            onUpdate={onUpdate}
          />
        );
      })}
      <ReadonlyValueRow label="Yurt Y1 toplam" value={formatMoney(totals.y1, currencyCode)} />
      <ReadonlyValueRow label="Yurt Y2 toplam" value={formatMoney(totals.y2, currencyCode)} />
      <ReadonlyValueRow label="Yurt Y3 toplam" value={formatMoney(totals.y3, currencyCode)} />
    </FormSection>
  );
}

function ServiceCostCard({
  item,
  row,
  incomeRow,
  scenario,
  currencyCode,
  canEdit,
  factors,
  onUpdate,
}: {
  item: ExpenseItemDef;
  row: ExpenseRow;
  incomeRow?: Record<string, unknown>;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  factors: YearMap;
  onUpdate: (key: string, value: number | null) => void;
}) {
  const unitCost = num(row.unitCost);
  const totals = GIDERLER_YEAR_KEYS.reduce<YearMap>((acc, yearKey) => {
    const students = studentCountFromIncomeRow(incomeRow, yearKey);
    const cost = serviceUnitCost(row, factors, yearKey);
    acc[yearKey] = students * cost;
    return acc;
  }, { y1: 0, y2: 0, y3: 0 });

  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{item.no}. {item.label}</Text>
        <Text style={styles.rowKey}>{item.code} / {item.key}</Text>
      </View>
      <View style={styles.readonlyGroup}>
        {GIDERLER_YEAR_KEYS.map((yearKey) => (
          <ReadonlyValueRow
            key={yearKey}
            label={`${yearLabel(scenario, yearKey)} ogrenci`}
            value={formatInt(studentCountFromIncomeRow(incomeRow, yearKey))}
          />
        ))}
      </View>
      <FormRow label={`${yearLabel(scenario, "y1")} birim maliyet`}>
        <FinancialNumberInput
          value={unitCost}
          unit={currencyCode}
          disabled={!canEdit}
          onChange={(next) => onUpdate(item.key, next)}
          testID={`giderler-${item.key}-unitCost`}
        />
      </FormRow>
      <ReadonlyValueRow label={`${yearLabel(scenario, "y2")} birim`} value={formatMoney(serviceUnitCost(row, factors, "y2"), currencyCode)} />
      <ReadonlyValueRow label={`${yearLabel(scenario, "y3")} birim`} value={formatMoney(serviceUnitCost(row, factors, "y3"), currencyCode)} />
      <ReadonlyValueRow label="Y1 toplam" value={formatMoney(totals.y1, currencyCode)} />
      <ReadonlyValueRow label="Y2 toplam" value={formatMoney(totals.y2, currencyCode)} />
      <ReadonlyValueRow label="Y3 toplam" value={formatMoney(totals.y3, currencyCode)} />
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
    gap: spacing.xs,
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
  },
  readonlyGroup: {
    gap: spacing.xs,
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
