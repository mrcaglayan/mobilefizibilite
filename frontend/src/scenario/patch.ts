import { Inputs } from "@/src/api/client";

export type PathToken = string | number;
export type PathLike = string | readonly PathToken[];

export type InputPatch = {
  path: PathLike;
  value: unknown;
};

type Dict = Record<string, unknown>;

function isPlainObject(value: unknown): value is Dict {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function tokenFromString(raw: string): PathToken {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function parsePath(path: PathLike): PathToken[] {
  if (Array.isArray(path)) return [...path];
  return String(path)
    .split(".")
    .map(tokenFromString)
    .filter((token) => token !== "");
}

export function toInputPath(path: PathLike): PathToken[] {
  const tokens = parsePath(path);
  return tokens[0] === "inputs" ? tokens.slice(1) : tokens;
}

export function toDirtyInputPath(path: PathLike): string {
  const tokens = toInputPath(path);
  return ["inputs", ...tokens].join(".");
}

export function getAtPath(source: unknown, path: PathLike): unknown {
  return parsePath(path).reduce<unknown>((current, token) => {
    if (current == null) return undefined;
    return (current as Record<string, unknown>)[String(token)];
  }, source);
}

function emptyContainerFor(nextToken: PathToken | undefined) {
  return typeof nextToken === "number" ? [] : {};
}

function cloneContainer(value: unknown, nextToken: PathToken | undefined) {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return emptyContainerFor(nextToken);
}

export function setAtPath<T>(source: T, path: PathLike, value: unknown): T {
  const tokens = parsePath(path);
  if (!tokens.length) return value as T;

  const root = cloneContainer(source, tokens[0]);
  let cursor = root as Record<string, unknown>;

  tokens.forEach((token, index) => {
    const key = String(token);
    const nextToken = tokens[index + 1];
    if (index === tokens.length - 1) {
      cursor[key] = value;
      return;
    }
    const nextValue = cursor[key];
    const nextContainer = cloneContainer(nextValue, nextToken);
    cursor[key] = nextContainer;
    cursor = nextContainer as Record<string, unknown>;
  });

  return root as T;
}

export function unsetAtPath<T>(source: T, path: PathLike): T {
  const tokens = parsePath(path);
  if (!tokens.length) return source;
  const root = cloneContainer(source, tokens[0]);
  let cursor = root as Record<string, unknown>;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const key = String(tokens[index]);
    const next = cursor[key];
    if (next == null) return root as T;
    const cloned = cloneContainer(next, tokens[index + 1]);
    cursor[key] = cloned;
    cursor = cloned as Record<string, unknown>;
  }

  const finalKey = String(tokens[tokens.length - 1]);
  if (Array.isArray(cursor)) {
    cursor.splice(Number(finalKey), 1);
  } else {
    delete cursor[finalKey];
  }
  return root as T;
}

export function applyInputPatches(inputs: Inputs, patches: readonly InputPatch[]): Inputs {
  return patches.reduce<Inputs>((nextInputs, patch) => {
    return setAtPath(nextInputs, toInputPath(patch.path), patch.value);
  }, inputs);
}

export function deepMergePreservingUnknown<T>(current: T, knownPatch: unknown): T {
  if (Array.isArray(knownPatch)) return knownPatch as T;
  if (!isPlainObject(knownPatch)) return knownPatch as T;

  const base = isPlainObject(current) ? current : {};
  const merged: Dict = { ...base };
  Object.entries(knownPatch).forEach(([key, value]) => {
    merged[key] = deepMergePreservingUnknown(merged[key], value);
  });
  return merged as T;
}

export function preserveUnknownInputFields(currentInputs: Inputs, knownPatch: Partial<Inputs>): Inputs {
  return deepMergePreservingUnknown(currentInputs, knownPatch);
}
