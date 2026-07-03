import { Inputs, User, WorkItem } from "@/src/api/client";
import { can, PermissionScope } from "@/src/auth/permissions";

export type WorkId =
  | "temel_bilgiler"
  | "kapasite"
  | "norm.ders_dagilimi"
  | "ik.local_staff"
  | "gelirler.unit_fee"
  | "giderler.isletme";

export const BASE_REQUIRED_WORK_IDS: WorkId[] = [
  "temel_bilgiler",
  "kapasite",
  "norm.ders_dagilimi",
  "ik.local_staff",
  "gelirler.unit_fee",
  "giderler.isletme",
];

export const HQ_REQUIRED_WORK_IDS: WorkId[] = ["ik.local_staff", "gelirler.unit_fee", "giderler.isletme"];

const KADEME_BASE_KEYS = ["okulOncesi", "ilkokul", "ortaokul", "lise"];

const WORK_ID_TO_PRIMARY_RESOURCE: Record<WorkId, string> = {
  temel_bilgiler: "page.temel_bilgiler",
  kapasite: "section.kapasite.caps",
  "norm.ders_dagilimi": "section.norm.ders_dagilimi",
  "ik.local_staff": "section.ik.local_staff",
  "gelirler.unit_fee": "section.gelirler.unit_fee",
  "giderler.isletme": "section.giderler.isletme",
};

const WORK_ID_TO_WRITE_RESOURCES: Record<WorkId, string[]> = {
  temel_bilgiler: ["page.temel_bilgiler"],
  kapasite: ["section.kapasite.caps", "page.kapasite"],
  "norm.ders_dagilimi": ["section.norm.ders_dagilimi", "page.norm"],
  "ik.local_staff": ["section.ik.local_staff", "page.ik"],
  "gelirler.unit_fee": ["section.gelirler.unit_fee", "page.gelirler"],
  "giderler.isletme": ["section.giderler.isletme", "page.giderler"],
};

const WORK_ID_TO_PAGE_KEY: Record<WorkId, string> = {
  temel_bilgiler: "temel_bilgiler",
  kapasite: "kapasite",
  "norm.ders_dagilimi": "norm",
  "ik.local_staff": "ik",
  "gelirler.unit_fee": "gelirler",
  "giderler.isletme": "giderler",
};

function toSnake(value: string) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

export function isWorkId(value: string | undefined | null): value is WorkId {
  return BASE_REQUIRED_WORK_IDS.includes(String(value || "") as WorkId);
}

export function isHeadquarterScenario(inputs?: Inputs | null) {
  const kademeler = inputs?.temelBilgiler?.kademeler;
  if (!kademeler || typeof kademeler !== "object") return false;
  return KADEME_BASE_KEYS.every((key) => kademeler?.[key]?.enabled === false);
}

export function getRequiredWorkIds(inputs?: Inputs | null, backendIds: string[] = []): WorkId[] {
  if (isHeadquarterScenario(inputs)) return HQ_REQUIRED_WORK_IDS;
  const validBackendIds = backendIds.filter(isWorkId);
  if (validBackendIds.length) return validBackendIds;
  return BASE_REQUIRED_WORK_IDS;
}

export function getSubmitResource(workId: string) {
  return isWorkId(workId) ? WORK_ID_TO_PRIMARY_RESOURCE[workId] : `section.${workId}`;
}

export function getWorkItemWriteResources(workId: string) {
  return isWorkId(workId) ? WORK_ID_TO_WRITE_RESOURCES[workId] : [`section.${workId}`];
}

export function getWorkItemPageKey(workId: string) {
  return isWorkId(workId) ? WORK_ID_TO_PAGE_KEY[workId] : String(workId || "").split(".")[0];
}

export function pathToResources(path: string) {
  const result: string[] = [];
  if (!path) return result;
  const tokens = String(path).split(".");
  if (tokens[0] === "inputs") tokens.shift();
  if (!tokens.length) return result;

  const gradeInputPages = new Set(["gradesYears", "gradesCurrent", "grades", "grades_years", "grades_current"]);
  if (gradeInputPages.has(tokens[0])) {
    return ["section.norm.ders_dagilimi"];
  }

  const pageAliases: Record<string, string> = {
    grades_years: "grades_plan",
    grades_current: "grades_plan",
    grades: "grades_plan",
  };
  const page = pageAliases[toSnake(tokens[0])] || toSnake(tokens[0]);
  if (!page) return result;

  if (tokens.length >= 2) {
    const sectionSnake = toSnake(tokens[1]);
    const sectionKeyMapping: Record<string, Record<string, string | null>> = {
      temel_bilgiler: {
        inflation: "inflation",
        ucret_artis_oranlari: "inflation",
        okul_ucretleri_hesaplama: "inflation",
        ik_mevcut: "ik_mevcut",
        burs_indirim_ogrenci_sayilari: "burs_ogr",
        burs_ogr: "burs_ogr",
        rakip_analizi: "rakip",
        rakip: "rakip",
        performans: "performans",
        degerlendirme: "performans",
        okul_egitim_bilgileri: "okul_egitim",
        yetkililer: null,
        kademeler: null,
        program_type: null,
      },
      gelirler: { "*": "unit_fee" },
      giderler: { "*": "isletme" },
      ik: { "*": "local_staff" },
      discounts: { "*": "discounts" },
      norm: { "*": "ders_dagilimi" },
      grades_plan: { "*": "plan" },
      kapasite: { "*": "caps" },
    };

    const pageMap = sectionKeyMapping[page];
    let mapped: string | null = null;
    if (pageMap) {
      if (Object.prototype.hasOwnProperty.call(pageMap, sectionSnake)) {
        mapped = pageMap[sectionSnake];
      } else if (Object.prototype.hasOwnProperty.call(pageMap, "*")) {
        mapped = pageMap["*"];
      } else {
        mapped = sectionSnake;
      }
    } else {
      mapped = sectionSnake;
    }
    if (mapped) return [`section.${page}.${mapped}`];
  }

  result.push(`page.${page}`);
  return result;
}

export function buildModifiedResourcesFromPaths(paths: string[]) {
  const resources = new Set<string>();
  for (const path of paths) {
    for (const resource of pathToResources(path)) {
      resources.add(resource);
    }
  }
  return Array.from(resources);
}

export function hasPageOrSectionRead(user: User | null | undefined, pageKey: string, scope: PermissionScope) {
  if (can(user, `page.${pageKey}`, "read", scope)) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.some((permission) => {
    const action = String(permission.action || "");
    if (action !== "read" && action !== "write") return false;
    const resource = String(permission.resource || "");
    if (!resource.startsWith(`section.${pageKey}.`)) return false;

    const countryId = scope.countryId == null ? null : Number(scope.countryId);
    const schoolId = scope.schoolId == null ? null : Number(scope.schoolId);
    const permissionCountry = permission.scope_country_id == null ? null : Number(permission.scope_country_id);
    const permissionSchool = permission.scope_school_id == null ? null : Number(permission.scope_school_id);

    if (permissionCountry != null && countryId == null) return false;
    if (permissionCountry != null && permissionCountry !== countryId) return false;
    if (permissionSchool != null && schoolId == null) return false;
    if (permissionSchool != null && permissionSchool !== schoolId) return false;
    return true;
  });
}

export function canReadWorkItem(user: User | null | undefined, workId: string, scope: PermissionScope) {
  return hasPageOrSectionRead(user, getWorkItemPageKey(workId), scope);
}

export function canWriteWorkItem(user: User | null | undefined, workId: string, scope: PermissionScope) {
  return getWorkItemWriteResources(workId).some((resource) => can(user, resource, "write", scope));
}

export function canReviewWorkItems(user: User | null | undefined, scope: PermissionScope) {
  const role = String(user?.role || "");
  if (role === "admin") return false;
  return (
    role === "manager" ||
    role === "accountant" ||
    can(user, "page.manage_permissions", "read", scope) ||
    can(user, "page.manage_permissions", "write", scope)
  );
}

export function canForwardScenario(user: User | null | undefined) {
  const role = String(user?.role || "");
  return role === "manager" || role === "accountant";
}

export function canSubmitWorkItemState(workItem?: WorkItem | null) {
  const state = String(workItem?.state || "not_started");
  return state !== "submitted" && state !== "approved";
}

export function areRequiredWorkItemsApproved(workItems: WorkItem[], requiredIds: string[]) {
  return requiredIds.every((workId) => {
    const item = workItems.find((candidate) => String(candidate.work_id) === String(workId));
    return String(item?.state || "") === "approved";
  });
}
