import { PermissionCatalog, PermissionEntry, SchoolAssignment } from "@/src/api/client";

export type ProgressSectionConfig = {
  enabled?: boolean;
  mode?: "ALL" | "MIN" | string;
  min?: number | null;
  selectedFields?: Record<string, boolean>;
  [key: string]: unknown;
};

export type ProgressConfig = {
  version?: number;
  sections?: Record<string, ProgressSectionConfig>;
  [key: string]: unknown;
};

export const PROGRESS_TABS = [
  { key: "temelBilgiler", label: "Temel Bilgiler" },
  { key: "kapasite", label: "Kapasite" },
  { key: "gradesPlan", label: "Sinif/Sube Plani" },
  { key: "norm", label: "Norm" },
  { key: "ik", label: "IK / HR" },
  { key: "gelirler", label: "Gelirler" },
  { key: "giderler", label: "Giderler" },
  { key: "discounts", label: "Indirimler" },
];

export const PROGRESS_SECTIONS = [
  { id: "temel.okulEgitim", tabKey: "temelBilgiler", label: "Okul Egitim Bilgileri", modeDefault: "ALL", minDefault: null },
  { id: "temel.inflation", tabKey: "temelBilgiler", label: "Enflasyon ve Parametreler", modeDefault: "ALL", minDefault: null },
  { id: "temel.ikMevcut", tabKey: "temelBilgiler", label: "IK Mevcut", modeDefault: "ALL", minDefault: null },
  { id: "temel.bursOgr", tabKey: "temelBilgiler", label: "Burs ve Indirimler", modeDefault: "MIN", minDefault: 1 },
  { id: "temel.rakip", tabKey: "temelBilgiler", label: "Rakip Analizi", modeDefault: "ALL", minDefault: null },
  { id: "temel.performans", tabKey: "temelBilgiler", label: "Performans", modeDefault: "ALL", minDefault: null },
  { id: "kapasite.caps", tabKey: "kapasite", label: "Kapasite", modeDefault: "ALL", minDefault: null },
  { id: "gradesPlan.plan", tabKey: "gradesPlan", label: "Planlanan Sinif/Sube", modeDefault: "ALL", minDefault: null },
  { id: "norm.current", tabKey: "norm", label: "Mevcut Donem Bilgileri", modeDefault: "ALL", minDefault: null },
  { id: "norm.lessons", tabKey: "norm", label: "Ders Dagilimi", modeDefault: "MIN", minDefault: 3 },
  { id: "ik.localStaff", tabKey: "ik", label: "IK Yerel", modeDefault: "ALL", minDefault: null },
  { id: "ik.hqStaff", tabKey: "ik", label: "IK Merkez Temsilcilik", modeDefault: "ALL", minDefault: null },
  { id: "gelirler.unitFee", tabKey: "gelirler", label: "Birim Ucret", modeDefault: "MIN", minDefault: 1 },
  { id: "giderler.isletme", tabKey: "giderler", label: "Isletme Giderleri", modeDefault: "MIN", minDefault: 5 },
  { id: "discounts.discounts", tabKey: "discounts", label: "Indirimler", modeDefault: "MIN", minDefault: 1 },
];

export const ASSIGNMENT_MODULES = [
  { id: "Temel Bilgiler", label: "Temel Bilgiler" },
  { id: "Kapasite", label: "Kapasite" },
  { id: "Norm", label: "Norm" },
  { id: "IK / HR", label: "IK" },
  { id: "Gelirler", label: "Gelirler" },
  { id: "Giderler", label: "Giderler" },
];

const ASSIGNMENT_MODULE_ALIASES: Record<string, string> = {
  temel_bilgiler: "Temel Bilgiler",
  kapasite: "Kapasite",
  "norm.ders_dagilimi": "Norm",
  "ik.local_staff": "IK / HR",
  "gelirler.unit_fee": "Gelirler",
  "giderler.isletme": "Giderler",
  "IK (HR)": "IK / HR",
  "İK (HR)": "IK / HR",
};

function normalizeAssignmentModule(module: unknown) {
  const raw = String(module || "").trim();
  return ASSIGNMENT_MODULE_ALIASES[raw] || raw;
}

export function defaultProgressConfig(): ProgressConfig {
  const sections: Record<string, ProgressSectionConfig> = {};
  PROGRESS_SECTIONS.forEach((section) => {
    sections[section.id] = {
      enabled: true,
      mode: section.modeDefault,
      min: section.minDefault,
      selectedFields: {},
    };
  });
  return { version: 1, sections };
}

export function normalizeProgressConfig(input: unknown): ProgressConfig {
  const base = defaultProgressConfig();
  const incoming = input && typeof input === "object" ? input as ProgressConfig : {};
  const sourceSections = incoming.sections && typeof incoming.sections === "object" ? incoming.sections : {};
  const sections: Record<string, ProgressSectionConfig> = {};

  PROGRESS_SECTIONS.forEach((section) => {
    const current = sourceSections[section.id] && typeof sourceSections[section.id] === "object"
      ? sourceSections[section.id]
      : {};
    const fallback = base.sections?.[section.id] || {};
    const mode = String(current.mode || fallback.mode || section.modeDefault || "ALL").toUpperCase();
    const min = Number(current.min ?? fallback.min ?? section.minDefault ?? 1);
    sections[section.id] = {
      ...fallback,
      ...current,
      enabled: current.enabled !== false,
      mode: mode === "MIN" ? "MIN" : "ALL",
      min: Number.isFinite(min) && min > 0 ? min : section.minDefault,
      selectedFields: current.selectedFields && typeof current.selectedFields === "object"
        ? current.selectedFields
        : fallback.selectedFields || {},
    };
  });

  return { ...incoming, version: Number(incoming.version || base.version || 1), sections };
}

export function flattenCatalog(catalog: PermissionCatalog | null | undefined) {
  const groups = Object.entries(catalog || {});
  return groups.map(([group, permissions]) => {
    const resources = new Map<string, { resource: string; label: string; group: string }>();
    (Array.isArray(permissions) ? permissions : []).forEach((permission) => {
      const resource = String(permission.resource || "");
      if (!resource) return;
      if (!resources.has(resource)) {
        resources.set(resource, {
          resource,
          label: String(permission.label || resource).replace(/\s*(?:-|\u2013)\s*(View|Edit)\s*$/i, ""),
          group,
        });
      }
    });
    return { group, rows: Array.from(resources.values()).sort((a, b) => a.label.localeCompare(b.label)) };
  }).filter((entry) => entry.rows.length > 0);
}

export function permissionKey(resource: string, action: string) {
  return `${resource}|${action}`;
}

export function permissionsToDraft(permissions: PermissionEntry[]) {
  const selected: Record<string, boolean> = {};
  const scopes: Record<string, string> = {};
  permissions.forEach((permission) => {
    const resource = String(permission.resource || "");
    const action = String(permission.action || "");
    if (!resource || !action) return;
    const key = permissionKey(resource, action);
    selected[key] = true;
    scopes[key] = permission.scope_school_id != null
      ? `school:${permission.scope_school_id}`
      : "country";
  });
  return { selected, scopes };
}

export function buildPermissionPayload(
  selected: Record<string, boolean>,
  scopes: Record<string, string>,
  countryId: number | null,
): PermissionEntry[] {
  return Object.entries(selected)
    .filter(([, enabled]) => enabled)
    .map(([key]) => {
      const [resource, action] = key.split("|");
      const scope = scopes[key] || "country";
      const schoolMatch = /^school:(\d+)$/.exec(scope);
      return {
        resource,
        action,
        scope_country_id: countryId,
        scope_school_id: schoolMatch ? Number(schoolMatch[1]) : null,
      };
    })
    .filter((permission) => permission.resource && permission.action);
}

export function normalizeAssignmentDraft(assignments: SchoolAssignment[]) {
  return assignments.map((assignment) => ({
    userId: Number(assignment.userId),
    role: String(assignment.role || "principal"),
    modules: Array.isArray(assignment.modules)
      ? Array.from(new Set(assignment.modules.map(normalizeAssignmentModule).filter(Boolean)))
      : [],
  })).filter((assignment) => Number.isFinite(assignment.userId));
}
