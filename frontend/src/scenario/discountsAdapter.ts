import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export const DISCOUNT_YEAR_KEYS = ["y1", "y2", "y3"] as const;
export type DiscountYearKey = (typeof DISCOUNT_YEAR_KEYS)[number];

export type DiscountRow = {
  name: string;
  mode?: string;
  value?: number;
  ratio?: number;
  studentCount?: number;
  valueY2?: number;
  ratioY2?: number;
  studentCountY2?: number;
  valueY3?: number;
  ratioY3?: number;
  studentCountY3?: number;
  kind?: string;
  maxAmount?: number;
  [key: string]: unknown;
};

export type DiscountsDraft = {
  discounts: DiscountRow[];
  dirtyPaths: string[];
};

export const DISCOUNT_DEFAULTS = [
  { name: "MAGİS BAŞARI BURSU" },
  { name: "MAARİF YETENEK BURSU" },
  { name: "İHTİYAÇ BURSU" },
  { name: "OKUL BAŞARI BURSU" },
  { name: "TAM EĞİTİM BURSU" },
  { name: "BARINMA BURSU" },
  { name: "TÜRKÇE BAŞARI BURSU" },
  { name: "VAKFIN ULUSLARARASI YÜKÜMLÜLÜKLERİNDEN KAYNAKLI İNDİRİM" },
  { name: "VAKIF ÇALIŞANI İNDİRİMİ" },
  { name: "KARDEŞ İNDİRİMİ" },
  { name: "ERKEN KAYIT İNDİRİMİ" },
  { name: "PEŞİN ÖDEME İNDİRİMİ" },
  { name: "KADEME GEÇİŞ İNDİRİMİ" },
  { name: "TEMSİL İNDİRİMİ" },
  { name: "KURUM İNDİRİMİ" },
  { name: "İSTİSNAİ İNDİRİM" },
  { name: "YEREL MEVZUATIN ŞART KOŞTUĞU İNDİRİM" },
] as const;

const BASE_FIELDS = ["name", "mode", "value", "ratio"] as const;
const OPTIONAL_FIELDS = [
  "studentCount",
  "valueY2",
  "ratioY2",
  "studentCountY2",
  "valueY3",
  "ratioY3",
  "studentCountY3",
  "kind",
  "maxAmount",
] as const;
const SAVE_FIELDS = [...BASE_FIELDS, ...OPTIONAL_FIELDS] as const;
type SaveField = (typeof SAVE_FIELDS)[number];

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

function normalizeMode(value: unknown) {
  return String(value || "percent") === "fixed" ? "fixed" : "percent";
}

function normalizeName(value: unknown, fallback: string) {
  const name = String(value || "").trim();
  return name || fallback;
}

function normalizeDiscountRow(row: unknown, fallbackName: string): DiscountRow {
  const source = asObject(row);
  return {
    ...source,
    name: normalizeName(source.name, fallbackName),
    mode: normalizeMode(source.mode),
    value: num(source.value),
    ratio: num(source.ratio),
  };
}

export function normalizeDiscountsDraft(value: unknown): DiscountRow[] {
  const source = Array.isArray(value) ? value : [];
  const rows = source.map((row, index) => normalizeDiscountRow(row, `Indirim #${index + 1}`));
  const existingNames = new Set(rows.map((row) => String(row.name || "").trim()));

  DISCOUNT_DEFAULTS.forEach((def) => {
    if (existingNames.has(def.name)) return;
    rows.push({
      name: def.name,
      mode: "percent",
      value: 0,
      ratio: 0,
    });
  });

  return clone(rows);
}

function draftValue(draft: DiscountsDraft, path: string) {
  return getAtPath({ discounts: draft.discounts }, path);
}

function isStringField(field: SaveField) {
  return field === "name" || field === "mode" || field === "kind";
}

function shouldPatchField(row: DiscountRow, field: SaveField) {
  if (BASE_FIELDS.includes(field as (typeof BASE_FIELDS)[number])) return true;
  const value = row[field];
  return value != null && value !== "";
}

function cleanFieldValue(row: DiscountRow, field: SaveField) {
  const value = row[field];
  if (field === "name") return normalizeName(value, "Indirim");
  if (field === "mode") return normalizeMode(value);
  if (isStringField(field)) return String(value || "");
  return Math.max(0, num(value));
}

function pushAllDiscountLeafPatches(patchesByPath: Map<string, InputPatch>, draft: DiscountsDraft) {
  draft.discounts.forEach((row, index) => {
    SAVE_FIELDS.forEach((field) => {
      if (!shouldPatchField(row, field)) return;
      const path = `discounts.${index}.${field}`;
      patchesByPath.set(path, {
        path,
        value: cleanFieldValue(row, field),
      });
    });
  });
}

export const discountsSaveAdapter: ScenarioModuleSaveAdapter<DiscountsDraft> = {
  moduleId: "discounts.discounts",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.discounts],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter((path) => {
      if (/^discounts\.\d+\.(name|mode|value|ratio|studentCount|valueY2|ratioY2|studentCountY2|valueY3|ratioY3|studentCountY3|kind|maxAmount)$/.test(path)) {
        return false;
      }
      return true;
    });
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Discounts path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] => {
    const paths = unique(draft.dirtyPaths);
    const patchesByPath = new Map<string, InputPatch>();

    paths.forEach((path) => {
      patchesByPath.set(path, {
        path,
        value: draftValue(draft, path),
      });
    });

    if (paths.length) {
      pushAllDiscountLeafPatches(patchesByPath, draft);
    }

    return Array.from(patchesByPath.values());
  },
};
