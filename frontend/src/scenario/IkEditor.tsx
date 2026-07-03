import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
}: Props) {
  const [activeYear, setActiveYear] = React.useState<IkYearKey>("y1");
  const [draft, setDraft] = React.useState<IkObject>(() =>
    applyUnitCostGrowth(value, getAtPath(buildIk(value), ["unitCostRatio"]), inputs?.temelBilgiler),
  );
  const [dirtyPaths, setDirtyPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    const next = applyUnitCostGrowth(value, getAtPath(buildIk(value), ["unitCostRatio"]), inputs?.temelBilgiler);
    setDraft(next);
    setDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [inputs?.temelBilgiler, onDirtyPathsChange, value]);

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

  function markDirty(paths: readonly PathToken[][]) {
    setDirtyPaths((prev) => {
      const next = Array.from(new Set([...prev, ...paths.map(dirtyPath)]));
      onDirtyPathsChange(next);
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

  const activeComputed = computedByYear[activeYear];
  const editableHint = canEdit
    ? "IK alanlari leaf-level patch olarak kaydedilir; Y2/Y3 birim maliyetleri otomatik turetilir."
    : disabledReason;

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
});
