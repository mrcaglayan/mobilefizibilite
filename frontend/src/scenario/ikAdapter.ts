import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export const IK_YEAR_KEYS = ["y1", "y2", "y3"] as const;
export type IkYearKey = (typeof IK_YEAR_KEYS)[number];

export type IkLevelDef = {
  key: string;
  baseLabel: string;
  kademeKey: string | null;
  suffix?: string;
};

export type IkRoleDef = {
  key: string;
  label: string;
};

export type IkRoleGroup = {
  groupKey: string;
  groupLabel: string;
  roles: IkRoleDef[];
};

export const IK_LEVEL_DEFS: IkLevelDef[] = [
  { key: "merkez", baseLabel: "MERKEZ / HQ", kademeKey: null },
  { key: "okulOncesi", baseLabel: "Okul Oncesi", kademeKey: "okulOncesi" },
  { key: "ilkokulYerel", baseLabel: "Ilkokul", kademeKey: "ilkokul", suffix: "-YEREL" },
  { key: "ilkokulInt", baseLabel: "Ilkokul", kademeKey: "ilkokul", suffix: "-INT." },
  { key: "ortaokulYerel", baseLabel: "Ortaokul", kademeKey: "ortaokul", suffix: "-YEREL" },
  { key: "ortaokulInt", baseLabel: "Ortaokul", kademeKey: "ortaokul", suffix: "-INT." },
  { key: "liseYerel", baseLabel: "Lise", kademeKey: "lise", suffix: "-YEREL" },
  { key: "liseInt", baseLabel: "Lise", kademeKey: "lise", suffix: "-INT." },
] as const satisfies IkLevelDef[];

export const IK_ROLE_GROUPS: IkRoleGroup[] = [
  {
    groupKey: "turk",
    groupLabel: "MERKEZ TARAFINDAN GOREVLENDIRILEN",
    roles: [
      { key: "turk_mudur", label: "Mudur" },
      { key: "turk_mdyard", label: "Md.Yrd." },
      { key: "turk_egitimci", label: "Egitimci" },
      { key: "turk_temsil", label: "Temsilcilik" },
    ],
  },
  {
    groupKey: "yerel",
    groupLabel: "YEREL KAYNAK",
    roles: [
      { key: "yerel_yonetici_egitimci", label: "Yonetici ve Egitimci" },
      { key: "yerel_destek", label: "Destek Per." },
      { key: "yerel_ulke_temsil_destek", label: "Ulke Temsil Destek" },
    ],
  },
  {
    groupKey: "international",
    groupLabel: "INTERNATIONAL",
    roles: [{ key: "int_yonetici_egitimci", label: "Yonetici ve Egitimci" }],
  },
] as const satisfies IkRoleGroup[];

export const IK_ALL_ROLES: IkRoleDef[] = IK_ROLE_GROUPS.flatMap((group) => group.roles);

export type IkDraft = {
  ik: Record<string, unknown>;
  dirtyPaths: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function draftValue(draft: IkDraft, path: string) {
  return getAtPath({ ik: draft.ik }, path);
}

function yearRoleKeys(draft: IkDraft, year: IkYearKey) {
  const keys = new Set(IK_ALL_ROLES.map((role) => role.key));
  const unitCosts = draftValue(draft, `ik.years.${year}.unitCosts`);
  if (unitCosts && typeof unitCosts === "object") {
    Object.keys(unitCosts).forEach((key) => keys.add(key));
  }
  const headcounts = draftValue(draft, `ik.years.${year}.headcountsByLevel`);
  if (headcounts && typeof headcounts === "object") {
    Object.values(headcounts).forEach((row) => {
      if (row && typeof row === "object") Object.keys(row).forEach((key) => keys.add(key));
    });
  }
  return Array.from(keys);
}

function yearLevelKeys(draft: IkDraft, year: IkYearKey) {
  const keys = new Set(IK_LEVEL_DEFS.map((level) => level.key));
  const headcounts = draftValue(draft, `ik.years.${year}.headcountsByLevel`);
  if (headcounts && typeof headcounts === "object") {
    Object.keys(headcounts).forEach((key) => keys.add(key));
  }
  return Array.from(keys);
}

function pushPatch(patchesByPath: Map<string, InputPatch>, draft: IkDraft, path: string) {
  patchesByPath.set(path, {
    path,
    value: draftValue(draft, path) ?? 0,
  });
}

function pushFullYearPatches(patchesByPath: Map<string, InputPatch>, draft: IkDraft, year: IkYearKey) {
  const roleKeys = yearRoleKeys(draft, year);
  const levelKeys = yearLevelKeys(draft, year);

  roleKeys.forEach((roleKey) => {
    pushPatch(patchesByPath, draft, `ik.years.${year}.unitCosts.${roleKey}`);
  });

  levelKeys.forEach((levelKey) => {
    roleKeys.forEach((roleKey) => {
      pushPatch(patchesByPath, draft, `ik.years.${year}.headcountsByLevel.${levelKey}.${roleKey}`);
    });
  });
}

function pushLegacyY1Patches(patchesByPath: Map<string, InputPatch>, draft: IkDraft) {
  const roleKeys = yearRoleKeys(draft, "y1");
  const levelKeys = yearLevelKeys(draft, "y1");

  roleKeys.forEach((roleKey) => {
    patchesByPath.set(`ik.unitCosts.${roleKey}`, {
      path: `ik.unitCosts.${roleKey}`,
      value: draftValue(draft, `ik.years.y1.unitCosts.${roleKey}`) ?? 0,
    });
  });

  levelKeys.forEach((levelKey) => {
    roleKeys.forEach((roleKey) => {
      patchesByPath.set(`ik.headcountsByLevel.${levelKey}.${roleKey}`, {
        path: `ik.headcountsByLevel.${levelKey}.${roleKey}`,
        value: draftValue(draft, `ik.years.y1.headcountsByLevel.${levelKey}.${roleKey}`) ?? 0,
      });
    });
  });
}

export const ikSaveAdapter: ScenarioModuleSaveAdapter<IkDraft> = {
  moduleId: "ik.local_staff",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.ik],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter((path) => {
      if (path === "ik.unitCostRatio") return false;
      if (/^ik\.years\.(y1|y2|y3)\.unitCosts\.[^.]+$/.test(path)) return false;
      if (/^ik\.years\.(y1|y2|y3)\.headcountsByLevel\.[^.]+\.[^.]+$/.test(path)) return false;
      return true;
    });
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid IK path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] => {
    const paths = unique(draft.dirtyPaths);
    const patchesByPath = new Map<string, InputPatch>();
    let touchedIk = false;

    paths.forEach((path) => {
      touchedIk = true;
      patchesByPath.set(path, {
        path,
        value: draftValue(draft, path),
      });
    });

    if (touchedIk) {
      patchesByPath.set("ik.unitCostRatio", {
        path: "ik.unitCostRatio",
        value: draftValue(draft, "ik.unitCostRatio") ?? 1,
      });
      IK_YEAR_KEYS.forEach((year) => pushFullYearPatches(patchesByPath, draft, year));
      pushLegacyY1Patches(patchesByPath, draft);
    }

    return Array.from(patchesByPath.values());
  },
};
