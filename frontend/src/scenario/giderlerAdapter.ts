import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export const GIDERLER_YEAR_KEYS = ["y1", "y2", "y3"] as const;
export type GiderlerYearKey = (typeof GIDERLER_YEAR_KEYS)[number];

export type ExpenseItemDef = {
  key: string;
  no: number;
  code: number;
  label: string;
};

export type ExpenseRow = {
  studentCount?: number;
  unitCost?: number;
  unitCostY2?: number;
  unitCostY3?: number;
  [key: string]: unknown;
};

export type GiderlerObject = Record<string, unknown> & {
  isletme?: { items?: Record<string, unknown> };
  ogrenimDisi?: { items?: Record<string, ExpenseRow> };
  yurt?: { items?: Record<string, ExpenseRow> };
};

export type GiderlerDraft = {
  giderler: GiderlerObject;
  dirtyPaths: string[];
};

export const IK_AUTO_KEYS = new Set([
  "turkPersonelMaas",
  "turkDestekPersonelMaas",
  "yerelPersonelMaas",
  "yerelDestekPersonelMaas",
  "internationalPersonelMaas",
]);

export const OPERATING_ITEMS: ExpenseItemDef[] = [
  { key: "ulkeTemsilciligi", no: 1, code: 632, label: "Ulke Temsilciligi Giderleri" },
  { key: "genelYonetim", no: 2, code: 632, label: "Genel Yonetim Giderleri" },
  { key: "kira", no: 3, code: 622, label: "Isletme Giderleri - Kira" },
  { key: "emsalKira", no: 4, code: 622, label: "Isletme Giderleri - Emsal Kira" },
  { key: "enerjiKantin", no: 5, code: 622, label: "Enerji, Kantin ve Iletisim" },
  { key: "turkPersonelMaas", no: 6, code: 622, label: "Turk Personel Maas Giderleri" },
  { key: "turkDestekPersonelMaas", no: 7, code: 622, label: "Turk Destek Personel Maas Giderleri" },
  { key: "yerelPersonelMaas", no: 8, code: 622, label: "Yerel Personel Maas Giderleri" },
  { key: "yerelDestekPersonelMaas", no: 9, code: 622, label: "Yerel Destek Personel Maas Giderleri" },
  { key: "internationalPersonelMaas", no: 10, code: 622, label: "International Personel Maas Giderleri" },
  { key: "disaridanHizmet", no: 11, code: 632, label: "Disaridan Saglanan Hizmetler" },
  { key: "egitimAracGerec", no: 12, code: 622, label: "Egitim Arac ve Gerecleri" },
  { key: "finansalGiderler", no: 13, code: 632, label: "Finansal Giderler" },
  { key: "egitimAmacliHizmet", no: 14, code: 622, label: "Egitim Amacli Hizmet Alimlari" },
  { key: "temsilAgirlama", no: 16, code: 632, label: "Temsil ve Agirlama" },
  { key: "ulkeIciUlasim", no: 17, code: 622, label: "Ulke Ici Ulasim ve Konaklama" },
  { key: "ulkeDisiUlasim", no: 18, code: 632, label: "Ulke Disi Ulasim ve Konaklama" },
  { key: "vergilerResmiIslemler", no: 21, code: 632, label: "Vergiler ve Resmi Islemler" },
  { key: "vergiler", no: 22, code: 632, label: "Vergiler" },
  { key: "demirbasYatirim", no: 23, code: 622, label: "Demirbas ve Yatirim Alimlari" },
  { key: "rutinBakim", no: 24, code: 622, label: "Rutin Bakim ve Onarim" },
  { key: "pazarlamaOrganizasyon", no: 25, code: 631, label: "Pazarlama ve Organizasyon" },
  { key: "reklamTanitim", no: 26, code: 631, label: "Reklam ve Tanitim" },
  { key: "tahsilEdilemeyenGelirler", no: 29, code: 622, label: "Tahsil Edilemeyen Gelirler" },
];

export const SERVICE_ITEMS: ExpenseItemDef[] = [
  { key: "yemek", no: 27, code: 622, label: "Yemek" },
  { key: "uniforma", no: 28, code: 621, label: "Uniforma" },
  { key: "kitapKirtasiye", no: 29, code: 621, label: "Kitap-Kirtasiye" },
  { key: "ulasimServis", no: 30, code: 622, label: "Ulasim Servis" },
];

export const DORM_ITEMS: ExpenseItemDef[] = [
  { key: "yurtGiderleri", no: 31, code: 622, label: "Yurt Giderleri" },
  { key: "digerYurt", no: 32, code: 622, label: "Diger Yurt / Yaz Okulu" },
];

export const SERVICE_TO_INCOME_KEY: Record<string, string> = {
  yemek: "yemek",
  uniforma: "uniforma",
  kitapKirtasiye: "kitap",
  ulasimServis: "ulasim",
};

export const DORM_TO_INCOME_KEY: Record<string, string> = {
  yurtGiderleri: "yurt",
  digerYurt: "yazOkulu",
};

const SERVICE_FIELDS = ["studentCount", "unitCost"] as const;
const DORM_FIELDS = ["studentCount", "unitCost"] as const;

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

function deepMerge<T extends Record<string, unknown>>(target: T, source: unknown): T {
  const base = { ...(target || {}) } as Record<string, unknown>;
  const src = asObject(source);

  Object.entries(src).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      base[key] = deepMerge(asObject(base[key]), value);
    } else {
      base[key] = value;
    }
  });

  return base as T;
}

function defaultGiderler(): GiderlerObject {
  return {
    isletme: {
      items: OPERATING_ITEMS.reduce<Record<string, number>>((acc, item) => {
        acc[item.key] = 0;
        return acc;
      }, {}),
    },
    ogrenimDisi: {
      items: SERVICE_ITEMS.reduce<Record<string, ExpenseRow>>((acc, item) => {
        acc[item.key] = { studentCount: 0, unitCost: 0 };
        return acc;
      }, {}),
    },
    yurt: {
      items: DORM_ITEMS.reduce<Record<string, ExpenseRow>>((acc, item) => {
        acc[item.key] = { studentCount: 0, unitCost: 0 };
        return acc;
      }, {}),
    },
  };
}

export function normalizeGiderlerDraft(value: unknown): GiderlerObject {
  return clone(deepMerge(defaultGiderler(), value));
}

function draftValue(draft: GiderlerDraft, path: string) {
  return getAtPath({ giderler: draft.giderler }, path);
}

function numericValue(value: unknown) {
  return Math.max(0, num(value));
}

function pushNumericPatch(patchesByPath: Map<string, InputPatch>, draft: GiderlerDraft, path: string) {
  patchesByPath.set(path, {
    path,
    value: numericValue(draftValue(draft, path)),
  });
}

function pushOperatingLeafPatches(patchesByPath: Map<string, InputPatch>, draft: GiderlerDraft) {
  OPERATING_ITEMS.forEach((item) => {
    if (IK_AUTO_KEYS.has(item.key)) return;
    pushNumericPatch(patchesByPath, draft, `giderler.isletme.items.${item.key}`);
  });
}

function rowsByKey(rows: unknown) {
  const list = Array.isArray(rows) ? rows : [];
  return new Map(list.map((row) => [String(asObject(row).key || ""), asObject(row)]));
}

function derivedIncomeStudentCount(inputs: Inputs, section: "nonEducationFees" | "dormitory", key: string) {
  const rows = rowsByKey(getAtPath(inputs, ["gelirler", section, "rows"]));
  const row = rows.get(key);
  return numericValue(row?.studentCount);
}

function pushServiceLeafPatches(patchesByPath: Map<string, InputPatch>, draft: GiderlerDraft, currentInputs: Inputs) {
  SERVICE_ITEMS.forEach((item) => {
    SERVICE_FIELDS.forEach((field) => {
      const path = `giderler.ogrenimDisi.items.${item.key}.${field}`;
      if (field === "studentCount") {
        patchesByPath.set(path, {
          path,
          value: derivedIncomeStudentCount(currentInputs, "nonEducationFees", SERVICE_TO_INCOME_KEY[item.key]),
        });
      } else {
        pushNumericPatch(patchesByPath, draft, path);
      }
    });
  });
}

function pushDormLeafPatches(patchesByPath: Map<string, InputPatch>, draft: GiderlerDraft, currentInputs: Inputs) {
  DORM_ITEMS.forEach((item) => {
    DORM_FIELDS.forEach((field) => {
      const path = `giderler.yurt.items.${item.key}.${field}`;
      if (field === "studentCount") {
        patchesByPath.set(path, {
          path,
          value: derivedIncomeStudentCount(currentInputs, "dormitory", DORM_TO_INCOME_KEY[item.key]),
        });
      } else {
        pushNumericPatch(patchesByPath, draft, path);
      }
    });
  });
}

export const giderlerSaveAdapter: ScenarioModuleSaveAdapter<GiderlerDraft> = {
  moduleId: "giderler.isletme",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.giderler],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter((path) => {
      const operatingMatch = /^giderler\.isletme\.items\.([^.]+)$/.exec(path);
      if (operatingMatch) return IK_AUTO_KEYS.has(operatingMatch[1]);
      if (/^giderler\.ogrenimDisi\.items\.[^.]+\.(unitCost|studentCount)$/.test(path)) return false;
      if (/^giderler\.yurt\.items\.[^.]+\.(unitCost|studentCount)$/.test(path)) return false;
      return true;
    });
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Giderler path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, currentInputs: Inputs): InputPatch[] => {
    const patchesByPath = new Map<string, InputPatch>();
    let touchedOperating = false;
    let touchedService = false;
    let touchedDorm = false;

    unique(draft.dirtyPaths).forEach((path) => {
      if (/^giderler\.isletme\.items\.[^.]+$/.test(path)) {
        touchedOperating = true;
        return;
      }
      if (/^giderler\.ogrenimDisi\.items\.[^.]+\.(unitCost|studentCount)$/.test(path)) {
        touchedService = true;
        return;
      }
      if (/^giderler\.yurt\.items\.[^.]+\.(unitCost|studentCount)$/.test(path)) {
        touchedDorm = true;
      }
    });

    if (touchedOperating) pushOperatingLeafPatches(patchesByPath, draft);
    if (touchedService) pushServiceLeafPatches(patchesByPath, draft, currentInputs);
    if (touchedDorm) pushDormLeafPatches(patchesByPath, draft, currentInputs);

    return Array.from(patchesByPath.values());
  },
};
