import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export const NORM_YEAR_KEYS = ["y1", "y2", "y3"] as const;
export const NORM_GRADE_KEYS = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

export type NormYearKey = (typeof NORM_YEAR_KEYS)[number];
export type NormGradeKey = (typeof NORM_GRADE_KEYS)[number];

export type NormGradeRow = {
  grade: string;
  branchCount: number;
  studentsPerBranch: number;
  [key: string]: unknown;
};

export type NormDraft = {
  norm: Record<string, unknown>;
  normDirtyPaths: string[];
  gradesYears: Record<NormYearKey, NormGradeRow[]>;
  gradesCurrent: NormGradeRow[];
  inputDirtyPaths: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRows(rows: unknown): NormGradeRow[] {
  const source = Array.isArray(rows) ? rows : [];
  return NORM_GRADE_KEYS.map((grade) => {
    const row = source.find((candidate) => String(candidate?.grade) === grade) || {};
    return {
      ...(row && typeof row === "object" ? row : {}),
      grade,
      branchCount: num((row as Record<string, unknown>)?.branchCount),
      studentsPerBranch: num((row as Record<string, unknown>)?.studentsPerBranch),
    };
  });
}

export function normalizeNormPlanningGrades(
  gradesYearsInput: unknown,
  legacyGradesInput?: unknown,
): Record<NormYearKey, NormGradeRow[]> {
  const baseRows = normalizeRows(Array.isArray(legacyGradesInput) ? legacyGradesInput : []);

  if (Array.isArray(gradesYearsInput)) {
    const rows = normalizeRows(gradesYearsInput);
    return { y1: rows, y2: rows.map((row) => ({ ...row })), y3: rows.map((row) => ({ ...row })) };
  }
  if (gradesYearsInput && typeof gradesYearsInput === "object") {
    const source = gradesYearsInput as Record<string, unknown>;
    const years = source.years && typeof source.years === "object"
      ? (source.years as Record<string, unknown>)
      : source;
    const y1 = Array.isArray(years.y1) ? normalizeRows(years.y1) : baseRows;
    const y2 = Array.isArray(years.y2) ? normalizeRows(years.y2) : y1.map((row) => ({ ...row }));
    const y3 = Array.isArray(years.y3) ? normalizeRows(years.y3) : y1.map((row) => ({ ...row }));
    return { y1, y2, y3 };
  }
  return { y1: baseRows, y2: baseRows.map((row) => ({ ...row })), y3: baseRows.map((row) => ({ ...row })) };
}

export function normalizeNormCurrentGrades(input: unknown): NormGradeRow[] {
  return normalizeRows(input);
}

function rowValue(draft: NormDraft, path: string) {
  return getAtPath(
    {
      gradesYears: draft.gradesYears,
      gradesCurrent: draft.gradesCurrent,
      grades: draft.gradesYears.y1,
    },
    path,
  );
}

function pushFullRowPatches(
  patchesByPath: Map<string, InputPatch>,
  prefix: string,
  rows: NormGradeRow[],
  index: number,
) {
  const row = rows[index];
  if (!row) return;
  ["grade", "branchCount", "studentsPerBranch"].forEach((field) => {
    const path = `${prefix}.${index}.${field}`;
    patchesByPath.set(path, {
      path,
      value: row[field],
    });
  });
}

export const normGradesSaveAdapter: ScenarioModuleSaveAdapter<NormDraft> = {
  moduleId: "norm.ders_dagilimi",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.norm],
  validate: (draft) => {
    const invalidPaths = unique(draft.inputDirtyPaths).filter((path) => {
      if (/^gradesYears\.(y1|y2|y3)\.\d+\.(grade|branchCount|studentsPerBranch)$/.test(path)) return false;
      if (/^gradesCurrent\.\d+\.(grade|branchCount|studentsPerBranch)$/.test(path)) return false;
      if (/^grades\.\d+\.(grade|branchCount|studentsPerBranch)$/.test(path)) return false;
      return true;
    });
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Norm grade path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] => {
    const patchesByPath = new Map<string, InputPatch>();
    const touchedPlanningYears = new Set<NormYearKey>();
    let touchedCurrent = false;

    unique(draft.inputDirtyPaths).forEach((path) => {
      patchesByPath.set(path, {
        path,
        value: rowValue(draft, path),
      });

      const planningMatch = /^gradesYears\.(y1|y2|y3)\.(\d+)\.(grade|branchCount|studentsPerBranch)$/.exec(path);
      if (planningMatch) {
        touchedPlanningYears.add(planningMatch[1] as NormYearKey);
        return;
      }

      const currentMatch = /^gradesCurrent\.(\d+)\.(grade|branchCount|studentsPerBranch)$/.exec(path);
      if (currentMatch) touchedCurrent = true;
    });

    touchedPlanningYears.forEach((year) => {
      const rows = draft.gradesYears[year] || [];
      rows.forEach((_row, index) => {
        pushFullRowPatches(patchesByPath, `gradesYears.${year}`, rows, index);
      });
      if (year === "y1") {
        rows.forEach((_row, index) => {
          pushFullRowPatches(patchesByPath, "grades", rows, index);
        });
      }
    });

    if (touchedCurrent) {
      draft.gradesCurrent.forEach((_row, index) => {
        pushFullRowPatches(patchesByPath, "gradesCurrent", draft.gradesCurrent, index);
      });
    }

    return Array.from(patchesByPath.values());
  },
};
