import { api, Id, Inputs } from "@/src/api/client";
import { applyInputPatches, InputPatch, PathLike, toDirtyInputPath, toInputPath } from "@/src/scenario/patch";
import { buildModifiedResourcesFromPaths } from "@/src/scenario/workflow";

export type ModuleValidationResult = {
  ok: boolean;
  errors?: string[];
};

export type ScenarioModuleSaveAdapter<TDraft> = {
  moduleId: string;
  enabled: boolean;
  allowedPathPrefixes: string[];
  allowWholeCollectionReplace?: boolean;
  toInputPatches: (draft: TDraft, currentInputs: Inputs) => InputPatch[];
  validate?: (draft: TDraft, currentInputs: Inputs) => ModuleValidationResult;
};

export type ScenarioModuleSavePayload = {
  inputs: Inputs;
  modifiedPaths: string[];
  modifiedResources: string[];
};

export const MODULE_ALLOWED_PATH_PREFIXES = {
  temel_bilgiler: ["temelBilgiler"],
  kapasite: ["kapasite"],
  norm: ["gradesYears", "gradesCurrent", "norm"],
  ik: ["ik"],
  gelirler: ["gelirler"],
  discounts: ["discounts"],
  giderler: ["giderler"],
} as const;

export class ModuleSaveError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const DANGEROUS_COLLECTION_KEYS = new Set([
  "rows",
  "items",
  "years",
  "gradesYears",
  "gradesCurrent",
]);

function normalizeInputPath(path: PathLike) {
  return toInputPath(path).map(String).join(".");
}

function normalizeAllowedPrefixes(prefixes: string[]) {
  return prefixes.map(normalizeInputPath).filter(Boolean);
}

function pathIsAllowed(inputPath: string, allowedPathPrefixes: string[]) {
  return allowedPathPrefixes.some((prefix) => inputPath === prefix || inputPath.startsWith(`${prefix}.`));
}

function isDangerousWholeCollectionPatch(inputPath: string) {
  const parts = inputPath.split(".").filter(Boolean);
  const last = parts[parts.length - 1];
  return DANGEROUS_COLLECTION_KEYS.has(last);
}

export function buildScenarioModuleSavePayload<TDraft>({
  adapter,
  draft,
  currentInputs,
}: {
  adapter: ScenarioModuleSaveAdapter<TDraft>;
  draft: TDraft;
  currentInputs: Inputs;
}): ScenarioModuleSavePayload {
  if (!adapter.enabled) {
    throw new ModuleSaveError(
      "MODULE_SAVE_DISABLED",
      `${adapter.moduleId} is not enabled for mobile saves yet.`,
    );
  }
  if (typeof adapter.toInputPatches !== "function") {
    throw new ModuleSaveError(
      "MISSING_INPUT_ADAPTER",
      `${adapter.moduleId} does not define a real input-shape adapter.`,
    );
  }
  const allowedPathPrefixes = normalizeAllowedPrefixes(adapter.allowedPathPrefixes || []);
  if (!allowedPathPrefixes.length) {
    throw new ModuleSaveError(
      "MISSING_ALLOWED_PATH_PREFIXES",
      `${adapter.moduleId} does not define allowed input path prefixes.`,
    );
  }

  const validation = adapter.validate?.(draft, currentInputs);
  if (validation && !validation.ok) {
    throw new ModuleSaveError(
      "MODULE_SAVE_INVALID",
      `${adapter.moduleId} draft is not valid for save.`,
      validation.errors || [],
    );
  }

  const patches = adapter.toInputPatches(draft, currentInputs);
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new ModuleSaveError(
      "NO_INPUT_PATCHES",
      `${adapter.moduleId} save produced no input patches.`,
    );
  }

  patches.forEach((patch) => {
    const inputPath = normalizeInputPath(patch.path);
    if (!inputPath || !pathIsAllowed(inputPath, allowedPathPrefixes)) {
      throw new ModuleSaveError(
        "PATCH_OUTSIDE_MODULE",
        `${adapter.moduleId} attempted to patch outside its allowed input paths.`,
        { path: inputPath, allowedPathPrefixes },
      );
    }
    if (!adapter.allowWholeCollectionReplace && isDangerousWholeCollectionPatch(inputPath)) {
      throw new ModuleSaveError(
        "WHOLE_COLLECTION_REPLACE_BLOCKED",
        `${adapter.moduleId} attempted to replace a collection path. Patch individual fields instead.`,
        { path: inputPath },
      );
    }
  });

  const modifiedPaths = unique(patches.map((patch) => toDirtyInputPath(patch.path)));
  const modifiedResources = unique(buildModifiedResourcesFromPaths(modifiedPaths));
  if (!modifiedResources.length) {
    throw new ModuleSaveError(
      "NO_MODIFIED_RESOURCES",
      `${adapter.moduleId} save produced no modifiedResources.`,
      { modifiedPaths },
    );
  }

  return {
    inputs: applyInputPatches(currentInputs, patches),
    modifiedPaths,
    modifiedResources,
  };
}

export async function saveScenarioModule<TDraft>({
  schoolId,
  scenarioId,
  adapter,
  draft,
  currentInputs,
}: {
  schoolId: Id;
  scenarioId: Id;
  adapter: ScenarioModuleSaveAdapter<TDraft>;
  draft: TDraft;
  currentInputs: Inputs;
}) {
  const payload = buildScenarioModuleSavePayload({ adapter, draft, currentInputs });
  const response = await api.saveScenarioInputs(schoolId, scenarioId, payload.inputs, {
    modifiedPaths: payload.modifiedPaths,
    modifiedResources: payload.modifiedResources,
  });
  return { ...payload, response };
}
