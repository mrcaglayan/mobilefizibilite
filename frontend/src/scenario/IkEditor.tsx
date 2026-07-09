import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  IK_ALL_ROLES,
  IK_LEVEL_DEFS,
  IK_ROLE_GROUPS,
  IK_YEAR_KEYS,
  IkDraft,
  IkYearKey,
} from "@/src/scenario/ikAdapter";
import { getAtPath, PathToken, setAtPath } from "@/src/scenario/patch";
import { colors, font, formatInt, formatMoney, radius, spacing } from "@/src/theme";
import { Button, Card, Chip } from "@/src/ui/components";
import { FinancialNumberInput, FormRow, FormSection, ReadonlyValueRow } from "@/src/ui/financialForm";

type IkObject = Record<string, unknown>;
type YearIk = {
  unitCosts: Record<string, number>;
  headcountsByLevel: Record<string, Record<string, number>>;
};

export type IkSectionFilter = "missing" | "done";
export type IkSectionKey = "parametreler" | "birimMaliyet" | "personelSayilari" | "giderEslestirme";

type Props = {
  value: unknown;
  inputs: Inputs | null;
  scenario: Scenario | null;
  currencyCode: string;
  canEdit: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: IkDraft) => Promise<void>;
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: IkSectionFilter;
  onSectionFilterChange?: (filter: IkSectionFilter) => void;
  activeSectionKey?: IkSectionKey | null;
  onActiveSectionKeyChange?: (section: IkSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
};

const DEFAULT_UNIT_COST_RATIO = 1;

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "Ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
] as const;

const ROLE_GROUP_BY_KEY = IK_ROLE_GROUPS.reduce<Record<string, string>>((acc, group) => {
  group.roles.forEach((role) => {
    acc[role.key] = group.groupKey;
  });
  return acc;
}, {});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: unknown): T {
  const base = { ...(target || {}) } as Record<string, unknown>;
  const src = source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : {};
  Object.entries(src).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      base[key] = deepMerge((base[key] || {}) as Record<string, unknown>, value);
    } else {
      base[key] = value;
    }
  });
  return base as T;
}

function defaultYearIk(): YearIk {
  const unitCosts = IK_ALL_ROLES.reduce<Record<string, number>>((acc, role) => {
    acc[role.key] = 0;
    return acc;
  }, {});
  const headcountsByLevel = IK_LEVEL_DEFS.reduce<Record<string, Record<string, number>>>((acc, level) => {
    acc[level.key] = IK_ALL_ROLES.reduce<Record<string, number>>((roleAcc, role) => {
      roleAcc[role.key] = 0;
      return roleAcc;
    }, {});
    return acc;
  }, {});
  return { unitCosts, headcountsByLevel };
}

function defaultIk(): IkObject {
  return {
    unitCostRatio: DEFAULT_UNIT_COST_RATIO,
    years: {
      y1: defaultYearIk(),
      y2: defaultYearIk(),
      y3: defaultYearIk(),
    },
  };
}

function buildIk(value: unknown): IkObject {
  const base = defaultIk();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (source.years && typeof source.years === "object") return deepMerge(base, source);
  if (source.unitCosts || source.headcountsByLevel) return deepMerge(base, { ...source, years: { y1: source } });
  return deepMerge(base, source);
}

function normalizeUnitCostRatio(value: unknown) {
  const parsed = num(value);
  return parsed > 0 ? parsed : DEFAULT_UNIT_COST_RATIO;
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

function applyUnitCostGrowth(input: unknown, ratioValue: unknown, temelBilgiler: unknown) {
  let next = buildIk(input);
  const ratio = normalizeUnitCostRatio(ratioValue);
  const factors = getInflationFactors(temelBilgiler);
  next = setAtPath(next, ["unitCostRatio"], ratio);

  IK_ALL_ROLES.forEach((role) => {
    const base = num(getAtPath(next, ["years", "y1", "unitCosts", role.key]));
    const useInflation = ROLE_GROUP_BY_KEY[role.key] === "yerel";
    const y2 = useInflation ? base * factors.y2 : base * ratio;
    const y3 = useInflation ? base * factors.y3 : y2 * ratio;
    next = setAtPath(next, ["years", "y2", "unitCosts", role.key], y2);
    next = setAtPath(next, ["years", "y3", "unitCosts", role.key], y3);
  });

  return next;
}

function normalizeGrade(value: unknown) {
  const raw = str(value).trim().toUpperCase();
  return raw === "K" ? "KG" : raw;
}

const GRADE_ORDER = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function normalizeKademeConfig(config: unknown) {
  const source = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, Record<string, unknown>>)
    : {};
  return KADEME_DEFS.reduce<Record<string, { enabled: boolean; from: string; to: string }>>((acc, def) => {
    const row = source[def.key] && typeof source[def.key] === "object" ? source[def.key] : {};
    const from = normalizeGrade(row.from || def.defaultFrom);
    const to = normalizeGrade(row.to || def.defaultTo);
    acc[def.key] = {
      enabled: row.enabled !== false,
      from: GRADE_ORDER.includes(from) ? from : def.defaultFrom,
      to: GRADE_ORDER.includes(to) ? to : def.defaultTo,
    };
    return acc;
  }, {});
}

function kademeLabel(label: string, config: Record<string, { enabled: boolean; from: string; to: string }>, key: string | null) {
  if (!key) return label;
  const row = config[key];
  if (!row?.enabled) return label;
  const range = row.from === row.to ? row.from : `${row.from}-${row.to}`;
  return `${label} (${range})`;
}

function programType(inputs: Inputs | null, scenario: Scenario | null) {
  const raw = str(inputs?.temelBilgiler?.programType || scenario?.program_type || "local").toLowerCase();
  return raw === "international" ? "international" : "local";
}

function isLevelVisible(levelKey: string, type: string) {
  if (levelKey.endsWith("Yerel")) return type === "local";
  if (levelKey.endsWith("Int")) return type === "international";
  return true;
}

function visibleLevels(inputs: Inputs | null, scenario: Scenario | null) {
  const kademeler = normalizeKademeConfig(inputs?.temelBilgiler?.kademeler);
  const noKademeMode = KADEME_DEFS.every((def) => kademeler[def.key]?.enabled === false);
  const type = programType(inputs, scenario);
  const levels = IK_LEVEL_DEFS.map((level) => ({
    ...level,
    label: `${kademeLabel(level.baseLabel, kademeler, level.kademeKey)}${level.suffix || ""}`,
  }));
  if (noKademeMode) return levels.filter((level) => level.key === "merkez");
  return levels.filter((level) => {
    if (level.key === "merkez") return false;
    if (level.kademeKey && kademeler[level.kademeKey]?.enabled === false) return false;
    return isLevelVisible(level.key, type);
  });
}

function dirtyPath(path: readonly PathToken[]) {
  return `ik.${path.map(String).join(".")}`;
}

function getIk(draft: IkObject, path: readonly PathToken[], fallback = 0) {
  const value = getAtPath(draft, path);
  return value == null ? fallback : value;
}

function computeYear(draft: IkObject, year: IkYearKey) {
  const roleTotals: Record<string, number> = {};
  const roleAnnualCosts: Record<string, number> = {};

  IK_ALL_ROLES.forEach((role) => {
    const totalCount = IK_LEVEL_DEFS.reduce(
      (sum, level) => sum + num(getIk(draft, ["years", year, "headcountsByLevel", level.key, role.key])),
      0,
    );
    const unitCost = num(getIk(draft, ["years", year, "unitCosts", role.key]));
    roleTotals[role.key] = totalCount;
    roleAnnualCosts[role.key] = unitCost * totalCount;
  });

  const sumAnnual = (keys: string[]) => keys.reduce((sum, key) => sum + num(roleAnnualCosts[key]), 0);
  const salaryExpenseMapping = {
    turkPersonelMaas: sumAnnual(["turk_mudur", "turk_mdyard", "turk_egitimci"]),
    turkDestekPersonelMaas: sumAnnual(["turk_temsil"]),
    yerelPersonelMaas: sumAnnual(["yerel_yonetici_egitimci"]),
    yerelDestekPersonelMaas: sumAnnual(["yerel_destek", "yerel_ulke_temsil_destek"]),
    internationalPersonelMaas: sumAnnual(["int_yonetici_egitimci"]),
  };

  return {
    roleTotals,
    roleAnnualCosts,
    salaryExpenseMapping,
    totals: {
      totalAnnual: Object.values(roleAnnualCosts).reduce((sum, value) => sum + value, 0),
      totalHeadcount: Object.values(roleTotals).reduce((sum, value) => sum + value, 0),
    },
  };
}

function yearLabel(year: IkYearKey) {
  return year.toUpperCase();
}

function salaryMappingLabel(key: string) {
  switch (key) {
    case "turkPersonelMaas":
      return "Turk Personel Maas";
    case "turkDestekPersonelMaas":
      return "Turk Destek Personel Maas";
    case "yerelPersonelMaas":
      return "Yerel Personel Maas";
    case "yerelDestekPersonelMaas":
      return "Yerel Destek Personel Maas";
    case "internationalPersonelMaas":
      return "International Personel Maas";
    default:
      return key;
  }
}

function groupSubLabel(groupKey: string) {
  if (groupKey === "turk") return "Turk personel";
  if (groupKey === "yerel") return "Yerel kaynak";
  return "International";
}

export function IkEditor({
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
  const [activeYear, setActiveYear] = React.useState<IkYearKey>("y1");
  const [draft, setDraft] = React.useState<IkObject>(() =>
    applyUnitCostGrowth(value, getAtPath(buildIk(value), ["unitCostRatio"]), inputs?.temelBilgiler),
  );
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<IkSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<IkSectionKey | null>(null);
  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const setSectionFilter = React.useCallback((next: IkSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);
  const activeSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const setActiveSection = React.useCallback((next: IkSectionKey | null) => {
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 78;
  const stickyEditorHeight = Math.max(440, windowHeight - 150);

  React.useEffect(() => {
    const next = applyUnitCostGrowth(value, getAtPath(buildIk(value), ["unitCostRatio"]), inputs?.temelBilgiler);
    setDraft(next);
    setDirtyPaths([]);
    setActiveSection(null);
    onDirtyPathsChange([]);
  }, [inputs?.temelBilgiler, onDirtyPathsChange, setActiveSection, value]);

  React.useEffect(() => {
    onDirtyPathsChange(dirtyPaths);
  }, [dirtyPaths, onDirtyPathsChange]);

  const levels = React.useMemo(() => visibleLevels(inputs, scenario), [inputs, scenario]);
  const computedByYear = React.useMemo(
    () => ({
      y1: computeYear(draft, "y1"),
      y2: computeYear(draft, "y2"),
      y3: computeYear(draft, "y3"),
    }),
    [draft],
  );
  const isDirty = dirtyPaths.length > 0;
  const activeComputed = computedByYear[activeYear];
  const parametrelerDone = normalizeUnitCostRatio(getIk(draft, ["unitCostRatio"], DEFAULT_UNIT_COST_RATIO)) > 0;
  const missingUnitCostCount = IK_ALL_ROLES.filter((role) => num(getIk(draft, ["years", "y1", "unitCosts", role.key])) <= 0).length;
  const birimMaliyetDone = missingUnitCostCount === 0;
  const missingHeadcountYears = IK_YEAR_KEYS.filter((year) => computedByYear[year].totals.totalHeadcount <= 0);
  const personelSayilariDone = levels.length > 0 && missingHeadcountYears.length === 0;
  const sectionCards: IkSectionCardModel[] = [
    {
      key: "parametreler",
      title: "Parametreler",
      subtitle: "Maliyet carpani ve yil toplamları",
      helper: "Yillik carpan ve aktif yil toplamlarini kontrol et.",
      icon: "options-outline",
      status: parametrelerDone ? "done" : "missing",
      done: parametrelerDone,
    },
    {
      key: "birimMaliyet",
      title: "Birim Isveren Maliyeti",
      subtitle: "Y1 maliyetleri; Y2/Y3 otomatik turetilir",
      helper: birimMaliyetDone ? "Tum Y1 rol maliyetleri dolu." : `${missingUnitCostCount} rol icin yillik maliyet bekliyor.`,
      icon: "cash-outline",
      status: birimMaliyetDone ? "done" : "missing",
      done: birimMaliyetDone,
    },
    {
      key: "personelSayilari",
      title: "Personel Sayilari",
      subtitle: "Yil, kademe ve role gore kisi sayilari",
      helper: personelSayilariDone ? "Yillik personel sayilari girildi." : `${missingHeadcountYears.map(yearLabel).join(", ") || "Yil"} personel sayisi bekliyor.`,
      icon: "people-outline",
      status: personelSayilariDone ? "done" : "missing",
      done: personelSayilariDone,
    },
    {
      key: "giderEslestirme",
      title: "Gider Eslestirme",
      subtitle: "IK degerlerinden tureyen maas giderleri",
      helper: "Giderler modulune aktarilacak kalemleri goruntule.",
      icon: "git-compare-outline",
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

  function updateRatio(valueNext: number | null) {
    if (!canEdit) return;
    const ratio = normalizeUnitCostRatio(valueNext);
    const next = applyUnitCostGrowth(draft, ratio, inputs?.temelBilgiler);
    setDraft(next);
    markDirty([["unitCostRatio"]]);
    setMessage("");
  }

  function updateUnitCost(roleKey: string, valueNext: number | null) {
    if (!canEdit || activeYear !== "y1") return;
    const nextValue = Math.max(0, num(valueNext));
    let next = setAtPath(draft, ["years", "y1", "unitCosts", roleKey], nextValue);
    next = applyUnitCostGrowth(next, getAtPath(next, ["unitCostRatio"]), inputs?.temelBilgiler);
    setDraft(next);
    markDirty([["years", "y1", "unitCosts", roleKey]]);
    setMessage("");
  }

  function updateHeadcount(levelKey: string, roleKey: string, valueNext: number | null) {
    if (!canEdit) return;
    const nextValue = Math.max(0, Math.trunc(num(valueNext)));
    const path: PathToken[] = ["years", activeYear, "headcountsByLevel", levelKey, roleKey];
    setDraft((prev) => setAtPath(prev, path, nextValue));
    markDirty([path]);
    setMessage("");
  }

  async function handleSave() {
    if (!isDirty || !canEdit || saving) return;
    setMessage("");
    try {
      await onSave({ ik: draft, dirtyPaths });
      setDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("IK kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "IK kaydedilemedi.");
    }
  }

  function handleCancel() {
    const next = applyUnitCostGrowth(value, getAtPath(buildIk(value), ["unitCostRatio"]), inputs?.temelBilgiler);
    setDraft(next);
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
          testID="ik-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="ik-save-button"
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
          onPress={activeSection ? () => setActiveSection(null) : onSectionModeBack}
          hitSlop={12}
          style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
          testID={activeSection ? "ik-section-back-button" : "scenario-back-button"}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="ik-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="ik-filter-done"
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
        {IK_YEAR_KEYS.map((year) => {
          const active = activeYear === year;
          return (
            <Pressable
              key={year}
              onPress={() => setActiveYear(year)}
              style={[styles.mobileYearTab, active ? styles.mobileYearTabActive : null]}
              testID={`ik-mobile-year-${year}`}
            >
              <Text style={[styles.mobileYearTabText, active ? styles.mobileYearTabTextActive : null]}>{yearLabel(year)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderParametrelerSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Yillik maliyet carpani</Text>
          <Text style={styles.mobileInfoText}>
            Y1 girilir. Y2/Y3 birim maliyetleri Turk/International icin carpana, yerel kaynak icin enflasyon varsayimina gore turetilir.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Duzenlenebilir parametre</Text>
          <FormRow label="Yillik birim maliyet carpani">
            <FinancialNumberInput
              value={normalizeUnitCostRatio(getIk(draft, ["unitCostRatio"], DEFAULT_UNIT_COST_RATIO))}
              disabled={!canEdit}
              unit="x"
              onChange={updateRatio}
              testID="ik-unit-cost-ratio"
            />
          </FormRow>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Aktif yil ozeti</Text>
          {renderYearTabs()}
          <View style={styles.mobileYearSummary}>
            <CompactValueRow label={`${yearLabel(activeYear)} toplam yillik maliyet`} value={formatMoney(activeComputed.totals.totalAnnual, currencyCode)} />
            <CompactValueRow label={`${yearLabel(activeYear)} toplam personel`} value={formatInt(activeComputed.totals.totalHeadcount)} />
          </View>
        </View>
      </>
    );
  }

  function renderBirimMaliyetSection() {
    return (
      <>
        {renderYearTabs()}
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Rol bazli yillik maliyet</Text>
          <Text style={styles.mobileInfoText}>Y1 alanlari duzenlenebilir. Y2/Y3 kilitli bilgi olarak gosterilir.</Text>
        </View>
        {IK_ROLE_GROUPS.map((group) => (
          <View key={group.groupKey} style={styles.mobileFormCard}>
            <Text style={styles.mobileGroupTitle}>{group.groupLabel}</Text>
            {group.roles.map((role) => (
              <View key={role.key} style={styles.mobileRoleCard}>
                <View style={styles.mobileRoleHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.mobileRoleTitle}>{role.label}</Text>
                    <Text style={styles.mobileRoleSub}>{groupSubLabel(group.groupKey)}</Text>
                  </View>
                  <Text style={styles.mobileRolePill}>{yearLabel(activeYear)}</Text>
                </View>
                <FinancialNumberInput
                  value={num(getIk(draft, ["years", activeYear, "unitCosts", role.key]))}
                  disabled={!canEdit || activeYear !== "y1"}
                  unit={currencyCode}
                  onChange={(next) => updateUnitCost(role.key, next)}
                  testID={`ik-unit-cost-${activeYear}-${role.key}`}
                />
              </View>
            ))}
          </View>
        ))}
      </>
    );
  }

  function renderPersonelSayilariSection() {
    return (
      <>
        {renderYearTabs()}
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Kademe kartlari</Text>
          <Text style={styles.mobileInfoText}>
            Her kademe kendi kartinda; roller grup basliklari altinda duzenlenir. Uzun tablo mobilde bolunur.
          </Text>
        </View>
        {levels.length ? null : (
          <Card style={styles.emptySectionCard}>
            <Ionicons name="people-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptySectionTitle}>Gorunur kademe yok</Text>
            <Text style={styles.emptySectionText}>Temel Bilgiler kademelerini kontrol edin.</Text>
          </Card>
        )}
        {levels.map((level) => (
          <View key={level.key} style={styles.mobileFormCard}>
            <View style={styles.mobileLevelHead}>
              <Text style={styles.mobileGroupTitle}>{level.label}</Text>
              <Text style={styles.mobileRolePill}>{yearLabel(activeYear)}</Text>
            </View>
            {IK_ROLE_GROUPS.map((group) => (
              <View key={`${level.key}-${group.groupKey}`} style={styles.mobileRoleGroup}>
                <Text style={styles.mobileRoleGroupTitle}>{group.groupLabel}</Text>
                <Text style={styles.mobileRoleSub}>{groupSubLabel(group.groupKey)}</Text>
                {group.roles.map((role) => (
                  <View key={`${level.key}-${role.key}`} style={styles.mobilePersonRow}>
                    <Text style={styles.mobilePersonLabel}>{role.label}</Text>
                    <View style={styles.mobilePersonInput}>
                      <FinancialNumberInput
                        value={num(getIk(draft, ["years", activeYear, "headcountsByLevel", level.key, role.key]))}
                        disabled={!canEdit}
                        onChange={(next) => updateHeadcount(level.key, role.key, next)}
                        testID={`ik-headcount-${activeYear}-${level.key}-${role.key}`}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </>
    );
  }

  function renderGiderEslestirmeSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Giderler modulune aktarim</Text>
          <Text style={styles.mobileInfoText}>
            Bu degerler personel sayilari ve birim maliyetlerden otomatik turetilir. Burada duzenlenmez.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          {renderYearTabs()}
          <View style={styles.mobileYearSummary}>
            <Text style={styles.mobileGroupTitle}>Maas gider kalemleri</Text>
            {Object.entries(activeComputed.salaryExpenseMapping).map(([key, value]) => (
              <CompactValueRow key={key} label={salaryMappingLabel(key)} value={formatMoney(value, currencyCode)} />
            ))}
          </View>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Aktif yil ozeti</Text>
          <CompactValueRow label="Toplam yillik maliyet" value={formatMoney(activeComputed.totals.totalAnnual, currencyCode)} />
          <CompactValueRow label="Toplam personel" value={formatInt(activeComputed.totals.totalHeadcount)} />
        </View>
      </>
    );
  }

  function renderSectionForm(section: IkSectionKey) {
    switch (section) {
      case "parametreler":
        return renderParametrelerSection();
      case "birimMaliyet":
        return renderBirimMaliyetSection();
      case "personelSayilari":
        return renderPersonelSayilariSection();
      case "giderEslestirme":
      default:
        return renderGiderEslestirmeSection();
    }
  }

  const editableHint = canEdit
    ? "IK alanlari leaf-level patch olarak kaydedilir; Y2/Y3 birim maliyetleri otomatik turetilir."
    : disabledReason;

  if (sectionMode) {
    if (activeSection) {
      const showEditableActions = activeSection !== "giderEslestirme";
      if (stickySectionActions && showEditableActions) {
        return (
          <View testID="ik-editor" style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}>
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
        <View testID="ik-editor" style={styles.sectionModeRoot}>
          {renderSectionModeTop(false)}
          {renderSectionForm(activeSection)}
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
      <View testID="ik-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}
        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <IkSectionCard
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
                {sectionFilter === "missing" ? "Eksik bolum kalmadi" : "Tamamlanan bolum yok"}
              </Text>
              <Text style={styles.emptySectionText}>
                {sectionFilter === "missing"
                  ? "IK bolumlerinin tamami kontrol edildi."
                  : "Bir bolum tamamlandiginda burada gorunur."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card testID="ik-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>IK Editoru</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEdit ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEdit ? "create-outline" : "lock-closed-outline"} size={14} color={canEdit ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEdit ? colors.primaryText : colors.warn }]}>
            {canEdit ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

      <View style={styles.yearTabs}>
        {IK_YEAR_KEYS.map((year) => (
          <Chip
            key={year}
            label={year.toUpperCase()}
            active={activeYear === year}
            onPress={() => setActiveYear(year)}
            testID={`ik-year-${year}`}
          />
        ))}
      </View>

      <FormSection title="Parametreler" subtitle={`Para birimi: ${currencyCode}`}>
        <FormRow label="Yillik birim maliyet carpani">
          <FinancialNumberInput
            value={normalizeUnitCostRatio(getIk(draft, ["unitCostRatio"], DEFAULT_UNIT_COST_RATIO))}
            disabled={!canEdit}
            onChange={updateRatio}
            testID="ik-unit-cost-ratio"
          />
        </FormRow>
        <ReadonlyValueRow label={`${activeYear.toUpperCase()} toplam yillik maliyet`} value={formatMoney(activeComputed.totals.totalAnnual, currencyCode)} />
        <ReadonlyValueRow label={`${activeYear.toUpperCase()} toplam personel`} value={formatInt(activeComputed.totals.totalHeadcount)} />
      </FormSection>

      <FormSection title="Birim Isveren Maliyeti" subtitle="Y1 girilir; Y2/Y3 web akisi gibi carpana/enflasyona gore turetilir.">
        {IK_ROLE_GROUPS.map((group) => (
          <View key={group.groupKey} style={styles.groupBlock}>
            <Text style={styles.groupTitle}>{group.groupLabel}</Text>
            {group.roles.map((role) => (
              <FormRow key={role.key} label={role.label}>
                <FinancialNumberInput
                  value={num(getIk(draft, ["years", activeYear, "unitCosts", role.key]))}
                  disabled={!canEdit || activeYear !== "y1"}
                  unit={currencyCode}
                  onChange={(next) => updateUnitCost(role.key, next)}
                  testID={`ik-unit-cost-${activeYear}-${role.key}`}
                />
              </FormRow>
            ))}
          </View>
        ))}
      </FormSection>

      <FormSection title="Personel Sayilari" subtitle={`${activeYear.toUpperCase()} icin kademe ve role gore personel sayisi.`}>
        {levels.length ? null : <Text style={styles.warningText}>Gorunur kademe bulunamadi.</Text>}
        {levels.map((level) => (
          <View key={level.key} style={styles.levelBlock}>
            <Text style={styles.levelTitle}>{level.label}</Text>
            {IK_ROLE_GROUPS.map((group) => (
              <View key={`${level.key}-${group.groupKey}`} style={styles.groupBlock}>
                <Text style={styles.groupTitle}>{group.groupLabel}</Text>
                {group.roles.map((role) => (
                  <FormRow key={`${level.key}-${role.key}`} label={role.label}>
                    <FinancialNumberInput
                      value={num(getIk(draft, ["years", activeYear, "headcountsByLevel", level.key, role.key]))}
                      disabled={!canEdit}
                      onChange={(next) => updateHeadcount(level.key, role.key, next)}
                      testID={`ik-headcount-${activeYear}-${level.key}-${role.key}`}
                    />
                  </FormRow>
                ))}
              </View>
            ))}
          </View>
        ))}
      </FormSection>

      <FormSection title="Gider Eslestirme" subtitle="Giderler modulu bu IK degerlerinden tureyen maas kalemlerini kullanir.">
        {Object.entries(activeComputed.salaryExpenseMapping).map(([key, value]) => (
          <ReadonlyValueRow key={key} label={key} value={formatMoney(value, currencyCode)} />
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
          testID="ik-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!canEdit || !isDirty || saving}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="ik-save-button"
        />
      </View>
    </Card>
  );
}

type IkSectionCardModel = {
  key: IkSectionKey;
  title: string;
  subtitle: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: "missing" | "done" | "info";
  done: boolean;
};

function IkSectionCard({
  section,
  onPress,
}: {
  section: IkSectionCardModel;
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
      testID={`ik-section-${section.key}`}
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
  yearTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  groupBlock: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  groupTitle: {
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  levelBlock: {
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.md,
  },
  levelTitle: {
    color: colors.text,
    ...font.h3,
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
  mobileYearSummary: {
    marginTop: spacing.sm,
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
  mobileRoleCard: {
    borderRadius: 20,
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mobileRoleHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  mobileRoleTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  mobileRoleSub: {
    color: colors.textDim,
    ...font.tiny,
    marginTop: 3,
  },
  mobileRolePill: {
    color: colors.primary,
    ...font.tiny,
    fontWeight: "900",
    borderRadius: radius.pill,
    backgroundColor: colors.chipBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4E8FF",
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: "hidden",
  },
  mobileLevelHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  mobileRoleGroup: {
    borderRadius: 20,
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mobileRoleGroupTitle: {
    color: colors.text,
    ...font.small,
    fontWeight: "900",
  },
  mobilePersonRow: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mobilePersonLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  mobilePersonInput: {
    width: 104,
  },
});
