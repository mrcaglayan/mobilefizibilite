import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
}: Props) {
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

  React.useEffect(() => {
    setNormDraft(normalizeNormValue(value));
    setGradesYears(normalizeNormPlanningGrades(inputs?.gradesYears, inputs?.grades));
    setGradesCurrent(normalizeNormCurrentGrades(inputs?.gradesCurrent));
    setInputDirtyPaths([]);
    setNormDirtyPaths([]);
    onDirtyPathsChange([]);
  }, [inputs?.grades, inputs?.gradesCurrent, inputs?.gradesYears, onDirtyPathsChange, value]);

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
    if (!canEditGradePlan || activeYear !== "y1") return;
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

  const activeIndex = NORM_YEAR_KEYS.indexOf(activeYear);
  const canCopyPrevious = activeIndex > 0 && canEditAny;
  const editableHint = canEditAny
    ? "Grade planlama ve norm ders dagilimi leaf-level kaydedilir."
    : disabledReason;

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
});
