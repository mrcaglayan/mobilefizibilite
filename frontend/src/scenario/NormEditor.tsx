import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Inputs, Scenario } from "@/src/api/client";
import {
  NormDraft,
  NORM_GRADE_KEYS,
  NORM_YEAR_KEYS,
  NormGradeRow,
  NormYearKey,
  normalizeNormCurrentGrades,
  normalizeNormPlanningGrades,
} from "@/src/scenario/normGradesAdapter";
import { getAtPath, setAtPath } from "@/src/scenario/patch";
import { colors, font, formatInt, radius, spacing } from "@/src/theme";
import { Button, Card, Chip } from "@/src/ui/components";
import { FinancialNumberInput, FormRow, FormSection, ReadonlyValueRow } from "@/src/ui/financialForm";

type NormYearConfig = {
  teacherWeeklyMaxHours: number;
  curriculumWeeklyHours: Record<string, Record<string, number>>;
};

type NormConfig = {
  years: Record<NormYearKey, NormYearConfig>;
  [key: string]: unknown;
};

export type NormSectionFilter = "missing" | "done";
export type NormSectionKey = "normOzeti" | "planlananDonem" | "mevcutDonem" | "dersDagilimi";

type Props = {
  value: unknown;
  inputs: Inputs | null;
  scenario: Scenario | null;
  canEditGradePlan: boolean;
  canEditNormConfig: boolean;
  disabledReason: string;
  saving: boolean;
  onDirtyPathsChange: (paths: string[]) => void;
  onSave: (draft: NormDraft) => Promise<void>;
  sectionMode?: boolean;
  onSectionModeBack?: () => void;
  sectionFilter?: NormSectionFilter;
  onSectionFilterChange?: (filter: NormSectionFilter) => void;
  activeSectionKey?: NormSectionKey | null;
  onActiveSectionKeyChange?: (section: NormSectionKey | null) => void;
  showSectionModeTopControls?: boolean;
  stickySectionActions?: boolean;
  stickyBottomInset?: number;
};

const KEY_SEP = "||";
const DEFAULT_MAX_HOURS = 24;

const KADEME_DEFS = [
  { key: "okulOncesi", label: "Okul Oncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", label: "Ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", label: "Ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", label: "Lise", defaultFrom: "10", defaultTo: "12" },
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveHours(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_HOURS;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function buildEmptyCurriculum() {
  return NORM_GRADE_KEYS.reduce<Record<string, Record<string, number>>>((acc, grade) => {
    acc[grade] = {};
    return acc;
  }, {});
}

function normalizeNormValue(value: unknown): NormConfig {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const yearsSource = source.years && typeof source.years === "object"
    ? (source.years as Record<string, unknown>)
    : null;

  const years = NORM_YEAR_KEYS.reduce<Record<NormYearKey, NormYearConfig>>((acc, year) => {
    const yearSource = yearsSource?.[year] && typeof yearsSource[year] === "object"
      ? (yearsSource[year] as Record<string, unknown>)
      : {};
    const baseCurr = yearSource.curriculumWeeklyHours && typeof yearSource.curriculumWeeklyHours === "object"
      ? (yearSource.curriculumWeeklyHours as Record<string, Record<string, number>>)
      : source.curriculumWeeklyHours && typeof source.curriculumWeeklyHours === "object"
        ? (source.curriculumWeeklyHours as Record<string, Record<string, number>>)
        : buildEmptyCurriculum();

    const curriculum = buildEmptyCurriculum();
    NORM_GRADE_KEYS.forEach((grade) => {
      const row = baseCurr?.[grade] && typeof baseCurr[grade] === "object" ? baseCurr[grade] : {};
      curriculum[grade] = Object.entries(row).reduce<Record<string, number>>((rowAcc, [key, value]) => {
        const cleanKey = String(key || "").trim();
        if (!cleanKey) return rowAcc;
        rowAcc[cleanKey] = Math.max(0, num(value));
        return rowAcc;
      }, {});
    });

    acc[year] = {
      teacherWeeklyMaxHours: positiveHours(yearSource.teacherWeeklyMaxHours ?? source.teacherWeeklyMaxHours),
      curriculumWeeklyHours: curriculum,
    };
    return acc;
  }, {} as Record<NormYearKey, NormYearConfig>);

  return { years };
}

function normalizeKademeConfig(config: unknown) {
  const source = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, Record<string, unknown>>)
    : {};
  return KADEME_DEFS.reduce<Record<string, { enabled: boolean; from: string; to: string }>>((acc, def) => {
    const row = source[def.key] && typeof source[def.key] === "object" ? source[def.key] : {};
    acc[def.key] = {
      enabled: row.enabled !== false,
      from: str(row.from || def.defaultFrom),
      to: str(row.to || def.defaultTo),
    };
    return acc;
  }, {});
}

function gradeIndex(grade: string) {
  return NORM_GRADE_KEYS.indexOf(grade as (typeof NORM_GRADE_KEYS)[number]);
}

function visibleGradesFor(kademeConfig: Record<string, { enabled: boolean; from: string; to: string }>) {
  const included = new Set<string>();
  KADEME_DEFS.forEach((def) => {
    const row = kademeConfig[def.key];
    if (!row?.enabled) return;
    const from = gradeIndex(row.from);
    const to = gradeIndex(row.to);
    if (from < 0 || to < 0) return;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let index = start; index <= end; index += 1) {
      included.add(NORM_GRADE_KEYS[index]);
    }
  });
  const out = NORM_GRADE_KEYS.filter((grade) => included.has(grade));
  return out.length ? out : [...NORM_GRADE_KEYS];
}

function decodeKey(key: string) {
  if (key.includes(KEY_SEP)) {
    const [teacher, ...lessonParts] = key.split(KEY_SEP);
    return { teacher: teacher || "", lesson: lessonParts.join(KEY_SEP) || "" };
  }
  return { teacher: key, lesson: key };
}

function encodeKey(teacher: string, lesson: string) {
  const t = teacher.trim();
  const l = lesson.trim();
  if (!t && !l) return "";
  if (!l) return t;
  if (!t) return l;
  return `${t}${KEY_SEP}${l}`;
}

function yearLabel(year: NormYearKey) {
  return year === "y1" ? "Y1" : year === "y2" ? "Y2" : "Y3";
}

function inputPathFor(year: NormYearKey, index: number, field: "branchCount" | "studentsPerBranch" | "grade") {
  return `gradesYears.${year}.${index}.${field}`;
}

function currentInputPath(index: number, field: "branchCount" | "studentsPerBranch" | "grade") {
  return `gradesCurrent.${index}.${field}`;
}

function normPathFor(year: NormYearKey, suffix: string) {
  return `norm.years.${year}.${suffix}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rowTotals(rows: NormGradeRow[]) {
  return rows.reduce(
    (acc, row) => ({
      branches: acc.branches + num(row.branchCount),
      students: acc.students + num(row.studentsPerBranch),
    }),
    { branches: 0, students: 0 },
  );
}

function gradeLabel(grade: string) {
  return grade === "KG" ? "KG" : `${grade}. Sinif`;
}

function rowComplete(row: NormGradeRow | null | undefined) {
  return Boolean(row && num(row.branchCount) > 0 && num(row.studentsPerBranch) > 0);
}

function getGradeRow(rows: NormGradeRow[], grade: string) {
  return rows.find((row) => row.grade === grade) || null;
}

function getGradeGroups(
  visibleGrades: string[],
  kademeConfig: Record<string, { enabled: boolean; from: string; to: string }>,
) {
  const used = new Set<string>();
  const groups = KADEME_DEFS.map((def) => {
    const row = kademeConfig[def.key];
    if (!row?.enabled) return null;
    const from = gradeIndex(row.from);
    const to = gradeIndex(row.to);
    if (from < 0 || to < 0) return null;
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const grades = visibleGrades.filter((grade) => {
      const index = gradeIndex(grade);
      const included = index >= start && index <= end;
      if (included) used.add(grade);
      return included;
    });
    return grades.length ? { key: def.key, label: def.label, grades } : null;
  }).filter(Boolean) as Array<{ key: string; label: string; grades: string[] }>;
  const other = visibleGrades.filter((grade) => !used.has(grade));
  return other.length ? [...groups, { key: "diger", label: "Diger", grades: other }] : groups;
}

function lessonComplete(curriculum: Record<string, Record<string, number>>, visibleGrades: string[], lessonKey: string) {
  return visibleGrades.length > 0 && visibleGrades.every((grade) => num(curriculum?.[grade]?.[lessonKey]) > 0);
}

export function NormEditor({
  value,
  inputs,
  scenario,
  canEditGradePlan,
  canEditNormConfig,
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
  const [activeYear, setActiveYear] = React.useState<NormYearKey>("y1");
  const [normDraft, setNormDraft] = React.useState<NormConfig>(() => normalizeNormValue(value));
  const [gradesYears, setGradesYears] = React.useState<Record<NormYearKey, NormGradeRow[]>>(() =>
    normalizeNormPlanningGrades(inputs?.gradesYears, inputs?.grades),
  );
  const [gradesCurrent, setGradesCurrent] = React.useState<NormGradeRow[]>(() =>
    normalizeNormCurrentGrades(inputs?.gradesCurrent),
  );
  const [inputDirtyPaths, setInputDirtyPaths] = React.useState<string[]>([]);
  const [normDirtyPaths, setNormDirtyPaths] = React.useState<string[]>([]);
  const [newTeacher, setNewTeacher] = React.useState("");
  const [newLesson, setNewLesson] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [internalSectionFilter, setInternalSectionFilter] = React.useState<NormSectionFilter>("missing");
  const [internalActiveSection, setInternalActiveSection] = React.useState<NormSectionKey | null>(null);
  const [activeLessonKey, setActiveLessonKey] = React.useState<string | null>(null);
  const sectionFilter = controlledSectionFilter ?? internalSectionFilter;
  const setSectionFilter = React.useCallback((next: NormSectionFilter) => {
    if (onSectionFilterChange) onSectionFilterChange(next);
    else setInternalSectionFilter(next);
  }, [onSectionFilterChange]);
  const activeSection = controlledActiveSectionKey !== undefined ? controlledActiveSectionKey : internalActiveSection;
  const setActiveSection = React.useCallback((next: NormSectionKey | null) => {
    setActiveLessonKey(null);
    if (next === "mevcutDonem") setActiveYear("y1");
    if (onActiveSectionKeyChange) onActiveSectionKeyChange(next);
    else setInternalActiveSection(next);
  }, [onActiveSectionKeyChange]);
  const stickyActionBottom = Math.max(spacing.sm, stickyBottomInset - spacing.sm);
  const stickyActionScrollPadding = stickyActionBottom + 78;
  const stickyEditorHeight = Math.max(440, windowHeight - 150);

  React.useEffect(() => {
    setNormDraft(normalizeNormValue(value));
    setGradesYears(normalizeNormPlanningGrades(inputs?.gradesYears, inputs?.grades));
    setGradesCurrent(normalizeNormCurrentGrades(inputs?.gradesCurrent));
    setInputDirtyPaths([]);
    setNormDirtyPaths([]);
    setActiveSection(null);
    setActiveLessonKey(null);
    onDirtyPathsChange([]);
  }, [inputs?.grades, inputs?.gradesCurrent, inputs?.gradesYears, onDirtyPathsChange, setActiveSection, value]);

  React.useEffect(() => {
    onDirtyPathsChange(unique([...inputDirtyPaths, ...normDirtyPaths]));
  }, [inputDirtyPaths, normDirtyPaths, onDirtyPathsChange]);

  const kademeConfig = React.useMemo(
    () => normalizeKademeConfig(inputs?.temelBilgiler?.kademeler),
    [inputs?.temelBilgiler?.kademeler],
  );
  const visibleGrades = React.useMemo(() => visibleGradesFor(kademeConfig), [kademeConfig]);
  const currentYearNorm = normDraft.years[activeYear] || {
    teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
    curriculumWeeklyHours: buildEmptyCurriculum(),
  };
  const currentCurriculum = currentYearNorm.curriculumWeeklyHours || buildEmptyCurriculum();
  const activePlanningRows = gradesYears[activeYear] || [];
  const activePlanningTotals = rowTotals(activePlanningRows);
  const currentTotals = rowTotals(gradesCurrent);
  const allDirtyPaths = unique([...inputDirtyPaths, ...normDirtyPaths]);
  const isDirty = allDirtyPaths.length > 0;
  const canEditAny = canEditGradePlan || canEditNormConfig;

  const curriculumKeys = React.useMemo(() => {
    const keys = new Set<string>();
    NORM_GRADE_KEYS.forEach((grade) => {
      Object.keys(currentCurriculum?.[grade] || {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [currentCurriculum]);

  const branchByGrade = React.useMemo(() => {
    const map = new Map<string, number>();
    activePlanningRows.forEach((row) => map.set(row.grade, num(row.branchCount)));
    return map;
  }, [activePlanningRows]);

  const lessonSummaries = React.useMemo(
    () =>
      curriculumKeys.map((key) => {
        const totalHours = visibleGrades.reduce((sum, grade) => {
          return sum + num(currentCurriculum?.[grade]?.[key]) * num(branchByGrade.get(grade));
        }, 0);
        const teacherLimit = positiveHours(currentYearNorm.teacherWeeklyMaxHours);
        return {
          key,
          ...decodeKey(key),
          totalHours,
          educators: teacherLimit > 0 ? Math.ceil(totalHours / teacherLimit) : 0,
        };
      }),
    [branchByGrade, currentCurriculum, currentYearNorm.teacherWeeklyMaxHours, curriculumKeys, visibleGrades],
  );

  const totalTeachingHours = lessonSummaries.reduce((sum, row) => sum + row.totalHours, 0);
  const requiredTeachers = positiveHours(currentYearNorm.teacherWeeklyMaxHours) > 0
    ? Math.ceil(totalTeachingHours / positiveHours(currentYearNorm.teacherWeeklyMaxHours))
    : 0;
  const gradeGroups = React.useMemo(() => getGradeGroups(visibleGrades, kademeConfig), [kademeConfig, visibleGrades]);
  const planningMissingCount = NORM_YEAR_KEYS.reduce((sum, year) => {
    const rows = gradesYears[year] || [];
    return sum + visibleGrades.filter((grade) => !rowComplete(getGradeRow(rows, grade))).length;
  }, 0);
  const currentMissingCount = visibleGrades.filter((grade) => !rowComplete(getGradeRow(gradesCurrent, grade))).length;
  const incompleteLessonCount = lessonSummaries.filter((lesson) => !lessonComplete(currentCurriculum, visibleGrades, lesson.key)).length;
  const normSummaryDone = NORM_YEAR_KEYS.every((year) => positiveHours(normDraft.years[year]?.teacherWeeklyMaxHours) > 0);
  const planningDone = visibleGrades.length > 0 && planningMissingCount === 0;
  const currentDone = visibleGrades.length > 0 && currentMissingCount === 0;
  const curriculumDone = lessonSummaries.length > 0 && incompleteLessonCount === 0;
  const sectionCards: NormSectionCardModel[] = [
    {
      key: "normOzeti",
      title: "Norm Ozeti",
      subtitle: "Toplamlar ve ogretmen haftalik max saat",
      helper: "Hesaplanan toplamlar ve norm parametresini kontrol et.",
      icon: "analytics-outline",
      status: normSummaryDone ? "done" : "missing",
      done: normSummaryDone,
    },
    {
      key: "planlananDonem",
      title: "Planlanan Donem",
      subtitle: "Y1/Y2/Y3 sube ve ogrenci plani",
      helper: planningDone ? "Tum planlanan donem satirlari dolu." : `${planningMissingCount} sinif satiri bekliyor.`,
      icon: "calendar-outline",
      status: planningDone ? "done" : "missing",
      done: planningDone,
    },
    {
      key: "mevcutDonem",
      title: "Mevcut Donem",
      subtitle: "Mevcut sube ve ogrenci sayilari",
      helper: currentDone ? "Mevcut donem satirlari dolu." : `${currentMissingCount} mevcut sinif satiri bekliyor.`,
      icon: "school-outline",
      status: currentDone ? "done" : "missing",
      done: currentDone,
    },
    {
      key: "dersDagilimi",
      title: "Ders Dagilimi",
      subtitle: "Brans, ders ve haftalik saat matrisi",
      helper: curriculumDone
        ? "Ders satirlarinin haftalik saatleri dolu."
        : lessonSummaries.length
          ? `${incompleteLessonCount} ders satirinda eksik saat var.`
          : "Ders satiri ekleyin.",
      icon: "grid-outline",
      status: curriculumDone ? "done" : "missing",
      done: curriculumDone,
    },
  ];
  const missingSections = sectionCards.filter((section) => !section.done);
  const doneSections = sectionCards.filter((section) => section.done);
  const visibleSections = sectionFilter === "missing" ? missingSections : doneSections;

  function markInputDirty(path: string) {
    setInputDirtyPaths((prev) => {
      return unique([...prev, path]);
    });
  }

  function markNormDirty(path: string) {
    setNormDirtyPaths((prev) => {
      return unique([...prev, path]);
    });
  }

  function updatePlanningGrade(index: number, field: "branchCount" | "studentsPerBranch", value: number | null) {
    if (!canEditGradePlan) return;
    const nextValue = Math.max(0, num(value));
    setGradesYears((prev) => {
      const next = clone(prev);
      next[activeYear][index] = { ...next[activeYear][index], [field]: nextValue };
      return next;
    });
    markInputDirty(inputPathFor(activeYear, index, field));
    setMessage("");
  }

  function updateCurrentGrade(index: number, field: "branchCount" | "studentsPerBranch", value: number | null) {
    if (!canEditGradePlan) return;
    const nextValue = Math.max(0, num(value));
    setGradesCurrent((prev) => {
      const next = clone(prev);
      next[index] = { ...next[index], [field]: nextValue };
      return next;
    });
    markInputDirty(currentInputPath(index, field));
    setMessage("");
  }

  function updateMaxHours(value: number | null) {
    if (!canEditNormConfig) return;
    const nextValue = positiveHours(value);
    setNormDraft((prev) => setAtPath(prev, ["years", activeYear, "teacherWeeklyMaxHours"], nextValue));
    markNormDirty(normPathFor(activeYear, "teacherWeeklyMaxHours"));
    setMessage("");
  }

  function updateCurriculumCell(grade: string, lessonKey: string, value: number | null) {
    if (!canEditNormConfig) return;
    const nextValue = Math.max(0, num(value));
    setNormDraft((prev) =>
      setAtPath(prev, ["years", activeYear, "curriculumWeeklyHours", grade, lessonKey], nextValue),
    );
    markNormDirty(normPathFor(activeYear, `curriculumWeeklyHours.${grade}.${lessonKey}`));
    setMessage("");
  }

  function addLessonRow() {
    if (!canEditNormConfig) return;
    const key = encodeKey(newTeacher, newLesson);
    if (!key || curriculumKeys.includes(key)) return;
    let nextNorm = normDraft;
    NORM_GRADE_KEYS.forEach((grade) => {
      nextNorm = setAtPath(nextNorm, ["years", activeYear, "curriculumWeeklyHours", grade, key], 0);
    });
    setNormDraft(nextNorm);
    const newDirty = unique([
      ...normDirtyPaths,
      ...NORM_GRADE_KEYS.map((grade) => normPathFor(activeYear, `curriculumWeeklyHours.${grade}.${key}`)),
    ]);
    setNormDirtyPaths(newDirty);
    setNewTeacher("");
    setNewLesson("");
    setMessage("");
  }

  function removeLessonRow(key: string) {
    if (!canEditNormConfig) return;
    let nextNorm = normDraft;
    NORM_GRADE_KEYS.forEach((grade) => {
      const row = { ...(getAtPath(nextNorm, ["years", activeYear, "curriculumWeeklyHours", grade]) as Record<string, unknown> || {}) };
      delete row[key];
      nextNorm = setAtPath(nextNorm, ["years", activeYear, "curriculumWeeklyHours", grade], row);
    });
    setNormDraft(nextNorm);
    const newDirty = unique([
      ...normDirtyPaths,
      ...NORM_GRADE_KEYS.map((grade) => normPathFor(activeYear, `curriculumWeeklyHours.${grade}.${key}`)),
    ]);
    setNormDirtyPaths(newDirty);
    if (activeLessonKey === key) setActiveLessonKey(null);
    setMessage("");
  }

  function copyFromPreviousYear() {
    if (!canEditAny) return;
    const activeIndex = NORM_YEAR_KEYS.indexOf(activeYear);
    if (activeIndex <= 0) return;
    const previousYear = NORM_YEAR_KEYS[activeIndex - 1];

    if (canEditNormConfig) {
      const prevNorm = normDraft.years[previousYear] || {
        teacherWeeklyMaxHours: DEFAULT_MAX_HOURS,
        curriculumWeeklyHours: buildEmptyCurriculum(),
      };
      setNormDraft((prev) => setAtPath(prev, ["years", activeYear], clone(prevNorm)));
      const curr = prevNorm.curriculumWeeklyHours || {};
      const dirtyNorm = [
        normPathFor(activeYear, "teacherWeeklyMaxHours"),
        ...NORM_GRADE_KEYS.flatMap((grade) =>
          Object.keys(curr[grade] || {}).map((key) => normPathFor(activeYear, `curriculumWeeklyHours.${grade}.${key}`)),
        ),
      ];
      setNormDirtyPaths((prev) => {
        return unique([...prev, ...dirtyNorm]);
      });
    }

    if (canEditGradePlan) {
      const prevRows = gradesYears[previousYear] || [];
      setGradesYears((prev) => ({ ...prev, [activeYear]: clone(prevRows) }));
      const dirtyInputs = prevRows.flatMap((_, index) => [
        inputPathFor(activeYear, index, "grade"),
        inputPathFor(activeYear, index, "branchCount"),
        inputPathFor(activeYear, index, "studentsPerBranch"),
      ]);
      setInputDirtyPaths((prev) => {
        return unique([...prev, ...dirtyInputs]);
      });
    }
  }

  async function handleSave() {
    if (!isDirty || saving) return;
    setMessage("");
    try {
      await onSave({
        norm: normDraft,
        normDirtyPaths,
        gradesYears,
        gradesCurrent,
        inputDirtyPaths,
      });
      setInputDirtyPaths([]);
      setNormDirtyPaths([]);
      onDirtyPathsChange([]);
      setMessage("Norm kaydedildi.");
    } catch (e: any) {
      setMessage(e?.message || "Norm kaydedilemedi.");
    }
  }

  function handleCancel() {
    setNormDraft(normalizeNormValue(value));
    setGradesYears(normalizeNormPlanningGrades(inputs?.gradesYears, inputs?.grades));
    setGradesCurrent(normalizeNormCurrentGrades(inputs?.gradesCurrent));
    setInputDirtyPaths([]);
    setNormDirtyPaths([]);
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
          testID="norm-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!isDirty || saving || !canEditAny}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="norm-save-button"
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
    const backAction = activeLessonKey
      ? () => setActiveLessonKey(null)
      : activeSection
        ? () => setActiveSection(null)
        : onSectionModeBack;
    return (
      <View style={styles.sectionModeTopRow}>
        <Pressable
          onPress={backAction}
          hitSlop={12}
          style={({ pressed }) => [styles.sectionTopBackButton, pressed ? styles.pressed : null]}
          testID={activeLessonKey ? "norm-lesson-back-button" : activeSection ? "norm-section-back-button" : "scenario-back-button"}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        {showTabs ? (
          <View style={styles.topTabs}>
            <Pressable
              onPress={() => setSectionFilter("missing")}
              style={[styles.topTab, sectionFilter === "missing" ? styles.topTabActive : null]}
              testID="norm-filter-missing"
            >
              <Text style={[styles.topTabText, sectionFilter === "missing" ? styles.topTabTextActive : null]}>
                Eksik {missingSections.length}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSectionFilter("done")}
              style={[styles.topTab, sectionFilter === "done" ? styles.topTabActive : null]}
              testID="norm-filter-done"
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
        {NORM_YEAR_KEYS.map((year) => {
          const active = activeYear === year;
          return (
            <Pressable
              key={year}
              onPress={() => setActiveYear(year)}
              style={[styles.mobileYearTab, active ? styles.mobileYearTabActive : null]}
              testID={`norm-mobile-year-${year}`}
            >
              <Text style={[styles.mobileYearTabText, active ? styles.mobileYearTabTextActive : null]}>{yearLabel(year)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderCopyButton() {
    const canCopy = NORM_YEAR_KEYS.indexOf(activeYear) > 0 && canEditAny;
    return canCopy ? (
      <Button
        label="Onceki Yildan"
        icon="copy-outline"
        variant="secondary"
        small
        onPress={copyFromPreviousYear}
        testID="norm-copy-previous-button"
      />
    ) : null;
  }

  function renderNormOzetiSection() {
    return (
      <>
        {renderYearTabs()}
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Ozet degerler</Text>
          <Text style={styles.mobileInfoText}>
            Planlanan/mevcut toplamlar ve gerekli egitimci otomatik hesaplanir. Haftalik max saat bu bolumde duzenlenir.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Toplamlar</Text>
          <CompactValueRow label="Planlanan sube" value={formatInt(activePlanningTotals.branches)} />
          <CompactValueRow label="Planlanan ogrenci" value={formatInt(activePlanningTotals.students)} />
          <CompactValueRow label="Mevcut sube" value={formatInt(currentTotals.branches)} />
          <CompactValueRow label="Mevcut ogrenci" value={formatInt(currentTotals.students)} />
          <CompactValueRow label="Toplam haftalik ders saati" value={totalTeachingHours.toFixed(2)} />
          <CompactValueRow label="Gerekli egitimci" value={formatInt(requiredTeachers)} />
        </View>
        <View style={styles.mobileFormCard}>
          <View style={styles.mobileCardHead}>
            <Text style={styles.mobileGroupTitle}>Norm parametresi</Text>
            {renderCopyButton()}
          </View>
          <FormRow label={`Ogretmen haftalik max saat (${yearLabel(activeYear)})`}>
            <FinancialNumberInput
              value={positiveHours(currentYearNorm.teacherWeeklyMaxHours)}
              unit="saat"
              disabled={!canEditNormConfig}
              onChange={updateMaxHours}
              testID="norm-teacher-weekly-max-hours"
            />
          </FormRow>
          {!canEditNormConfig && canEditGradePlan ? (
            <Text style={styles.warningText}>Norm parametresi icin page.norm yazma yetkisi gerekir.</Text>
          ) : null}
        </View>
      </>
    );
  }

  function renderGradeEditorCards(
    rows: NormGradeRow[],
    kind: "planned" | "current",
    update: (index: number, field: "branchCount" | "studentsPerBranch", value: number | null) => void,
    disabled: boolean,
  ) {
    return gradeGroups.map((group) => (
      <View key={`${kind}-${group.key}`} style={styles.mobileFormCard}>
        <Text style={styles.mobileGroupTitle}>{group.label}</Text>
        {group.grades.map((grade) => {
          const index = rows.findIndex((row) => row.grade === grade);
          const row = index >= 0 ? rows[index] : null;
          if (!row) return null;
          return (
            <View key={`${kind}-${activeYear}-${grade}`} style={styles.mobileGradeCard}>
              <View style={styles.mobileGradeHead}>
                <Text style={styles.mobileGradeTitle}>{gradeLabel(grade)}</Text>
                <Text style={styles.mobileGradePill}>{kind === "planned" ? yearLabel(activeYear) : "Mevcut"}</Text>
              </View>
              <View style={styles.mobileTwoCols}>
                <View style={styles.mobileFieldCol}>
                  <FormRow label="Sube">
                    <FinancialNumberInput
                      value={num(row.branchCount)}
                      disabled={disabled}
                      onChange={(next) => update(index, "branchCount", next)}
                    />
                  </FormRow>
                </View>
                <View style={styles.mobileFieldCol}>
                  <FormRow label="Ogrenci">
                    <FinancialNumberInput
                      value={num(row.studentsPerBranch)}
                      disabled={disabled}
                      onChange={(next) => update(index, "studentsPerBranch", next)}
                    />
                  </FormRow>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    ));
  }

  function renderPlanlananDonemSection() {
    return (
      <>
        {renderYearTabs()}
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <View style={styles.mobileCardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mobileInfoTitle}>Yil bazli planlama</Text>
              <Text style={styles.mobileInfoText}>
                Her sinif icin sube ve toplam ogrenci sayisi leaf-level kaydedilir.
              </Text>
            </View>
            {renderCopyButton()}
          </View>
        </View>
        {renderGradeEditorCards(activePlanningRows, "planned", updatePlanningGrade, !canEditGradePlan)}
      </>
    );
  }

  function renderMevcutDonemSection() {
    return (
      <>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Mevcut bilgiler</Text>
          <Text style={styles.mobileInfoText}>
            Mevcut donem web akisi gibi Y1 baglaminda duzenlenir ve grade planlama girdilerine kaydedilir.
          </Text>
        </View>
        {renderGradeEditorCards(gradesCurrent, "current", updateCurrentGrade, !canEditGradePlan)}
      </>
    );
  }

  function renderLessonCards() {
    return lessonSummaries.map((lesson) => {
      const complete = lessonComplete(currentCurriculum, visibleGrades, lesson.key);
      const missingCount = visibleGrades.filter((grade) => num(currentCurriculum?.[grade]?.[lesson.key]) <= 0).length;
      return (
        <Pressable
          key={lesson.key}
          onPress={() => setActiveLessonKey(lesson.key)}
          style={({ pressed }) => [styles.mobileLessonCard, pressed ? styles.pressed : null]}
          testID={`norm-lesson-card-${lesson.key}`}
        >
          <View style={styles.mobileSectionCardTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.mobileSectionTitle}>{lesson.teacher || "Ders"}</Text>
              <Text style={styles.mobileSectionSub} numberOfLines={2}>
                {(lesson.lesson || lesson.key)} - toplam {lesson.totalHours.toFixed(2)} saat - {formatInt(lesson.educators)} egitimci
              </Text>
            </View>
            <View style={[styles.mobileStatusPill, complete ? styles.mobileStatusDone : styles.mobileStatusMissing]}>
              <Text style={[styles.mobileStatusText, complete ? styles.mobileStatusTextDone : styles.mobileStatusTextMissing]}>
                {complete ? "Tamam" : "Eksik"}
              </Text>
            </View>
          </View>
          <View style={styles.mobileCardDivider} />
          <View style={styles.mobileSectionBottom}>
            <Text style={styles.mobileSectionHint} numberOfLines={2}>
              {complete ? "Haftalik saatleri goruntule veya duzenle." : `${missingCount} sinif haftalik saati bekliyor.`}
            </Text>
            <View style={[styles.mobileSmallButton, complete ? styles.mobileSmallButtonSecondary : null]}>
              <Text style={[styles.mobileSmallButtonText, complete ? styles.mobileSmallButtonTextSecondary : null]}>
                {complete ? "Ac" : "Duzenle"}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    });
  }

  function renderDersDagilimiList() {
    return (
      <>
        {renderYearTabs()}
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Ders satirlari</Text>
          <Text style={styles.mobileInfoText}>
            Brans ve ders eklenir. Her ders kartina girip sinif bazli haftalik saatler duzenlenir.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          <Text style={styles.mobileGroupTitle}>Yeni ders ekle</Text>
          <View style={styles.addLessonBox}>
            <TextInput
              value={newTeacher}
              editable={canEditNormConfig}
              onChangeText={setNewTeacher}
              placeholder="Brans ogretmeni"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
              testID="norm-new-teacher-input"
            />
            <TextInput
              value={newLesson}
              editable={canEditNormConfig}
              onChangeText={setNewLesson}
              placeholder="Ders adi"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
              testID="norm-new-lesson-input"
            />
            <Button
              label="Ekle"
              icon="add-outline"
              variant="secondary"
              disabled={!canEditNormConfig}
              onPress={addLessonRow}
              testID="norm-add-lesson-button"
            />
          </View>
        </View>
        {lessonSummaries.length ? renderLessonCards() : (
          <Card style={styles.emptySectionCard}>
            <Ionicons name="grid-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptySectionTitle}>Ders satiri yok</Text>
            <Text style={styles.emptySectionText}>Yetkiniz varsa yeni ders ekleyerek baslayabilirsiniz.</Text>
          </Card>
        )}
      </>
    );
  }

  function renderLessonDetail(lessonKey: string) {
    const lesson = lessonSummaries.find((row) => row.key === lessonKey);
    if (!lesson) {
      return renderDersDagilimiList();
    }
    return (
      <>
        <View style={styles.lessonDetailTop}>
          <Pressable
            onPress={() => setActiveLessonKey(null)}
            hitSlop={10}
            style={({ pressed }) => [styles.lessonDetailBack, pressed ? styles.pressed : null]}
            testID="norm-lesson-inline-back"
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.lessonDetailTitle} numberOfLines={1}>{lesson.lesson || lesson.key}</Text>
            <Text style={styles.lessonDetailSub} numberOfLines={1}>Ders Dagilimi</Text>
          </View>
        </View>
        <View style={[styles.mobileFormCard, styles.mobileInfoCard]}>
          <Text style={styles.mobileInfoTitle}>Sinif bazli haftalik saat</Text>
          <Text style={styles.mobileInfoText}>
            Ders satiri icinde sadece ilgili dersin KG-12 haftalik saatleri duzenlenir.
          </Text>
        </View>
        <View style={styles.mobileFormCard}>
          <View style={styles.mobileLessonDetailHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.mobileGroupTitle}>{lesson.teacher || "Ders"}</Text>
              <Text style={styles.mobileSectionSub}>
                Toplam {lesson.totalHours.toFixed(2)} saat - Gerekli egitimci {formatInt(lesson.educators)}
              </Text>
            </View>
            <Pressable
              disabled={!canEditNormConfig}
              onPress={() => removeLessonRow(lesson.key)}
              style={({ pressed }) => [styles.deleteButton, { opacity: !canEditNormConfig ? 0.35 : pressed ? 0.75 : 1 }]}
              testID={`norm-remove-${lesson.key}`}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </Pressable>
          </View>
          {visibleGrades.map((grade) => (
            <View key={`${lesson.key}-${grade}`} style={styles.lessonHourRow}>
              <Text style={styles.lessonHourLabel}>{gradeLabel(grade)} haftalik saat</Text>
              <View style={styles.lessonHourInput}>
                <FinancialNumberInput
                  value={num(currentCurriculum?.[grade]?.[lesson.key])}
                  disabled={!canEditNormConfig}
                  onChange={(next) => updateCurriculumCell(grade, lesson.key, next)}
                />
              </View>
            </View>
          ))}
        </View>
      </>
    );
  }

  function renderDersDagilimiSection() {
    return activeLessonKey ? renderLessonDetail(activeLessonKey) : renderDersDagilimiList();
  }

  function renderSectionForm(section: NormSectionKey) {
    switch (section) {
      case "normOzeti":
        return renderNormOzetiSection();
      case "planlananDonem":
        return renderPlanlananDonemSection();
      case "mevcutDonem":
        return renderMevcutDonemSection();
      case "dersDagilimi":
      default:
        return renderDersDagilimiSection();
    }
  }

  const activeIndex = NORM_YEAR_KEYS.indexOf(activeYear);
  const canCopyPrevious = activeIndex > 0 && canEditAny;
  const editableHint = canEditAny
    ? "Grade planlama ve norm ders dagilimi leaf-level kaydedilir."
    : disabledReason;

  if (sectionMode) {
    if (activeSection) {
      if (stickySectionActions) {
        return (
          <View testID="norm-editor" style={[styles.sectionEditorShell, { height: stickyEditorHeight }]}>
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
        <View testID="norm-editor" style={styles.sectionModeRoot}>
          {renderSectionModeTop(false)}
          {renderSectionForm(activeSection)}
          {message ? <Text style={message.includes("kaydedildi") ? styles.successText : styles.warningText}>{message}</Text> : null}
          {renderActionButtons()}
        </View>
      );
    }

    return (
      <View testID="norm-editor" style={styles.sectionModeRoot}>
        {renderSectionModeTop(true)}
        <View style={styles.sectionCardList}>
          {visibleSections.length ? (
            visibleSections.map((section) => (
              <NormSectionCard
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
                  ? "Norm bolumlerinin tamami kontrol edildi."
                  : "Bir bolum tamamlandiginda burada gorunur."}
              </Text>
            </Card>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card testID="norm-editor">
      <View style={styles.editorHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Norm Editoru</Text>
          <Text style={styles.subtitle}>{editableHint}</Text>
        </View>
        <View style={[styles.editBadge, canEditAny ? styles.editBadgeOn : styles.editBadgeOff]}>
          <Ionicons name={canEditAny ? "create-outline" : "lock-closed-outline"} size={14} color={canEditAny ? colors.primaryText : colors.warn} />
          <Text style={[styles.editBadgeText, { color: canEditAny ? colors.primaryText : colors.warn }]}>
            {canEditAny ? "Acik" : "Kilitli"}
          </Text>
        </View>
      </View>

      <View style={styles.yearTabs}>
        {NORM_YEAR_KEYS.map((year) => (
          <Chip
            key={year}
            label={yearLabel(year)}
            active={activeYear === year}
            onPress={() => setActiveYear(year)}
            testID={`norm-year-${year}`}
          />
        ))}
      </View>

      <FormSection
        title="Norm Ozeti"
        subtitle={`${scenario?.academic_year || "Senaryo"} / ${yearLabel(activeYear)}`}
        right={canCopyPrevious ? (
          <Button
            label="Onceki Yildan"
            icon="copy-outline"
            variant="secondary"
            small
            onPress={copyFromPreviousYear}
            testID="norm-copy-previous-button"
          />
        ) : null}
      >
        <ReadonlyValueRow label="Planlanan sube" value={formatInt(activePlanningTotals.branches)} />
        <ReadonlyValueRow label="Planlanan ogrenci" value={formatInt(activePlanningTotals.students)} />
        <ReadonlyValueRow label="Mevcut sube" value={formatInt(currentTotals.branches)} />
        <ReadonlyValueRow label="Mevcut ogrenci" value={formatInt(currentTotals.students)} />
        <ReadonlyValueRow label="Toplam haftalik ders saati" value={totalTeachingHours.toFixed(2)} />
        <ReadonlyValueRow label="Gerekli egitimci" value={formatInt(requiredTeachers)} />
        <FormRow label={`Ogretmen haftalik max saat (${yearLabel(activeYear)})`}>
          <FinancialNumberInput
            value={positiveHours(currentYearNorm.teacherWeeklyMaxHours)}
            disabled={!canEditNormConfig}
            onChange={updateMaxHours}
            testID="norm-teacher-weekly-max-hours"
          />
        </FormRow>
        {!canEditNormConfig && canEditGradePlan ? (
          <Text style={styles.warningText}>Norm ders dagilimi icin page.norm yazma yetkisi gerekir; grade planlama acik kalir.</Text>
        ) : null}
      </FormSection>

      <FormSection title="Planlanan Donem" subtitle="Sube ve ogrenci sayilari senaryo girdilerine kaydedilir.">
        {visibleGrades.map((grade) => {
          const index = activePlanningRows.findIndex((row) => row.grade === grade);
          const row = index >= 0 ? activePlanningRows[index] : null;
          if (!row) return null;
          return (
            <View key={`${activeYear}-${grade}`} style={styles.gradeBlock}>
              <Text style={styles.blockTitle}>{grade}</Text>
              <View style={styles.inputGrid}>
                <FormRow label="Sube">
                  <FinancialNumberInput
                    value={num(row.branchCount)}
                    disabled={!canEditGradePlan}
                    onChange={(next) => updatePlanningGrade(index, "branchCount", next)}
                  />
                </FormRow>
                <FormRow label="Ogrenci">
                  <FinancialNumberInput
                    value={num(row.studentsPerBranch)}
                    disabled={!canEditGradePlan}
                    onChange={(next) => updatePlanningGrade(index, "studentsPerBranch", next)}
                  />
                </FormRow>
              </View>
            </View>
          );
        })}
      </FormSection>

      <FormSection title="Mevcut Donem" subtitle="Mevcut bilgiler web akisi gibi yalniz Y1 sekmesinde duzenlenir.">
        {activeYear !== "y1" ? <Text style={styles.warningText}>Mevcut donem bilgileri icin Y1 sekmesine gecin.</Text> : null}
        {visibleGrades.map((grade) => {
          const index = gradesCurrent.findIndex((row) => row.grade === grade);
          const row = index >= 0 ? gradesCurrent[index] : null;
          if (!row) return null;
          return (
            <View key={`current-${grade}`} style={styles.gradeBlock}>
              <Text style={styles.blockTitle}>{grade}</Text>
              <View style={styles.inputGrid}>
                <FormRow label="Sube">
                  <FinancialNumberInput
                    value={num(row.branchCount)}
                    disabled={!canEditGradePlan || activeYear !== "y1"}
                    onChange={(next) => updateCurrentGrade(index, "branchCount", next)}
                  />
                </FormRow>
                <FormRow label="Ogrenci">
                  <FinancialNumberInput
                    value={num(row.studentsPerBranch)}
                    disabled={!canEditGradePlan || activeYear !== "y1"}
                    onChange={(next) => updateCurrentGrade(index, "studentsPerBranch", next)}
                  />
                </FormRow>
              </View>
            </View>
          );
        })}
      </FormSection>

      <FormSection title="Ders Dagilimi" subtitle="Mevcut ders satirlari ve haftalik saatler scenario norm-config kaydina gider.">
        <View style={styles.addLessonBox}>
          <TextInput
            value={newTeacher}
            editable={canEditNormConfig}
            onChangeText={setNewTeacher}
            placeholder="Brans ogretmeni"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            testID="norm-new-teacher-input"
          />
          <TextInput
            value={newLesson}
            editable={canEditNormConfig}
            onChangeText={setNewLesson}
            placeholder="Ders adi"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            testID="norm-new-lesson-input"
          />
          <Button
            label="Ekle"
            icon="add-outline"
            variant="secondary"
            disabled={!canEditNormConfig}
            onPress={addLessonRow}
            testID="norm-add-lesson-button"
          />
        </View>

        {!lessonSummaries.length ? (
          <Text style={styles.emptyText}>Henuz ders satiri yok. Yetkiniz varsa ders ekleyerek baslayabilirsiniz.</Text>
        ) : null}

        {lessonSummaries.map((lesson) => (
          <View key={lesson.key} style={styles.lessonBlock}>
            <View style={styles.lessonHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockTitle}>{lesson.teacher || "Ders"}</Text>
                <Text style={styles.subtitle}>{lesson.lesson || lesson.key}</Text>
              </View>
              <Pressable
                disabled={!canEditNormConfig}
                onPress={() => removeLessonRow(lesson.key)}
                style={({ pressed }) => [styles.deleteButton, { opacity: !canEditNormConfig ? 0.35 : pressed ? 0.75 : 1 }]}
                testID={`norm-remove-${lesson.key}`}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </Pressable>
            </View>
            <ReadonlyValueRow label="Toplam ders saati" value={lesson.totalHours.toFixed(2)} />
            <ReadonlyValueRow label="Egitimci" value={formatInt(lesson.educators)} />
            {visibleGrades.map((grade) => (
              <FormRow key={`${lesson.key}-${grade}`} label={`${grade} haftalik saat`}>
                <FinancialNumberInput
                  value={num(currentCurriculum?.[grade]?.[lesson.key])}
                  disabled={!canEditNormConfig}
                  onChange={(next) => updateCurriculumCell(grade, lesson.key, next)}
                />
              </FormRow>
            ))}
          </View>
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
          testID="norm-cancel-button"
        />
        <Button
          label={isDirty ? "Kaydet" : "Degisiklik yok"}
          icon="save-outline"
          disabled={!isDirty || saving || !canEditAny}
          loading={saving}
          onPress={handleSave}
          style={styles.actionButton}
          testID="norm-save-button"
        />
      </View>
    </Card>
  );
}

type NormSectionCardModel = {
  key: NormSectionKey;
  title: string;
  subtitle: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: "missing" | "done";
  done: boolean;
};

function NormSectionCard({
  section,
  onPress,
}: {
  section: NormSectionCardModel;
  onPress: () => void;
}) {
  const missing = section.status === "missing";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sectionCard, pressed ? styles.pressed : null]}
      testID={`norm-section-${section.key}`}
    >
      <View style={styles.mobileSectionCardTop}>
        <View style={[styles.sectionIcon, missing ? styles.sectionIconMissing : styles.sectionIconDone]}>
          <Ionicons name={section.icon} size={23} color={missing ? colors.warn : colors.success} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionCardTitle} numberOfLines={2}>{section.title}</Text>
          <Text style={styles.sectionCardSubtitle} numberOfLines={2}>{section.subtitle}</Text>
        </View>
        <View style={[styles.mobileStatusPill, missing ? styles.mobileStatusMissing : styles.mobileStatusDone]}>
          <Text style={[styles.mobileStatusText, missing ? styles.mobileStatusTextMissing : styles.mobileStatusTextDone]}>
            {missing ? "Eksik" : "Tamam"}
          </Text>
        </View>
      </View>
      <View style={styles.mobileCardDivider} />
      <View style={styles.mobileSectionBottom}>
        <Text style={styles.mobileSectionHint} numberOfLines={2}>{section.helper}</Text>
        <View style={[styles.mobileSmallButton, !missing ? styles.mobileSmallButtonSecondary : null]}>
          <Text style={[styles.mobileSmallButtonText, !missing ? styles.mobileSmallButtonTextSecondary : null]}>
            {missing ? "Doldur" : "Ac"}
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
  gradeBlock: {
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  blockTitle: {
    color: colors.text,
    ...font.bodyMd,
  },
  inputGrid: {
    gap: spacing.sm,
  },
  addLessonBox: {
    gap: spacing.sm,
  },
  textInput: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  lessonBlock: {
    backgroundColor: colors.bgElev2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  lessonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#EF444455",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF444422",
  },
  emptyText: {
    color: colors.textDim,
    ...font.body,
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
  mobileCardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
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
  mobileGradeCard: {
    borderRadius: 20,
    backgroundColor: colors.bgElev2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 13,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mobileGradeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  mobileGradeTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  mobileGradePill: {
    color: colors.textDim,
    ...font.tiny,
    fontWeight: "900",
    borderRadius: radius.pill,
    backgroundColor: colors.chipBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  mobileTwoCols: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  mobileFieldCol: {
    flex: 1,
    minWidth: 0,
  },
  mobileLessonCard: {
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
  mobileSectionTitle: {
    color: colors.text,
    ...font.h3,
    fontWeight: "900",
  },
  mobileSectionSub: {
    color: colors.textDim,
    ...font.small,
    lineHeight: 19,
    marginTop: 4,
  },
  lessonDetailTop: {
    minHeight: 52,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  lessonDetailBack: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElev2,
  },
  lessonDetailTitle: {
    color: colors.text,
    ...font.bodyMd,
    fontWeight: "900",
  },
  lessonDetailSub: {
    color: colors.textDim,
    ...font.tiny,
    marginTop: 2,
  },
  mobileLessonDetailHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lessonHourRow: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElev2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 8,
  },
  lessonHourLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textDim,
    ...font.small,
    fontWeight: "900",
  },
  lessonHourInput: {
    width: 104,
  },
});
