import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
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
import { Button, Card } from "@/src/ui/components";
import {
  computeDiscountsLivePreview,
  DiscountsEditor,
  type DiscountsLivePreview,
} from "@/src/scenario/DiscountsEditor";
import type { DiscountsDraft } from "@/src/scenario/discountsAdapter";

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

function emptyDiscountPreview(inputs: Inputs | null): DiscountsLivePreview {
  return computeDiscountsLivePreview(inputs, []);
}


export type GiderlerSectionFilter = "missing" | "done";
export type GiderlerMobileSectionKey = SectionKey | "bursIndirimler" | "giderOzeti";

const SECTION_ORDER: GiderlerMobileSectionKey[] = ["isletme", "ogrenimDisi", "yurt", "bursIndirimler", "giderOzeti"];

export const GIDERLER_SECTION_LABELS_ROUTE: Record<GiderlerMobileSectionKey, string> = {
  isletme: "İşletme",
  ogrenimDisi: "Öğrenim Dışı",
  yurt: "Yurt",
  bursIndirimler: "Burs ve İndirimler",
  giderOzeti: "Gider Özeti",
};

const SECTION_DESCRIPTIONS: Record<GiderlerMobileSectionKey, string> = {
  isletme: "Tutar bazlı giderler; İK maaş satırları readonly",
  ogrenimDisi: "Öğrenci × birim maliyet = toplam gider",
  yurt: "Yurt öğrenci sayısı × birim maliyet",
  bursIndirimler: "Burs ve indirim satırları, öğrenci ve tutar etkisi",
  giderOzeti: "Readonly yıllık gider toplamları",
};

type SectionState = {
  key: GiderlerMobileSectionKey;
  label: string;
  description: string;
  done: boolean;
  readonly?: boolean;
};

type ExtendedProps = Props & {
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: GiderlerSectionFilter;
  onSectionFilterChange?: (filter: GiderlerSectionFilter) => void;
  activeSectionKey?: GiderlerMobileSectionKey | null;
  onActiveSectionKeyChange?: (section: GiderlerMobileSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
  discountsValue?: unknown;
  discountsCanEdit?: boolean;
  discountsDisabledReason?: string;
  discountsSaving?: boolean;
  onDiscountsDirtyPathsChange?: (paths: string[]) => void;
  onDiscountsSave?: (draft: DiscountsDraft) => Promise<void>;
};

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
  sectionMode = true,
  onSectionModeBack,
  sectionFilter: controlledSectionFilter,
  onSectionFilterChange,
  activeSectionKey: controlledActiveSectionKey,
  onActiveSectionKeyChange,
  showSectionModeTopControls = true,
  stickySectionActions = true,
  stickyBottomInset = 0,
  discountsValue,
  discountsCanEdit,
  discountsDisabledReason,
  discountsSaving,
  onDiscountsDirtyPathsChange,
  onDiscountsSave,
}: ExtendedProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [activeYear, setActiveYear] = React.useState<GiderlerYearKey>("y1");
  const [draft, setDraft] = React.useState<GiderlerObject>(() => normalizeGiderlerDraft(value));
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<GiderlerSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<GiderlerMobileSectionKey | null>(null);
  const [discountsLivePreview, setDiscountsLivePreview] = React.useState<DiscountsLivePreview>(() =>
    computeDiscountsLivePreview(inputs, discountsValue),
  );

  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const activeMobileSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 78;
  const stickyEditorHeight = Math.max(460, windowHeight - 150);

  const setSectionFilter = React.useCallback((next: GiderlerSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);

  const setActiveMobileSection = React.useCallback((next: GiderlerMobileSectionKey | null) => {
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);

  React.useEffect(() => {
    setDraft(normalizeGiderlerDraft(value));
    setDirtyPaths([]);
    setActiveMobileSection(null);
    onDirtyPathsChange([]);
  }, [onDirtyPathsChange, setActiveMobileSection, value]);

  React.useEffect(() => {
    setDiscountsLivePreview(computeDiscountsLivePreview(inputs, discountsValue));
  }, [discountsValue, inputs]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  const factors = React.useMemo(() => getInflationFactors(inputs?.temelBilgiler), [inputs?.temelBilgiler]);
  const salaryByYear = React.useMemo(() => buildSalaryByYear(inputs?.ik), [inputs?.ik]);
  const nonEdIncomeByKey = React.useMemo(() => incomeRowsByKey(inputs, "nonEducationFees"), [inputs]);
  const dormIncomeByKey = React.useMemo(() => incomeRowsByKey(inputs, "dormitory"), [inputs]);
  const isDirty = dirtyPaths.length > 0;

  function markDirty(path: readonly PathToken[]) {
    setDirtyPaths((prev) => Array.from(new Set([...prev, dirtyPath(path)])));
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

  const discountRows = React.useMemo(
    () => Array.isArray(discountsValue) ? discountsValue as Array<Record<string, unknown>> : [],
    [discountsValue],
  );
  const activeDiscountPreview = discountsLivePreview || emptyDiscountPreview(inputs);

  const sectionStates = React.useMemo<SectionState[]>(() => {
    const operatingDone = operatingTotals.y1 > 0;
    const serviceDone = serviceTotals.y1 > 0;
    const dormDone = dormTotals.y1 > 0;
    const discountsDone = activeDiscountPreview.amounts.y1 > 0 || discountRows.some((row) =>
      num(row.studentCount ?? row.studentCountY2 ?? row.studentCountY3) > 0 &&
      num(row.value ?? row.valueY2 ?? row.valueY3) > 0,
    );
    return SECTION_ORDER.map((key) => ({
      key,
      label: GIDERLER_SECTION_LABELS_ROUTE[key],
      description: SECTION_DESCRIPTIONS[key],
      done: key === "isletme"
        ? operatingDone
        : key === "ogrenimDisi"
          ? serviceDone
          : key === "yurt"
            ? dormDone
            : key === "bursIndirimler"
              ? discountsDone
              : true,
      readonly: key === "giderOzeti",
    }));
  }, [activeDiscountPreview.amounts.y1, discountRows, dormTotals.y1, operatingTotals.y1, serviceTotals.y1]);

  const missingSections = sectionStates.filter((section) => !section.done && !section.readonly);
  const doneSections = sectionStates.filter((section) => section.done || section.readonly);
  const visibleSections = sectionFilter === "missing" ? missingSections : doneSections;

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

  function renderSectionModeTop(showTabs: boolean) {
    if (!showSectionModeTopControls) return null;
    return (
      <View style={styles.sectionModeTopRow}>
        <Pressable
          onPress={activeMobileSection ? () => setActiveMobileSection(null) : onSectionModeBack}
          hitSlop={12}
          style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
          testID={activeMobileSection ? "giderler-section-back-button" : "scenario-back-button"}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="giderler-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="giderler-filter-done"
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

  function renderYearTabs() {
    return (
      <View style={styles.mobileYearTabs}>
        {GIDERLER_YEAR_KEYS.map((yearKey) => {
          const active = activeYear === yearKey;
          return (
            <Pressable
              key={yearKey}
              onPress={() => setActiveYear(yearKey)}
              style={[styles.mobileYearTab, active ? styles.mobileYearTabActive : null]}
              testID={`giderler-mobile-year-${yearKey}`}
            >
              <Text style={[styles.mobileYearTabText, active ? styles.mobileYearTabTextActive : null]}>
                {yearKey.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderActionButtons() {
    return (
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
    );
  }

  function renderStickyActions() {
    return (
      <View style={[styles.stickyActions, { bottom: stickyActionBottom }]}>
        {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
        {renderActionButtons()}
      </View>
    );
  }

  function renderOperatingSection() {
    return (
      <>
        <Card style={styles.mobileInfoCard}>
          <Text style={styles.mobileInfoTitle}>Kompakt işletme giderleri</Text>
          <Text style={styles.mobileInfoText}>
            Öğrenci sayısı olmayan satırlar iki kolonlu gösterilir. İK kaynaklı maaşlar readonly kalır.
          </Text>
        </Card>

        <View style={styles.mobileTableCard}>
          <View style={styles.mobileTableHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mobileTableTitle}>İşletme Giderleri</Text>
              <Text style={styles.mobileTableSub}>Y1 girilir; Y2/Y3 enflasyonla türetilir.</Text>
            </View>
            <StatusBadge done={operatingTotals.y1 > 0} readonly={false} />
          </View>
          {renderYearTabs()}
          <View style={[styles.compactHeader, styles.compactHeaderTwo]}>
            <Text style={styles.compactHeaderText}>Gider kalemi</Text>
            <Text style={[styles.compactHeaderText, styles.compactHeaderRight]}>Tutar</Text>
          </View>
          <View style={styles.compactRows}>
            {OPERATING_ITEMS.map((item) => {
              const isHr = IK_AUTO_KEYS.has(item.key);
              const amount = operatingAmount(draft, salaryByYear, factors, item.key, activeYear);
              const editable = canEdit && activeYear === "y1" && !isHr;
              return (
                <View key={item.key} style={[styles.compactRow, styles.compactRowTwo]}>
                  <View style={styles.compactNameCell}>
                    <View style={styles.compactNameLine}>
                      <View style={styles.rowNoPill}><Text style={styles.rowNoText}>{item.no}</Text></View>
                      <Text style={styles.compactRowTitle} numberOfLines={2}>{item.label}</Text>
                    </View>
                    <Text style={styles.compactTag}>{isHr ? "İK otomatik" : `${item.code} • ${item.key}`}</Text>
                  </View>
                  <CompactMoneyField
                    value={amount}
                    unit={currencyCode}
                    editable={editable}
                    readonlyTone={isHr || activeYear !== "y1"}
                    onChange={(next) => updateOperating(item.key, next)}
                    testID={activeYear === "y1" ? `giderler-isletme-${item.key}` : undefined}
                  />
                </View>
              );
            })}
          </View>
          <GrandTotal
            label={`${activeYear.toUpperCase()} toplam işletme gideri`}
            value={formatMoney(operatingTotals[activeYear], currencyCode)}
          />
        </View>
      </>
    );
  }

  function renderServiceLikeSection(section: "ogrenimDisi" | "yurt") {
    const items = section === "ogrenimDisi" ? SERVICE_ITEMS : DORM_ITEMS;
    const totals = section === "ogrenimDisi" ? serviceTotals : dormTotals;
    const title = section === "ogrenimDisi" ? "Öğrenim Dışı Hizmet Giderleri" : "Yurt ve Konaklama Giderleri";
    const info = section === "ogrenimDisi"
      ? "Öğrenci sayıları Gelirler modülünden gelir. Bu sayfada yalnız birim maliyet düzenlenir."
      : "Yurt ve yaz okulu öğrenci sayıları Gelirler modülünden gelir; birim maliyet burada girilir.";

    return (
      <>
        <Card style={styles.mobileInfoCard}>
          <Text style={styles.mobileInfoTitle}>Kompakt üç kolonlu kart</Text>
          <Text style={styles.mobileInfoText}>{info}</Text>
        </Card>

        <View style={styles.mobileTableCard}>
          <View style={styles.mobileTableHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mobileTableTitle}>{title}</Text>
              <Text style={styles.mobileTableSub}>Öğrenci sayısı × birim maliyet = toplam gider</Text>
            </View>
            <StatusBadge done={totals.y1 > 0} readonly={false} />
          </View>
          {renderYearTabs()}
          <View style={[styles.compactHeader, styles.compactHeaderThree]}>
            <Text style={styles.compactHeaderText}>Kalem</Text>
            <Text style={styles.compactHeaderText}>Maliyet</Text>
            <Text style={[styles.compactHeaderText, styles.compactHeaderRight]}>Toplam</Text>
          </View>
          <View style={styles.compactRows}>
            {items.map((item) => {
              const row = expenseRow(draft, section, item.key);
              const students = section === "ogrenimDisi" ? serviceStudentCount(item, activeYear) : dormStudentCount(item, activeYear);
              const unitCost = serviceUnitCost(row, factors, activeYear);
              const total = students * unitCost;
              const editable = canEdit && activeYear === "y1";
              return (
                <View key={item.key} style={[styles.compactRow, styles.compactRowThree]}>
                  <View style={styles.compactNameCell}>
                    <View style={styles.compactNameLine}>
                      <View style={styles.rowNoPill}><Text style={styles.rowNoText}>{item.no}</Text></View>
                      <Text style={styles.compactRowTitle} numberOfLines={2}>{item.label}</Text>
                    </View>
                    <Text style={styles.compactRowSub}>{formatInt(students)} öğrenci</Text>
                  </View>
                  <CompactMoneyField
                    value={unitCost}
                    unit={currencyCode}
                    editable={editable}
                    readonlyTone={activeYear !== "y1"}
                    onChange={(next) => section === "ogrenimDisi" ? updateService(item.key, next) : updateDorm(item.key, next)}
                    testID={activeYear === "y1" ? `giderler-${item.key}-unitCost` : undefined}
                  />
                  <View style={styles.compactTotalCell}>
                    <Text style={styles.compactTotalText}>{formatMoney(total, currencyCode)}</Text>
                    <Text style={styles.compactTotalSub}>{formatInt(students)} × {formatMoney(unitCost, currencyCode)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <GrandTotal
            label={`${activeYear.toUpperCase()} toplam ${section === "ogrenimDisi" ? "öğrenim dışı" : "yurt"} gideri`}
            value={formatMoney(totals[activeYear], currencyCode)}
          />
        </View>
      </>
    );
  }

  function renderSummarySection() {
    return (
      <>
        <Card style={styles.mobileInfoCard}>
          <Text style={styles.mobileInfoTitle}>Readonly gider toplamları</Text>
          <Text style={styles.mobileInfoText}>Bu sayfa hesaplanan yıllık gider toplamlarını gösterir. Kaydet/Vazgeç barı gösterilmez.</Text>
        </Card>
        <Card style={styles.summaryCard}>
          {renderYearTabs()}
          <SummaryRow label="İşletme" value={formatMoney(operatingTotals[activeYear], currencyCode)} />
          <SummaryRow label="Öğrenim Dışı" value={formatMoney(serviceTotals[activeYear], currencyCode)} />
          <SummaryRow label="Yurt" value={formatMoney(dormTotals[activeYear], currencyCode)} />
          <SummaryRow label="Burs ve İndirimler" value={`-${formatMoney(activeDiscountPreview.amounts[activeYear], currencyCode)}`} />
          <SummaryRow
            label="Net Ciro önizleme"
            value={formatMoney(Math.max(0, num(activeDiscountPreview.incomeYears[activeYear]?.grossTuition) - activeDiscountPreview.amounts[activeYear]), currencyCode)}
          />
        </Card>
        <Card style={styles.summaryCard}>
          {GIDERLER_YEAR_KEYS.map((yearKey) => (
            <SummaryRow key={yearKey} label={`${yearLabel(scenario, yearKey)} toplam gider`} value={formatMoney(totalExpenses[yearKey], currencyCode)} />
          ))}
        </Card>
      </>
    );
  }

  function renderSectionForm(section: GiderlerMobileSectionKey) {
    if (section === "isletme") return renderOperatingSection();
    if (section === "ogrenimDisi") return renderServiceLikeSection("ogrenimDisi");
    if (section === "yurt") return renderServiceLikeSection("yurt");
    if (section === "bursIndirimler") {
      return (
        <DiscountsEditor
          value={discountsValue}
          inputs={inputs}
          scenario={scenario}
          currencyCode={currencyCode}
          canEdit={discountsCanEdit ?? canEdit}
          disabledReason={discountsDisabledReason ?? disabledReason}
          saving={discountsSaving ?? false}
          onDirtyPathsChange={onDiscountsDirtyPathsChange ?? (() => undefined)}
          onSave={onDiscountsSave ?? (async () => undefined)}
          onLivePreviewChange={(_, preview) => setDiscountsLivePreview(preview)}
          compact
          stickyActions={Boolean(stickySectionActions)}
          stickyBottomInset={stickyBottomInset}
          stickyScrollHeight={stickyEditorHeight}
        />
      );
    }
    return renderSummarySection();
  }

  if (sectionMode) {
    if (activeMobileSection) {
      const showEditableActions = activeMobileSection !== "giderOzeti" && activeMobileSection !== "bursIndirimler";
      if (stickySectionActions && showEditableActions) {
        return (
          <View testID="giderler-editor" style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}>
            {renderSectionModeTop(false)}
            <ScrollView
              style={styles.sectionEditorScroll}
              contentContainerStyle={[styles.sectionEditorContent, { paddingBottom: stickyActionScrollPadding }]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {renderSectionForm(activeMobileSection)}
            </ScrollView>
            {renderStickyActions()}
          </View>
        );
      }

      return (
        <View testID="giderler-editor" style={styles.sectionModeRoot}>
          {renderSectionModeTop(false)}
          {renderSectionForm(activeMobileSection)}
          {showEditableActions ? (
            <>
              {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
              {renderActionButtons()}
            </>
          ) : null}
        </View>
      );
    }

    return (
      <View testID="giderler-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}
        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <GiderlerSectionCard
                key={section.key}
                section={section}
                onPress={() => setActiveMobileSection(section.key)}
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
                  ? "Giderler bölümlerinin tamamı kontrol edildi."
                  : "Bir bölüm tamamlandığında burada görünür."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  return (
    <View testID="giderler-editor" style={styles.sectionModeRoot}>
      {renderSectionModeTop(true)}
      {renderSectionForm(activeMobileSection || "isletme")}
      {activeMobileSection !== "giderOzeti" ? renderActionButtons() : null}
    </View>
  );
}

function GiderlerSectionCard({
  section,
  onPress,
}: {
  section: SectionState;
  onPress: () => void;
}) {
  const iconName = section.readonly ? "stats-chart-outline" : section.done ? "checkmark-circle-outline" : "alert-circle-outline";
  const iconColor = section.readonly ? colors.primary : section.done ? colors.success : colors.warn;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mobileSectionCard, pressed ? styles.pressed : null]}
      testID={`giderler-section-card-${section.key}`}
    >
      <View style={[styles.mobileSectionIcon, { backgroundColor: `${iconColor}1F` }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.mobileSectionBody}>
        <View style={styles.mobileSectionHeader}>
          <Text style={styles.mobileSectionTitle}>{section.label}</Text>
          <View style={[
            styles.mobileSectionBadge,
            section.readonly ? styles.mobileSectionBadgeInfo : section.done ? styles.mobileSectionBadgeDone : styles.mobileSectionBadgeMissing,
          ]}>
            <Text style={[
              styles.mobileSectionBadgeText,
              { color: section.readonly ? colors.primary : section.done ? colors.success : colors.warn },
            ]}>
              {section.readonly ? "Bilgi" : section.done ? "Tamam" : "Eksik"}
            </Text>
          </View>
        </View>
        <Text style={styles.mobileSectionSubtitle}>{section.description}</Text>
        <View style={styles.mobileSectionFooter}>
          <Text style={styles.mobileSectionHint}>
            {section.readonly ? "Görüntüle" : section.done ? "Kontrol et" : "Doldur"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

function StatusBadge({ done, readonly }: { done: boolean; readonly?: boolean }) {
  return (
    <View style={[
      styles.statusBadge,
      readonly ? styles.statusBadgeInfo : done ? styles.statusBadgeDone : styles.statusBadgeMissing,
    ]}>
      <Text style={[
        styles.statusBadgeText,
        { color: readonly ? colors.primary : done ? colors.success : colors.warn },
      ]}>
        {readonly ? "Bilgi" : done ? "Tamam" : "Eksik"}
      </Text>
    </View>
  );
}

function GrandTotal({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.grandTotal}>
      <Text style={styles.grandTotalLabel}>{label}</Text>
      <Text style={styles.grandTotalValue}>{value}</Text>
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

function CompactMoneyField({
  value,
  unit,
  editable,
  readonlyTone,
  onChange,
  testID,
}: {
  value: number;
  unit: string;
  editable: boolean;
  readonlyTone?: boolean;
  onChange: (value: number | null) => void;
  testID?: string;
}) {
  const [text, setText] = React.useState(value > 0 && editable ? String(value) : "");

  React.useEffect(() => {
    if (editable) setText(value > 0 ? String(value) : "");
  }, [editable, value]);

  if (!editable) {
    return (
      <View style={[styles.compactMoneyReadonly, readonlyTone ? styles.compactMoneyAuto : null]}>
        <Text style={[styles.compactMoneyReadonlyText, readonlyTone ? styles.compactMoneyAutoText : null]} numberOfLines={1}>
          {formatMoney(value, unit)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.compactMoneyInputWrap, value <= 0 ? styles.compactMoneyWarn : null]}>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={(nextText) => {
          setText(nextText);
          onChange(parseCompactNumber(nextText));
        }}
        keyboardType="decimal-pad"
        placeholder="Giriniz"
        placeholderTextColor={colors.textMuted}
        style={styles.compactMoneyInput}
      />
      <Text style={styles.compactMoneyUnit}>{unit}</Text>
    </View>
  );
}

function parseCompactNumber(text: string) {
  const normalized = text.replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const styles = StyleSheet.create({
  sectionModeRoot: {
    gap: spacing.md,
  },
  sectionModeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTopBackButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  topTabs: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  topTabActive: {
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
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
    gap: spacing.sm,
  },
  mobileSectionCard: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileSectionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileSectionBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  mobileSectionHeader: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  mobileSectionTitle: {
    flex: 1,
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  mobileSectionSubtitle: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 18,
  },
  mobileSectionFooter: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mobileSectionHint: {
    color: colors.textMuted,
    ...font.small,
    fontWeight: "800",
  },
  mobileSectionBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
  },
  mobileSectionBadgeDone: {
    backgroundColor: "#10B9811A",
    borderColor: "#10B98155",
  },
  mobileSectionBadgeMissing: {
    backgroundColor: "#F973161A",
    borderColor: "#F9731655",
  },
  mobileSectionBadgeInfo: {
    backgroundColor: "#3B82F61A",
    borderColor: "#3B82F655",
  },
  mobileSectionBadgeText: {
    ...font.tiny,
    fontWeight: "900",
  },
  emptySectionCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptySectionTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
    textAlign: "center",
  },
  emptySectionText: {
    color: colors.textDim,
    ...font.small,
    textAlign: "center",
    lineHeight: 18,
  },
  sectionEditorShell: {
    position: "relative",
    gap: spacing.sm,
  },
  sectionEditorScroll: {
    flex: 1,
  },
  sectionEditorContent: {
    gap: spacing.md,
  },
  mobileInfoCard: {
    gap: spacing.xs,
    backgroundColor: colors.bgElev,
  },
  mobileInfoTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  mobileInfoText: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 18,
  },
  mobileTableCard: {
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileTableHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  mobileTableTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  mobileTableSub: {
    marginTop: 3,
    color: colors.textDim,
    ...font.small,
    lineHeight: 17,
  },
  mobileYearTabs: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  mobileYearTab: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileYearTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mobileYearTabText: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  mobileYearTabTextActive: {
    color: colors.primaryText,
  },
  compactHeader: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  compactHeaderTwo: {
    flexDirection: "row",
  },
  compactHeaderThree: {
    flexDirection: "row",
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
    gap: 6,
    alignItems: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.bgElev2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  compactRowTwo: {
    flexDirection: "row",
  },
  compactRowThree: {
    flexDirection: "row",
  },
  compactNameCell: {
    flex: 1.35,
    minWidth: 0,
  },
  compactNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  rowNoPill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F2FF",
  },
  rowNoText: {
    color: colors.primary,
    ...font.tiny,
    fontWeight: "900",
  },
  compactRowTitle: {
    flex: 1,
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    lineHeight: 16,
  },
  compactRowSub: {
    marginTop: 3,
    color: colors.textMuted,
    ...font.tiny,
    fontWeight: "800",
  },
  compactTag: {
    alignSelf: "flex-start",
    marginTop: 4,
    color: colors.primary,
    ...font.tiny,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#E8F2FF",
    overflow: "hidden",
  },
  compactMoneyInputWrap: {
    flex: 0.95,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    overflow: "hidden",
  },
  compactMoneyWarn: {
    borderColor: "#F9731655",
    backgroundColor: "#F9731610",
  },
  compactMoneyInput: {
    flex: 1,
    color: colors.text,
    textAlign: "right",
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  compactMoneyUnit: {
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
  compactMoneyReadonly: {
    flex: 0.95,
    minHeight: 34,
    alignItems: "flex-end",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    paddingHorizontal: 8,
  },
  compactMoneyAuto: {
    backgroundColor: "#E8F2FF",
    borderColor: "#3B82F655",
  },
  compactMoneyReadonlyText: {
    color: colors.text,
    ...font.tiny,
    fontWeight: "900",
    textAlign: "right",
  },
  compactMoneyAutoText: {
    color: colors.primary,
  },
  compactTotalCell: {
    flex: 0.92,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  compactTotalText: {
    color: colors.text,
    ...font.tiny,
    fontWeight: "900",
    textAlign: "right",
  },
  compactTotalSub: {
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
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusBadgeDone: {
    backgroundColor: "#10B9811A",
    borderColor: "#10B98155",
  },
  statusBadgeMissing: {
    backgroundColor: "#F973161A",
    borderColor: "#F9731655",
  },
  statusBadgeInfo: {
    backgroundColor: "#3B82F61A",
    borderColor: "#3B82F655",
  },
  statusBadgeText: {
    ...font.tiny,
    fontWeight: "900",
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
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
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
});
