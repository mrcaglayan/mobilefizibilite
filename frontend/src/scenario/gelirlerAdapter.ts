import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export const GELIRLER_YEAR_KEYS = ["y1", "y2", "y3"] as const;
export type GelirlerYearKey = (typeof GELIRLER_YEAR_KEYS)[number];

export const GELIRLER_SECTION_KEYS = [
  "tuition",
  "nonEducationFees",
  "dormitory",
  "otherInstitutionIncome",
] as const;
export type GelirlerSectionKey = (typeof GELIRLER_SECTION_KEYS)[number];

export type GelirlerRow = {
  key: string;
  label?: string;
  studentCount?: number;
  studentCountY2?: number;
  studentCountY3?: number;
  unitFee?: number;
  amount?: number;
  [key: string]: unknown;
};

export type GelirlerObject = Record<string, unknown> & {
  tuition?: { rows?: GelirlerRow[] };
  nonEducationFees?: { rows?: GelirlerRow[] };
  dormitory?: { rows?: GelirlerRow[] };
  otherInstitutionIncome?: { rows?: GelirlerRow[] };
  governmentIncentives?: number;
};

export type GelirlerDraft = {
  gelirler: GelirlerObject;
  dirtyPaths: string[];
};

export const TUITION_ROWS = [
  { key: "okulOncesi", label: "Okul Oncesi" },
  { key: "ilkokulYerel", label: "Ilkokul-YEREL" },
  { key: "ilkokulInt", label: "Ilkokul-INT." },
  { key: "ortaokulYerel", label: "Ortaokul-YEREL" },
  { key: "ortaokulInt", label: "Ortaokul-INT." },
  { key: "liseYerel", label: "Lise-YEREL" },
  { key: "liseInt", label: "Lise-INT." },
] as const;

export const NON_ED_ROWS = [
  { key: "yemek", label: "Yemek" },
  { key: "uniforma", label: "Uniforma" },
  { key: "kitap", label: "Kitap" },
  { key: "ulasim", label: "Ulasim" },
] as const;

export const DORM_ROWS = [
  { key: "yurt", label: "Yurt Gelirleri" },
  { key: "yazOkulu", label: "Yaz Okulu Dersleri Gelirleri" },
] as const;

export const OTHER_INCOME_ROWS = [
  { key: "gayrimenkulKira", label: "Gayrimenkul Kira Gelirleri ve Diger Gelirler" },
  { key: "isletmeGelirleri", label: "Isletme Gelirleri" },
  { key: "tesisKira", label: "Bina ve Tesis Kira Gelirleri" },
  { key: "egitimDisiHizmet", label: "Egitim Disi Hizmet Gelirleri" },
  { key: "yazOkuluOrganizasyon", label: "Yaz Okulu, Organizasyon ve Kurs Gelirleri" },
  { key: "kayitUcreti", label: "Kayit Ucreti" },
  { key: "bagislar", label: "Bagislar" },
  { key: "stkKamu", label: "STK/Kamu Subvansiyonlari" },
  { key: "faizPromosyon", label: "Faiz, Promosyon ve Komisyon Gelirleri" },
] as const;

export const GELIRLER_SECTION_LABELS: Record<GelirlerSectionKey, string> = {
  tuition: "Egitim Faaliyet Gelirleri",
  nonEducationFees: "Ogrenim Disi Ucretler",
  dormitory: "Yurt / Konaklama",
  otherInstitutionIncome: "Diger Kurum Gelirleri",
};

const SECTION_SAVE_FIELDS: Record<GelirlerSectionKey, readonly string[]> = {
  tuition: ["key", "studentCount", "unitFee"],
  nonEducationFees: ["key", "studentCount", "studentCountY2", "studentCountY3", "unitFee"],
  dormitory: ["key", "studentCount", "studentCountY2", "studentCountY3", "unitFee"],
  otherInstitutionIncome: ["key", "amount"],
};

const KADEME_DEFS = [
  { key: "okulOncesi", defaultFrom: "KG", defaultTo: "KG" },
  { key: "ilkokul", defaultFrom: "1", defaultTo: "5" },
  { key: "ortaokul", defaultFrom: "6", defaultTo: "9" },
  { key: "lise", defaultFrom: "10", defaultTo: "12" },
] as const;

const GRADE_ORDER = ["KG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeGrade(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "K" ? "KG" : raw;
}

function gradeIndex(value: unknown) {
  return GRADE_ORDER.indexOf(normalizeGrade(value));
}

export function normalizeGelirlerKademeConfig(config: unknown) {
  const source = asObject(config);
  return KADEME_DEFS.reduce<Record<string, { enabled: boolean; from: string; to: string }>>((acc, def) => {
    const row = asObject(source[def.key]);
    const from = GRADE_ORDER.includes(normalizeGrade(row.from)) ? normalizeGrade(row.from) : def.defaultFrom;
    const to = GRADE_ORDER.includes(normalizeGrade(row.to)) ? normalizeGrade(row.to) : def.defaultTo;
    const fromIdx = gradeIndex(from);
    const toIdx = gradeIndex(to);
    acc[def.key] = {
      enabled: row.enabled !== false,
      from: fromIdx <= toIdx ? from : to,
      to: fromIdx <= toIdx ? to : from,
    };
    return acc;
  }, {});
}

function gradeInKademe(grade: unknown, row: { enabled: boolean; from: string; to: string }) {
  if (!row.enabled) return false;
  const idx = gradeIndex(grade);
  const fromIdx = gradeIndex(row.from);
  const toIdx = gradeIndex(row.to);
  if (idx < 0 || fromIdx < 0 || toIdx < 0) return false;
  return fromIdx <= idx && idx <= toIdx;
}

export function computeIncomeStudentsFromGrades(grades: unknown, kademeConfig: unknown) {
  const rows = Array.isArray(grades) ? grades : [];
  const config = normalizeGelirlerKademeConfig(kademeConfig);
  const out = { kg: 0, ilkokul: 0, ortaokul: 0, lise: 0, total: 0 };

  rows.forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const students = num(row.studentsPerBranch);
    if (!students) return;
    out.total += students;
    const def = KADEME_DEFS.find((item) => gradeInKademe(row.grade, config[item.key]));
    if (def?.key === "okulOncesi") out.kg += students;
    else if (def?.key === "ilkokul") out.ilkokul += students;
    else if (def?.key === "ortaokul") out.ortaokul += students;
    else if (def?.key === "lise") out.lise += students;
  });

  return out;
}

function defaultGelirler(): GelirlerObject {
  return {
    tuition: {
      rows: TUITION_ROWS.map((row) => ({ key: row.key, label: row.label, studentCount: 0, unitFee: 0 })),
    },
    nonEducationFees: {
      rows: NON_ED_ROWS.map((row) => ({
        key: row.key,
        label: row.label,
        studentCount: 0,
        studentCountY2: 0,
        studentCountY3: 0,
        unitFee: 0,
      })),
    },
    dormitory: {
      rows: DORM_ROWS.map((row) => ({
        key: row.key,
        label: row.label,
        studentCount: 0,
        studentCountY2: 0,
        studentCountY3: 0,
        unitFee: 0,
      })),
    },
    otherInstitutionIncome: {
      rows: OTHER_INCOME_ROWS.map((row) => ({ key: row.key, label: row.label, amount: 0 })),
    },
    governmentIncentives: 0,
  };
}

function normalizeRows(baseRows: readonly GelirlerRow[], savedRows: unknown): GelirlerRow[] {
  const saved = Array.isArray(savedRows) ? savedRows.map((row) => asObject(row)) : [];
  const byKey = new Map(saved.map((row) => [String(row.key || ""), row]));

  const merged = baseRows.map((base) => {
    const savedRow = byKey.get(base.key);
    return savedRow
      ? { ...base, ...savedRow, key: base.key, label: base.label } as GelirlerRow
      : { ...base } as GelirlerRow;
  });

  const baseKeys = new Set(baseRows.map((row) => row.key));
  const extras = saved
    .filter((row) => !baseKeys.has(String(row.key || "")))
    .map((row, index) => ({
      key: String(row.key || `extra_${index}`),
      ...row,
    })) as GelirlerRow[];

  return [...merged, ...extras];
}

function withManualYearCounts(rows: GelirlerRow[]) {
  return rows.map((row) => {
    const y1 = num(row.studentCount);
    return {
      ...row,
      studentCount: y1,
      studentCountY2: row.studentCountY2 == null ? y1 : num(row.studentCountY2),
      studentCountY3: row.studentCountY3 == null ? y1 : num(row.studentCountY3),
    };
  });
}

export function normalizeGelirlerDraft(
  saved: unknown,
  grades: unknown,
  kademeConfig: unknown,
): GelirlerObject {
  const base = defaultGelirler();
  const g = asObject(saved);
  const isLegacy =
    !g.tuition &&
    (g.tuitionFeePerStudentYearly != null ||
      g.lunchFeePerStudentYearly != null ||
      g.dormitoryFeePerStudentYearly != null ||
      g.otherFeePerStudentYearly != null);

  const suggested = computeIncomeStudentsFromGrades(grades, kademeConfig);
  const next: GelirlerObject = {
    ...base,
    ...g,
    tuition: {
      ...asObject(base.tuition),
      ...asObject(g.tuition),
      rows: normalizeRows(base.tuition?.rows || [], asObject(g.tuition).rows),
    },
    nonEducationFees: {
      ...asObject(base.nonEducationFees),
      ...asObject(g.nonEducationFees),
      rows: normalizeRows(base.nonEducationFees?.rows || [], asObject(g.nonEducationFees).rows),
    },
    dormitory: {
      ...asObject(base.dormitory),
      ...asObject(g.dormitory),
      rows: normalizeRows(base.dormitory?.rows || [], asObject(g.dormitory).rows),
    },
    otherInstitutionIncome: {
      ...asObject(base.otherInstitutionIncome),
      ...asObject(g.otherInstitutionIncome),
      rows: normalizeRows(base.otherInstitutionIncome?.rows || [], asObject(g.otherInstitutionIncome).rows),
    },
    governmentIncentives: g.governmentIncentives == null ? 0 : num(g.governmentIncentives),
  };

  next.nonEducationFees = {
    ...next.nonEducationFees,
    rows: withManualYearCounts(Array.isArray(next.nonEducationFees?.rows) ? next.nonEducationFees.rows : []),
  };
  next.dormitory = {
    ...next.dormitory,
    rows: withManualYearCounts(Array.isArray(next.dormitory?.rows) ? next.dormitory.rows : []),
  };

  if (isLegacy) {
    const tuitionFee = num(g.tuitionFeePerStudentYearly);
    const lunchFee = num(g.lunchFeePerStudentYearly);
    const dormFee = num(g.dormitoryFeePerStudentYearly);

    next.tuition = {
      ...next.tuition,
      rows: (next.tuition?.rows || []).map((row) => ({ ...row, unitFee: row.unitFee ? num(row.unitFee) : tuitionFee })),
    };
    next.nonEducationFees = {
      ...next.nonEducationFees,
      rows: (next.nonEducationFees?.rows || []).map((row) =>
        row.key === "yemek" && !row.unitFee ? { ...row, unitFee: lunchFee } : row,
      ),
    };
    next.dormitory = {
      ...next.dormitory,
      rows: (next.dormitory?.rows || []).map((row) =>
        row.key === "yurt" && !row.unitFee ? { ...row, unitFee: dormFee } : row,
      ),
    };

    const hasTuitionStudents = (next.tuition?.rows || []).some((row) => num(row.studentCount) > 0);
    if (!hasTuitionStudents) {
      next.tuition = {
        ...next.tuition,
        rows: (next.tuition?.rows || []).map((row) => {
          let studentCount = 0;
          if (row.key === "okulOncesi") studentCount = suggested.kg;
          else if (row.key === "ilkokulYerel") studentCount = suggested.ilkokul;
          else if (row.key === "ortaokulYerel") studentCount = suggested.ortaokul;
          else if (row.key === "liseYerel") studentCount = suggested.lise;
          return { ...row, studentCount };
        }),
      };
    }
  }

  return clone(next);
}

function draftValue(draft: GelirlerDraft, path: string) {
  return getAtPath({ gelirler: draft.gelirler }, path);
}

function sectionRows(draft: GelirlerDraft, section: GelirlerSectionKey) {
  const rows = getAtPath(draft.gelirler, [section, "rows"]);
  return Array.isArray(rows) ? rows.map((row) => asObject(row)) : [];
}

function numericFieldValue(value: unknown) {
  return Math.max(0, num(value));
}

function pushSectionLeafPatches(
  patchesByPath: Map<string, InputPatch>,
  draft: GelirlerDraft,
  section: GelirlerSectionKey,
) {
  const rows = sectionRows(draft, section);
  const fields = SECTION_SAVE_FIELDS[section];

  rows.forEach((row, index) => {
    fields.forEach((field) => {
      const path = `gelirler.${section}.rows.${index}.${field}`;
      const raw = field === "key" ? String(row.key || "") : numericFieldValue(row[field]);
      patchesByPath.set(path, { path, value: raw });
    });
  });
}

export const gelirlerSaveAdapter: ScenarioModuleSaveAdapter<GelirlerDraft> = {
  moduleId: "gelirler.unit_fee",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.gelirler],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter((path) => {
      if (path === "gelirler.governmentIncentives") return false;
      if (/^gelirler\.tuition\.rows\.\d+\.unitFee$/.test(path)) return false;
      if (/^gelirler\.(nonEducationFees|dormitory)\.rows\.\d+\.(studentCount|studentCountY2|studentCountY3|unitFee)$/.test(path)) return false;
      if (/^gelirler\.otherInstitutionIncome\.rows\.\d+\.amount$/.test(path)) return false;
      return true;
    });
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Gelirler path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] => {
    const patchesByPath = new Map<string, InputPatch>();
    const touchedSections = new Set<GelirlerSectionKey>();

    unique(draft.dirtyPaths).forEach((path) => {
      if (path === "gelirler.governmentIncentives") {
        patchesByPath.set(path, {
          path,
          value: numericFieldValue(draftValue(draft, path)),
        });
        return;
      }

      const match = /^gelirler\.(tuition|nonEducationFees|dormitory|otherInstitutionIncome)\.rows\.\d+\.[^.]+$/.exec(path);
      if (match) touchedSections.add(match[1] as GelirlerSectionKey);
    });

    touchedSections.forEach((section) => pushSectionLeafPatches(patchesByPath, draft, section));

    return Array.from(patchesByPath.values());
  },
};
