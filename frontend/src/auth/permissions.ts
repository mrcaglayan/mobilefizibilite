import { PermissionEntry, User } from "@/src/api/client";

export type PermissionScope = {
  countryId?: number | null;
  schoolId?: number | string | null;
};

export function matchResource(requested: string, candidate: string) {
  const req = String(requested || "").trim();
  const cand = String(candidate || "").trim();
  if (!req || !cand) return false;
  if (cand === req) return true;
  if (cand.endsWith(".*")) {
    const base = cand.slice(0, -2);
    return req === base || req.startsWith(`${base}.`);
  }
  return false;
}

export function can(
  user: User | null | undefined,
  resource: string,
  action: "read" | "write",
  scope: PermissionScope = {},
) {
  if (!user || typeof user !== "object") return false;
  if (String(user.role || "") === "admin") return true;

  const permissions: PermissionEntry[] = Array.isArray(user.permissions) ? user.permissions : [];
  const countryId = scope.countryId == null ? null : Number(scope.countryId);
  const schoolId = scope.schoolId == null ? null : Number(scope.schoolId);

  return permissions.some((permission) => {
    const permissionAction = String(permission?.action || "").toLowerCase();
    if (action === "read" && permissionAction !== "read" && permissionAction !== "write") return false;
    if (action === "write" && permissionAction !== "write") return false;
    if (!matchResource(resource, String(permission?.resource || ""))) return false;

    const permCountry = permission.scope_country_id == null ? null : Number(permission.scope_country_id);
    const permSchool = permission.scope_school_id == null ? null : Number(permission.scope_school_id);

    if (permCountry != null && countryId == null) return false;
    if (permCountry != null && Number(permCountry) !== Number(countryId)) return false;
    if (permSchool != null && schoolId == null) return false;
    if (permSchool != null && Number(permSchool) !== Number(schoolId)) return false;

    return true;
  });
}

export function canWriteAny(
  user: User | null | undefined,
  resources: string[],
  scope: PermissionScope = {},
) {
  return resources.some((resource) => can(user, resource, "write", scope));
}
