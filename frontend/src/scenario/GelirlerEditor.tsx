import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  computeIncomeStudentsFromGrades,
  GelirlerDraft,
  GelirlerObject,
  GelirlerRow,
  GelirlerSectionKey,
  GelirlerYearKey,
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
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: GelirlerSectionFilter;
  onSectionFilterChange?: (filter: GelirlerSectionFilter) => void;
  activeSectionKey?: GelirlerMobileSectionKey | null;
  onActiveSectionKeyChange?: (section: GelirlerMobileSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
};

type GradeRow = Record<string, unknown>;
export type GelirlerSectionFilter = "missing" | "done";
export type GelirlerMobileSectionKey = GelirlerSectionKey | "brutGelirOzeti";

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
  const planningGrades = React.useMemo(
    () => normalizePlanningGrades(inputs?.gradesYears, inputs?.grades),
    [inputs?.grades, inputs?.gradesYears],
  );
  const [activeSection, setActiveSection] = React.useState<GelirlerSectionKey>("tuition");
  const [activeYear, setActiveYear] = React.useState<GelirlerYearKey>("y1");
  const [draft, setDraft] = React.useState<GelirlerObject>(() =>
    normalizeGelirlerDraft(value, planningGrades.y1, inputs?.temelBilgiler?.kademeler),
  );
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<GelirlerSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<GelirlerMobileSectionKey | null>(null);
  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const setSectionFilter = React.useCallback((next: GelirlerSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);
  const activeMobileSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const setActiveMobileSection = React.useCallback((next: GelirlerMobileSectionKey | null) => {
    if (next && next !== "brutGelirOzeti") setActiveSection(next);
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 78;
  const stickyEditorHeight = Math.max(440, windowHeight - 150);

  React.useEffect(() => {
    setDraft(normalizeGelirlerDraft(value, planningGrades.y1, inputs?.temelBilgiler?.kademeler));
    setDirtyPaths([]);
    setActiveMobileSection(null);
    onDirtyPathsChange([]);
  }, [inputs?.temelBilgiler?.kademeler, onDirtyPathsChange, planningGrades.y1, setActiveMobileSection, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

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

  function visibleRowsForSection(section: GelirlerSectionKey) {
    const rows = getRows(draft, section);
    if (section !== "tuition") return rows;
    return rows.filter((row) => {
      const baseKey = TUITION_BASE_BY_KEY[row.key];
      const baseEnabled = !baseKey || kademeConfig[baseKey === "kg" ? "okulOncesi" : baseKey]?.enabled !== false;
      return baseEnabled && isKademeKeyVisible(row.key, programType);
    });
  }

  const visibleRows = React.useMemo(
    () => visibleRowsForSection(activeSection),
    [activeSection, draft, kademeConfig, programType],
  );

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
  const tuitionRows = visibleRowsForSection("tuition");
  const nonEducationRows = visibleRowsForSection("nonEducationFees");
  const dormitoryRows = visibleRowsForSection("dormitory");
  const otherIncomeRows = visibleRowsForSection("otherInstitutionIncome");
  const tuitionMissing = tuitionRows.filter((row) => num(row.unitFee) <= 0).length;
  const manualStudentMissing = (section: GelirlerSectionKey, rows: GelirlerRow[]) =>
    rows.filter((row) =>
      num(row.unitFee) <= 0 ||
      GELIRLER_YEAR_KEYS.some((yearKey) => studentCountForRow(section, row, yearKey) <= 0),
    ).length;
  const nonEducationMissing = manualStudentMissing("nonEducationFees", nonEducationRows);
  const dormitoryMissing = manualStudentMissing("dormitory", dormitoryRows);
  const otherIncomeMissing = otherIncomeRows.filter((row) => num(row.amount) <= 0).length + (num(draft.governmentIncentives) <= 0 ? 1 : 0);
  const sectionCards: GelirlerSectionCardModel[] = [
    {
      key: "tuition",
      title: GELIRLER_SECTION_LABELS.tuition,
      subtitle: "Tek kart icinde kademeler, birim ucretler ve toplam",
      helper: tuitionMissing ? `${tuitionMissing} kademe icin birim ucret bekliyor.` : "Tum kademe ucretleri dolu.",
      icon: "school-outline",
      status: tuitionMissing ? "missing" : "done",
      done: tuitionMissing === 0,
    },
    {
      key: "nonEducationFees",
      title: GELIRLER_SECTION_LABELS.nonEducationFees,
      subtitle: "Yemek, uniforma, kitap, ulasim tek tabloda",
      helper: nonEducationMissing ? `${nonEducationMissing} satirda ogrenci veya ucret eksigi var.` : "Ek ucret satirlari tamam.",
      icon: "receipt-outline",
      status: nonEducationMissing ? "missing" : "done",
      done: nonEducationMissing === 0,
    },
    {
      key: "dormitory",
      title: GELIRLER_SECTION_LABELS.dormitory,
      subtitle: "Yurt ve yaz okulu gelirleri tek kart",
      helper: dormitoryMissing ? `${dormitoryMissing} konaklama satiri eksik.` : "Konaklama gelirleri tamam.",
      icon: "bed-outline",
      status: dormitoryMissing ? "missing" : "done",
      done: dormitoryMissing === 0,
    },
    {
      key: "otherInstitutionIncome",
      title: GELIRLER_SECTION_LABELS.otherInstitutionIncome,
      subtitle: "Tutar bazli gelirler ve devlet tesviki",
      helper: otherIncomeMissing ? `${otherIncomeMissing} tutar alani bekliyor.` : "Diger kurum gelirleri tamam.",
      icon: "business-outline",
      status: otherIncomeMissing ? "missing" : "done",
      done: otherIncomeMissing === 0,
    },
    {
      key: "brutGelirOzeti",
      title: "Brut Gelir Ozeti",
      subtitle: "Tum gelir bolumlerinin yillik toplamlari",
      helper: "Readonly ozet; kaydet butonu yok.",
      icon: "stats-chart-outline",
      status: "info",
      done: true,
    },
  ];
  const missingSections = sectionCards.filter((section) => !section.done);
  const doneSections = sectionCards.filter((section) => section.done);
  const visibleSections = sectionFilter === "missing" ? missingSections : doneSections;

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
    );
  }

  function renderStickyActions() {
    return (
      <View style={[styles.stickySectionActions, { bottom: stickyActionBottom }]}>
        {message ? <Text style={message.includes("kaydedildi") ? styles.stickySuccessText : styles.stickyWarningText}>{message}</Text> : null}
        {renderActionButtons(styles.stickyActionButtons)}
      </View>
    );
  }

  function renderSectionModeTop(showTabs: boolean) {
    if (!showSectionModeTopControls) return null;
    return (
      <View style={styles.sectionModeTopRow}>
        <Pressable
          onPress={activeMobileSection ? () => setActiveMobileSection(null) : onSectionModeBack}
          hitSlop={12}
          style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
          testID={activeMobileSection ? "gelirler-section-back-button" : "scenario-back-button"}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="gelirler-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="gelirler-filter-done"
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
        {GELIRLER_YEAR_KEYS.map((yearKey) => {
          const active = activeYear === yearKey;
          return (
            <Pressable
              key={yearKey}
              onPress={() => setActiveYear(yearKey)}
              style={[styles.mobileYearTab, active ? styles.mobileYearTabActive : null]}
              testID={`gelirler-mobile-year-${yearKey}`}
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

  function rowTotal(section: GelirlerSectionKey, row: GelirlerRow, yearKey: GelirlerYearKey) {
    if (section === "otherInstitutionIncome") return num(row.amount) * factors[yearKey];
    return studentCountForRow(section, row, yearKey) * num(row.unitFee) * factors[yearKey];
  }

  function renderThreeColumnRow(section: GelirlerSectionKey, row: GelirlerRow) {
    const rowIndex = getRows(draft, section).findIndex((candidate) => candidate.key === row.key);
    const count = studentCountForRow(section, row, activeYear);
    const unitFee = num(row.unitFee);
    const total = rowTotal(section, row, activeYear);
    const studentField = activeYear === "y1" ? "studentCount" : activeYear === "y2" ? "studentCountY2" : "studentCountY3";
    return (
      <View key={`${section}-${row.key}`} style={[styles.incomeTableRow, styles.incomeTableRowThree]}>
        <View style={styles.incomeNameCell}>
          <Text style={styles.incomeRowName} numberOfLines={2}>{rowLabel(row)}</Text>
          {section === "tuition" ? (
            <Text style={styles.incomeRowSub}>{formatInt(count)} ogrenci</Text>
          ) : (
            <FinancialNumberInput
              value={count}
              disabled={!canEdit}
              onChange={(next) => update([section, "rows", rowIndex, studentField], next)}
              testID={`gelirler-${section}-${row.key}-${studentField}`}
            />
          )}
        </View>
        <View style={styles.incomeInputCell}>
          <FinancialNumberInput
            value={unitFee}
            unit={currencyCode}
            disabled={!canEdit}
            onChange={(next) => update([section, "rows", rowIndex, "unitFee"], next)}
            testID={`gelirler-${section}-${row.key}-unitFee`}
          />
        </View>
        <View style={styles.incomeTotalCell}>
          <Text style={[styles.incomeTotalText, !total ? styles.incomeTotalMissing : null]} numberOfLines={2}>
            {total ? formatMoney(total, currencyCode) : "-"}
          </Text>
          <Text style={styles.incomeFormulaText} numberOfLines={1}>
            {count && unitFee ? `${formatInt(count)} x ${formatMoney(unitFee, currencyCode)}` : count ? "Ucret eksik" : "Ogrenci eksik"}
          </Text>
        </View>
      </View>
    );
  }

  function renderTwoColumnRow(row: GelirlerRow) {
    const rowIndex = getRows(draft, "otherInstitutionIncome").findIndex((candidate) => candidate.key === row.key);
    const amount = num(row.amount);
    const total = amount * factors[activeYear];
    return (
      <View key={`other-${row.key}`} style={[styles.incomeTableRow, styles.incomeTableRowTwo]}>
        <View style={styles.incomeNameCell}>
          <Text style={styles.incomeRowName} numberOfLines={2}>{rowLabel(row)}</Text>
          <Text style={styles.incomeRowSub}>Tutar bazli</Text>
        </View>
        <View style={styles.incomeInputCell}>
          <FinancialNumberInput
            value={amount}
            unit={currencyCode}
            disabled={!canEdit}
            onChange={(next) => update(["otherInstitutionIncome", "rows", rowIndex, "amount"], next)}
            testID={`gelirler-otherInstitutionIncome-${row.key}-amount`}
          />
          <Text style={styles.incomeFormulaText} numberOfLines={1}>
            {activeYear === "y1" ? "Y1 tutar" : formatMoney(total, currencyCode)}
          </Text>
        </View>
      </View>
    );
  }

  function renderGovernmentIncentiveRow() {
    const amount = num(draft.governmentIncentives);
    const total = amount * factors[activeYear];
    return (
      <View style={[styles.incomeTableRow, styles.incomeTableRowTwo]}>
        <View style={styles.incomeNameCell}>
          <Text style={styles.incomeRowName} numberOfLines={2}>Devlet Tesvikleri</Text>
          <Text style={styles.incomeRowSub}>Ayni karta dahil</Text>
        </View>
        <View style={styles.incomeInputCell}>
          <FinancialNumberInput
            value={amount}
            unit={currencyCode}
            disabled={!canEdit}
            onChange={(next) => update(["governmentIncentives"], next)}
            testID="gelirler-government-incentives"
          />
          <Text style={styles.incomeFormulaText} numberOfLines={1}>
            {activeYear === "y1" ? "Y1 tutar" : formatMoney(total, currencyCode)}
          </Text>
        </View>
      </View>
    );
  }

  function renderIncomeTableSection(section: GelirlerSectionKey) {
    const rows = visibleRowsForSection(section);
    const totals = totalsForSection(section, rows);
    const isOther = section === "otherInstitutionIncome";
    const grandTotal = (totals[activeYear] || 0) + (isOther ? num(draft.governmentIncentives) * factors[activeYear] : 0);
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>
            {isOther ? "Ogrenci yok, tutar var" : "Tek kart, satirli gelir tablosu"}
          </Text>
          <Text style={styles.mobileInfoText}>
            {isOther
              ? "Bu bolumde ogrenci sayisi olmadigi icin kart iki kolonlu olur: gelir kalemi ve tutar/toplam."
              : "Ogrenci sayisi ve birim ucret ayni satirda gorulur; toplam otomatik hesaplanir."}
          </Text>
        </View>
        <View style={[styles.mobileFormCard, styles.tableCard]}>
          <View style={styles.tableCardHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tableTitle}>{GELIRLER_SECTION_LABELS[section]}</Text>
              <Text style={styles.tableSub}>
                {isOther ? "Tutar bazli gelirler" : "Ogrenci sayisi x birim ucret = toplam gelir"}
              </Text>
            </View>
            <View style={[styles.mobileStatusPill, sectionCards.find((item) => item.key === section)?.status === "missing" ? styles.mobileStatusMissing : styles.mobileStatusDone]}>
              <Text style={[styles.mobileStatusText, sectionCards.find((item) => item.key === section)?.status === "missing" ? styles.mobileStatusTextMissing : styles.mobileStatusTextDone]}>
                {sectionCards.find((item) => item.key === section)?.status === "missing" ? "Eksik" : "Tamam"}
              </Text>
            </View>
          </View>
          {renderYearTabs()}
          <View style={[styles.tableHead, isOther ? styles.tableHeadTwo : styles.tableHeadThree]}>
            <Text style={styles.tableHeadText}>{isOther ? "Gelir kalemi" : "Kalem / ogrenci"}</Text>
            <Text style={[styles.tableHeadText, isOther ? styles.tableHeadTextRight : null]}>{isOther ? "Tutar / toplam" : "Birim ucret"}</Text>
            {!isOther ? <Text style={[styles.tableHeadText, styles.tableHeadTextRight]}>Toplam</Text> : null}
          </View>
          <View style={styles.incomeRows}>
            {isOther ? (
              <>
                {rows.map(renderTwoColumnRow)}
                {renderGovernmentIncentiveRow()}
              </>
            ) : rows.map((row) => renderThreeColumnRow(section, row))}
          </View>
          {!rows.length ? <Text style={styles.warningText}>Bu bolumde gorunur gelir satiri yok.</Text> : null}
          <View style={styles.tableFormula}>
            <Text style={styles.tableFormulaText}>
              {isOther ? "Hesap: aktif yil faktoru ile tutar carpilarak toplam uretilir." : "Hesap: her satirda ogrenci sayisi x birim ucret."}
            </Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>{activeYear.toUpperCase()} toplam</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(grandTotal, currencyCode)}</Text>
          </View>
        </View>
      </>
    );
  }

  function renderBrutGelirOzetiSection() {
    const sectionTotals = GELIRLER_SECTION_KEYS.map((section) => {
      const rows = visibleRowsForSection(section);
      const total = totalsForSection(section, rows)[activeYear] || 0;
      return { section, total };
    });
    const otherWithGovernment = sectionTotals.map((item) =>
      item.section === "otherInstitutionIncome"
        ? { ...item, total: item.total + num(draft.governmentIncentives) * factors[activeYear] }
        : item,
    );
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Readonly gelir toplamlari</Text>
          <Text style={styles.mobileInfoText}>
            Bu sayfa sadece hesaplanan toplamlari gosterir. Kaydet/Vazgec bari gosterilmez.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          {renderYearTabs()}
          <View style={styles.mobileSummaryBlock}>
            <Text style={styles.mobileGroupTitle}>{activeYear.toUpperCase()} gelir toplamlari</Text>
            {otherWithGovernment.map((item) => (
              <CompactValueRow
                key={item.section}
                label={GELIRLER_SECTION_LABELS[item.section]}
                value={formatMoney(item.total, currencyCode)}
              />
            ))}
          </View>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Brut gelir</Text>
          {GELIRLER_YEAR_KEYS.map((yearKey) => (
            <CompactValueRow
              key={yearKey}
              label={`${yearKey.toUpperCase()} toplam`}
              value={formatMoney(grossTotals[yearKey] || 0, currencyCode)}
            />
          ))}
        </View>
      </>
    );
  }

  function renderSectionForm(section: GelirlerMobileSectionKey) {
    return section === "brutGelirOzeti" ? renderBrutGelirOzetiSection() : renderIncomeTableSection(section);
  }

  const editableHint = canEdit
    ? "Gelir satirlari yalniz leaf-field patch olarak kaydedilir; satir veya rows dizisi degistirilmez."
    : disabledReason;

  if (sectionMode) {
    if (activeMobileSection) {
      const showEditableActions = activeMobileSection !== "brutGelirOzeti";
      if (stickySectionActions && showEditableActions) {
        return (
          <View testID="gelirler-editor" style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}>
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
        <View testID="gelirler-editor" style={styles.sectionModeRoot}>
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
      <View testID="gelirler-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}
        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <GelirlerSectionCard
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
                {sectionFilter === "missing" ? "Eksik bolum kalmadi" : "Tamamlanan bolum yok"}
              </Text>
              <Text style={styles.emptySectionText}>
                {sectionFilter === "missing"
                  ? "Gelirler bolumlerinin tamami kontrol edildi."
                  : "Bir bolum tamamlandiginda burada gorunur."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

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

type GelirlerSectionCardModel = {
  key: GelirlerMobileSectionKey;
  title: string;
  subtitle: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: "missing" | "done" | "info";
  done: boolean;
};

function GelirlerSectionCard({
  section,
  onPress,
}: {
  section: GelirlerSectionCardModel;
  onPress: () => void;
}) {
  const statusLabel = section.status === "missing" ? "Eksik" : section.status === "done" ? "Tamam" : "Bilgi";
  const statusStyle =
    section.status === "missing"
      ? styles.mobileStatusMissing
      : section.status === "done"
        ? styles.mobileStatusDone
        : styles.mobileStatusInfo;
  const statusTextStyle =
    section.status === "missing"
      ? styles.mobileStatusTextMissing
      : section.status === "done"
        ? styles.mobileStatusTextDone
        : styles.mobileStatusTextInfo;
  const iconStyle =
    section.status === "missing"
      ? styles.sectionIconMissing
      : section.status === "done"
        ? styles.sectionIconDone
        : styles.sectionIconInfo;
  const iconColor = section.status === "missing" ? colors.warn : section.status === "done" ? colors.success : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sectionCard, pressed ? styles.pressed : null]}
      testID={`gelirler-mobile-section-${section.key}`}
    >
      <View style={styles.mobileSectionCardTop}>
        <View style={[styles.sectionIcon, iconStyle]}>
          <Ionicons name={section.icon} size={23} color={iconColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionCardTitle} numberOfLines={2}>{section.title}</Text>
          <Text style={styles.sectionCardSubtitle} numberOfLines={2}>{section.subtitle}</Text>
        </View>
        <View style={[styles.mobileStatusPill, statusStyle]}>
          <Text style={[styles.mobileStatusText, statusTextStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.mobileCardDivider} />
      <View style={styles.mobileSectionBottom}>
        <Text style={styles.mobileSectionHint} numberOfLines={2}>{section.helper}</Text>
        <View style={[styles.mobileSmallButton, section.status !== "missing" ? styles.mobileSmallButtonSecondary : null]}>
          <Text style={[styles.mobileSmallButtonText, section.status !== "missing" ? styles.mobileSmallButtonTextSecondary : null]}>
            {section.status === "missing" ? "Doldur" : "Ac"}
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
  stickyWarningText: {
    color: colors.warn,
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
  mobileSectionCardTop: {
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
  sectionIconMissing: {
    backgroundColor: "#FFF7D8",
  },
  sectionIconDone: {
    backgroundColor: "#EAF8EF",
  },
  sectionIconInfo: {
    backgroundColor: colors.chipBg,
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
  mobileStatusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  mobileStatusMissing: {
    backgroundColor: "#FFF7D8",
    borderColor: "#FDE68A",
  },
  mobileStatusDone: {
    backgroundColor: "#EAF8EF",
    borderColor: "#BBF7D0",
  },
  mobileStatusInfo: {
    backgroundColor: colors.chipBg,
    borderColor: "#BFDBFE",
  },
  mobileStatusText: {
    ...font.tiny,
    fontWeight: "900",
  },
  mobileStatusTextMissing: {
    color: colors.warn,
  },
  mobileStatusTextDone: {
    color: colors.success,
  },
  mobileStatusTextInfo: {
    color: colors.primary,
  },
  mobileCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  mobileSectionBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
  },
  mobileSectionHint: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
  },
  mobileSmallButton: {
    minWidth: 88,
    minHeight: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  mobileSmallButtonSecondary: {
    backgroundColor: colors.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  mobileSmallButtonText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: "900",
  },
  mobileSmallButtonTextSecondary: {
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
  mobileYearTabs: {
    flexDirection: "row",
    gap: 7,
  },
  mobileYearTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4E8FF",
    backgroundColor: "#EEF5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileYearTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mobileYearTabText: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
  },
  mobileYearTabTextActive: {
    color: colors.primaryText,
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
  mobileGroupTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  mobileSummaryBlock: {
    marginTop: spacing.sm,
  },
  tableCard: {
    padding: 0,
    overflow: "hidden",
  },
  tableCardHead: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  tableTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
  },
  tableSub: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
    marginTop: 4,
  },
  tableHead: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
  },
  tableHeadThree: {
    flexDirection: "row",
  },
  tableHeadTwo: {
    flexDirection: "row",
  },
  tableHeadText: {
    flex: 1,
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  tableHeadTextRight: {
    textAlign: "right",
  },
  incomeRows: {
    padding: 10,
    gap: 8,
  },
  incomeTableRow: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
  },
  incomeTableRowThree: {
    flexDirection: "row",
  },
  incomeTableRowTwo: {
    flexDirection: "row",
  },
  incomeNameCell: {
    flex: 1.25,
    minWidth: 0,
  },
  incomeInputCell: {
    flex: 0.95,
    minWidth: 0,
  },
  incomeTotalCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  incomeRowName: {
    color: colors.text,
    ...font.small,
    fontWeight: "900",
  },
  incomeRowSub: {
    color: colors.textDim,
    ...font.tiny,
    marginTop: 4,
  },
  incomeTotalText: {
    color: colors.text,
    ...font.small,
    fontWeight: "900",
    textAlign: "right",
  },
  incomeTotalMissing: {
    color: colors.warn,
  },
  incomeFormulaText: {
    color: colors.textMuted,
    ...font.tiny,
    marginTop: 4,
    textAlign: "right",
  },
  tableFormula: {
    marginHorizontal: 10,
    marginBottom: spacing.sm,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: "#CFE4FF",
    backgroundColor: colors.bgElev,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableFormulaText: {
    color: colors.textDim,
    ...font.tiny,
    lineHeight: 16,
  },
  grandTotal: {
    marginHorizontal: 10,
    marginBottom: spacing.md,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CFE4FF",
    backgroundColor: "#EAF4FF",
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  grandTotalLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    ...font.small,
    fontWeight: "900",
  },
  grandTotalValue: {
    color: colors.primary,
    ...font.h3,
    fontWeight: "900",
    textAlign: "right",
  },
  compactValueRow: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: 9,
  },
  compactValueLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  compactValueText: {
    color: colors.text,
    ...font.mono,
    textAlign: "right",
  },
});
