import { Inputs } from "@/src/api/client";
import { getAtPath, InputPatch } from "@/src/scenario/patch";
import {
  MODULE_ALLOWED_PATH_PREFIXES,
  ScenarioModuleSaveAdapter,
} from "@/src/scenario/saveHarness";

export type TemelBilgilerDraft = {
  temelBilgiler: Record<string, unknown>;
  dirtyPaths: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export const temelBilgilerSaveAdapter: ScenarioModuleSaveAdapter<TemelBilgilerDraft> = {
  moduleId: "temel_bilgiler",
  enabled: true,
  allowedPathPrefixes: [...MODULE_ALLOWED_PATH_PREFIXES.temel_bilgiler],
  validate: (draft) => {
    const invalidPaths = unique(draft.dirtyPaths).filter(
      (path) => path !== "temelBilgiler" && !path.startsWith("temelBilgiler."),
    );
    return invalidPaths.length
      ? { ok: false, errors: invalidPaths.map((path) => `Invalid Temel Bilgiler path: ${path}`) }
      : { ok: true };
  },
  toInputPatches: (draft, _currentInputs: Inputs): InputPatch[] =>
    unique(draft.dirtyPaths).map((path) => ({
      path,
      value: getAtPath({ temelBilgiler: draft.temelBilgiler }, path),
    })),
};
