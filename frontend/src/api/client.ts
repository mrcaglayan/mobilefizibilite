// Thin fetch-based API client for Feasibility Studio mobile.
// Base URL: EXPO_PUBLIC_BACKEND_URL (Kubernetes ingress routes /api/* → backend port 8001).
// To point to your OWN backend, change EXPO_PUBLIC_BACKEND_URL in /app/frontend/.env.

import { storage } from "@/src/utils/storage";

const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const BASE = RAW_BASE.replace(/\/+$/, "") + "/api";

export const API_BASE = BASE;

const TOKEN_KEY = "fs_token";
const REMEMBER_KEY = "fs_remember";

export async function loadToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function saveToken(token: string | null): Promise<void> {
  if (!token) {
    await storage.secureRemove(TOKEN_KEY);
  } else {
    await storage.secureSet(TOKEN_KEY, token);
  }
}

export async function loadRemembered(): Promise<{ email: string; password: string } | null> {
  const raw = await storage.getItem<string>(REMEMBER_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveRemembered(data: { email: string; password: string } | null): Promise<void> {
  if (!data) {
    await storage.removeItem(REMEMBER_KEY);
  } else {
    await storage.setItem(REMEMBER_KEY, JSON.stringify(data));
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOpts = {
  method?: Method;
  body?: any;
  token?: string | null;
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, token } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token ?? (await loadToken());
  if (t) headers.Authorization = `Bearer ${t}`;

  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new ApiError(e?.message || "Ağ hatası", 0, null);
  }
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const msg = (data && (data.detail || data.error || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, data);
  }
  return data as T;
}

// ---------------- API surface ----------------
export type User = {
  id: string;
  email: string;
  role: string;
  country_id?: number | null;
  country_name?: string | null;
  must_reset_password?: boolean;
  permissions?: string[];
};

export type LoginResponse = { token: string; user: User };

export type School = {
  id: string;
  name: string;
  city?: string;
  country_id?: number;
  created_at: string;
  updated_at?: string;
  progress?: number;
};

export type Scenario = {
  id: string;
  school_id: string;
  name: string;
  input_currency: string;
  fx_usd_to_local?: number;
  local_currency_code?: string;
  created_at: string;
  updated_at?: string;
  state?: string;
};

export type Inputs = {
  temelBilgiler?: any;
  kapasite?: any;
  ik?: any;
  gelirler?: any;
  giderler?: any;
  discounts?: any;
  [k: string]: any;
};

export type Report = {
  currency: string;
  kpis: Record<string, number>;
  gelirDagilim: { label: string; value: number }[];
  giderDagilim: { label: string; value: number }[];
};

export type AdminUser = {
  id: number | string;
  full_name?: string | null;
  email: string;
  role: string;
  country_id?: number | null;
  country_name?: string | null;
  country_code?: string | null;
  region?: string | null;
  must_reset_password?: boolean;
};

export type Country = {
  id: number;
  name: string;
  code: string;
  region?: string | null;
};

export type ScenarioKpi = {
  net_ciro: number | null;
  net_result: number | null;
  students_total: number | null;
};

export type ScenarioQueueRow = {
  scenario: {
    id: number | string;
    name: string;
    academic_year: string;
    status: string;
    submitted_at?: string | null;
    review_note?: string | null;
    reviewed_at?: string | null;
    input_currency?: string;
    local_currency_code?: string;
    fx_usd_to_local?: number;
    progress_pct?: number | null;
    progress_missing_preview?: string | null;
    progress_missing_count?: number;
    sent_at?: string | null;
    checked_at?: string | null;
  };
  school: { id: number | string; name: string };
  country: { id: number; name: string; region?: string | null };
  kpis: { y1: ScenarioKpi | null; y2: ScenarioKpi | null; y3: ScenarioKpi | null };
  missingKpis: { y1: boolean; y2: boolean; y3: boolean };
};

export type ApprovalBatchRow = {
  batch_id: number | string;
  status: string;
  academic_year: string;
  created_at: string;
  reviewed_at?: string | null;
  review_note?: string | null;
  country: { id: number; name: string; region?: string | null };
  scenario_count: number;
  school_count: number;
};

export type BatchItem = {
  scenario_id: number | string;
  scenario_name: string;
  school_id: number | string;
  school_name: string;
  status: string;
  sent_at?: string | null;
  progress_pct?: number | null;
  is_source: boolean;
};

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request<User>("/auth/me"),

  listSchools: () => request<{ items: School[]; total: number }>("/schools"),
  getSchool: (id: string) => request<School>(`/schools/${id}`),

  listScenarios: (schoolId: string) =>
    request<{ items: Scenario[]; total: number }>(`/schools/${schoolId}/scenarios`),
  getInputs: (schoolId: string, scenarioId: string) =>
    request<{ inputs: Inputs }>(`/schools/${schoolId}/scenarios/${scenarioId}/inputs`),
  saveInputs: (schoolId: string, scenarioId: string, inputs: Inputs, modifiedResources?: string[]) =>
    request<{ ok: true; updated_at: string }>(
      `/schools/${schoolId}/scenarios/${scenarioId}/inputs`,
      { method: "PUT", body: { inputs, modifiedResources } },
    ),
  getReport: (schoolId: string, scenarioId: string) =>
    request<Report>(`/schools/${schoolId}/scenarios/${scenarioId}/report`),
  calculate: (schoolId: string, scenarioId: string) =>
    request<{ ok: true; report: Report }>(
      `/schools/${schoolId}/scenarios/${scenarioId}/calculate`,
      { method: "POST" },
    ),

  // ---- Admin: users ----
  adminListUsers: (opts: { limit?: number; offset?: number; unassigned?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (opts.limit != null) qs.set("limit", String(opts.limit));
    if (opts.offset != null) qs.set("offset", String(opts.offset));
    if (opts.unassigned) qs.set("unassigned", "1");
    const s = qs.toString();
    return request<{ users: AdminUser[]; total: number } | AdminUser[]>(
      `/admin/users${s ? `?${s}` : ""}`,
    );
  },
  adminCreateUser: (payload: {
    full_name?: string;
    email: string;
    password: string;
    role: string;
    country_id?: number | null;
    country_code?: string | null;
  }) => request<AdminUser>("/admin/users", { method: "POST", body: payload }),
  adminUpdateUserRole: (userId: number | string, role: string) =>
    request<AdminUser>(`/admin/users/${userId}/role`, { method: "PATCH", body: { role } }),
  adminAssignUserCountry: (
    userId: number | string,
    payload: { country_id?: number; country_code?: string },
  ) => request<AdminUser>(`/admin/users/${userId}/country`, { method: "PATCH", body: payload }),
  adminResetUserPassword: (userId: number | string, password?: string) =>
    request<{ ok: true; user_id: number; email: string; temporary_password: string }>(
      `/admin/users/${userId}/reset-password`,
      { method: "POST", body: password ? { password } : {} },
    ),
  adminDeleteUser: (userId: number | string) =>
    request<{ ok: true }>(`/admin/users/${userId}`, { method: "DELETE" }),

  // ---- Admin: countries (for pickers and management) ----
  adminListCountries: () => request<Country[] | { countries: Country[]; items?: Country[] }>("/admin/countries"),
  adminCreateCountry: (payload: { name: string; code: string; region: string }) =>
    request<Country>("/admin/countries", { method: "POST", body: payload }),
  adminListCountrySchools: (countryId: number | string, opts: { includeClosed?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (opts.includeClosed) qs.set("includeClosed", "1");
    const s = qs.toString();
    return request<School[]>(`/admin/countries/${countryId}/schools${s ? `?${s}` : ""}`);
  },
  adminCreateCountrySchool: (countryId: number | string, payload: { name: string }) =>
    request<School>(`/admin/countries/${countryId}/schools`, { method: "POST", body: payload }),
  adminUpdateSchool: (
    schoolId: number | string,
    payload: { name?: string; status?: "active" | "closed" },
  ) => request<School>(`/admin/schools/${schoolId}`, { method: "PATCH", body: payload }),

  // ---- Admin: approvals (scenarios + country batches) ----
  adminGetScenarioQueue: (
    opts: { status?: string; academicYear?: string; region?: string; countryId?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.academicYear) qs.set("academicYear", opts.academicYear);
    if (opts.region) qs.set("region", opts.region);
    if (opts.countryId != null) qs.set("countryId", String(opts.countryId));
    const s = qs.toString();
    return request<ScenarioQueueRow[]>(`/admin/scenarios/queue${s ? `?${s}` : ""}`);
  },
  adminReviewScenario: (
    scenarioId: number | string,
    body: {
      action: "approve" | "revise";
      note?: string | null;
      includedYears?: string[];
      revisionWorkIds?: string[];
    },
  ) => request<{ ok: true }>(`/admin/scenarios/${scenarioId}/review`, { method: "PATCH", body }),
  adminGetApprovalBatchQueue: (
    opts: { status?: string; academicYear?: string; region?: string; countryId?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.academicYear) qs.set("academicYear", opts.academicYear);
    if (opts.region) qs.set("region", opts.region);
    if (opts.countryId != null) qs.set("countryId", String(opts.countryId));
    const s = qs.toString();
    return request<ApprovalBatchRow[]>(`/admin/approval-batches/queue${s ? `?${s}` : ""}`);
  },
  adminGetApprovalBatch: (batchId: number | string) =>
    request<{ batch: ApprovalBatchRow; items: BatchItem[] }>(`/admin/approval-batches/${batchId}`),
  adminReviewApprovalBatch: (
    batchId: number | string,
    body: {
      action: "approve" | "revise";
      note?: string | null;
      includedYears?: string[];
      revisionWorkIds?: string[];
    },
  ) => request<{ ok: true }>(`/admin/approval-batches/${batchId}/review`, { method: "PATCH", body }),

  // ---- Manager: users (scoped to caller's country) ----
  managerListUsers: () =>
    request<{ users: AdminUser[]; total: number } | AdminUser[]>("/manager/users"),
  managerCreateUser: (payload: {
    full_name?: string;
    email: string;
    password: string;
    role: "principal" | "hr";
  }) => request<AdminUser>("/manager/users", { method: "POST", body: payload }),
  managerUpdateUserRole: (userId: number | string, role: string) =>
    request<AdminUser>(`/manager/users/${userId}/role`, { method: "PATCH", body: { role } }),
  managerUpdateUserEmail: (userId: number | string, email: string) =>
    request<AdminUser>(`/manager/users/${userId}/email`, { method: "PATCH", body: { email } }),
  managerResetUserPassword: (userId: number | string, password?: string) =>
    request<{ ok: true; user_id: number; email: string; temporary_password: string }>(
      `/manager/users/${userId}/reset-password`,
      { method: "POST", body: password ? { password } : {} },
    ),
};
