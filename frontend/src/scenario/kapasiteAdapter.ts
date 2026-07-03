import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export type KapasiteDraft = {
  kapasite: Record<string, unknown>;
  dirtyPaths: string[];
};

const CAPACITY_PERIODS = ["cur", "y1", "y2", "y3"] as const;

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function draftValue(draft: KapasiteDraft, path: string) {
  return getAtPath({ kapasite: draft.kapasite }, path);
}

function getCapacityDraftValue(draft: KapasiteDraft, kademeKey: string, period: (typeof CAPACITY_PERIODS)[number]) {
  const modernValue = draftValue(draft, `kapasite.byKademe.${kademeKey}.caps.${period}`);
  if (modernValue != null) return modernValue;

  const legacyValue = draftValue(draft, `kapasite.byKademe.${kademeKey}.${period}`);
  return legacyValue == null ? 0 : legacyValue;
}

export const kapasiteSaveAdapter: ScenarioModuleSaveAdapter<KapasiteDraft> = {
  moduleId: "kapasite",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.kapasite],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter(
      (path) => path !== "kapasite" && !path.startsWith("kapasite."),
    );
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Kapasite path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] => {
    const paths = unique(draft.dirtyPaths);
    const patchesByPath = new Map<string, InputPatch>();
    const touchedKademes = new Set<string>();

    paths.forEach((path) => {
      patchesByPath.set(path, {
        path,
        value: draftValue(draft, path),
      });

      const match = path.match(/^kapasite\.byKademe\.([^.]+)\.caps\.(cur|y1|y2|y3)$/);
      if (match) touchedKademes.add(match[1]);
    });

    touchedKademes.forEach((kademeKey) => {
      CAPACITY_PERIODS.forEach((period) => {
        const path = `kapasite.byKademe.${kademeKey}.caps.${period}`;
        patchesByPath.set(path, {
          path,
          value: getCapacityDraftValue(draft, kademeKey, period),
        });
      });
    });

    return Array.from(patchesByPath.values());
  },
};
