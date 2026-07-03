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
};
