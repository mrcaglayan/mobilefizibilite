// Fetch-based API client for the Expo app.
// Production contract: fizibilite/backend/src mounted under /api at tmffinance.com.

import { storage } from "@/src/utils/storage";

const DEFAULT_BACKEND_URL = "http://tmffinance.com";
const RAW_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;

function normalizeApiBase(rawBase: string): string {
  const trimmed = String(rawBase || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
  const collapsedApiSuffix = trimmed.replace(/(?:\/api)+$/i, "/api");
  if (collapsedApiSuffix.toLowerCase().endsWith("/api")) return collapsedApiSuffix;
  return `${collapsedApiSuffix}/api`;
}

export const API_BASE = normalizeApiBase(RAW_BASE);

const TOKEN_KEY = "fs_token";
const REMEMBER_KEY = "fs_remember";

export type Id = string | number;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue | QueryValue[]>;

type RequestOpts = {
  method?: Method;
  body?: unknown;
  token?: string | null;
  noCache?: boolean;
};

export type ListResponse<T> = {
  items: T[];
  total: number;
  limit: number | null;
  offset: number;
  fields: string;
  order: string | null;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

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

export async function setSession(token: string | null): Promise<void> {
  await saveToken(token);
}

export async function loadRemembered(): Promise<{ email: string } | null> {
  const raw = await storage.getItem<string>(REMEMBER_KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const email = String(parsed?.email || "").trim();
    if (!email) return null;
    if (parsed?.password) {
      await storage.setItem(REMEMBER_KEY, JSON.stringify({ email }));
    }
    return { email };
  } catch {
    return null;
  }
}

export async function saveRemembered(data: { email: string } | null): Promise<void> {
  if (!data) {
    await storage.removeItem(REMEMBER_KEY);
  } else {
    await storage.setItem(REMEMBER_KEY, JSON.stringify({ email: data.email }));
  }
}

function id(value: Id): string {
  return encodeURIComponent(String(value));
}

export function toQuery(params: QueryParams = {}): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const clean = value.filter((v) => v != null && v !== "");
      if (clean.length) qs.set(key, clean.map(String).join(","));
      return;
    }
    if (value == null || value === "") return;
    qs.set(key, value === true ? "1" : value === false ? "0" : String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export function buildApiUrl(path: string, params?: QueryParams): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = `${API_BASE}${normalizedPath}`;
  const qs = toQuery(params);
  if (!qs) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? `&${qs.slice(1)}` : qs}`;
}

async function getAuthHeaders(token?: string | null): Promise<Record<string, string>> {
  const t = token ?? (await loadToken());
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, token, noCache = false } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders(token)),
  };

  if (noCache) {
    headers["Cache-Control"] = "no-cache";
    headers.Pragma = "no-cache";
  }

  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: unknown) {
    throw new ApiError(e instanceof Error ? e.message : "Network error", 0, null);
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      data && typeof data === "object"
        ? String(
            (data as { detail?: unknown; error?: unknown; message?: unknown }).detail ||
              (data as { detail?: unknown; error?: unknown; message?: unknown }).error ||
              (data as { detail?: unknown; error?: unknown; message?: unknown }).message ||
              `Request failed (${res.status})`,
          )
        : String(data || `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export type BinaryResponse = {
  data: ArrayBuffer;
  filename: string;
  contentType: string;
};

async function requestBinary(path: string, opts: Omit<RequestOpts, "body"> = {}): Promise<BinaryResponse> {
  const { method = "GET", token, noCache = false } = opts;
  const headers: Record<string, string> = await getAuthHeaders(token);
  if (noCache) {
    headers["Cache-Control"] = "no-cache";
    headers.Pragma = "no-cache";
  }

  const res = await fetch(buildApiUrl(path), { method, headers });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");
    const msg =
      data && typeof data === "object"
        ? String(
            (data as { error?: unknown; message?: unknown }).error ||
              (data as { error?: unknown; message?: unknown }).message ||
              "Download failed",
          )
        : String(data || "Download failed");
    throw new ApiError(msg, res.status, data);
  }

  const cd = res.headers.get("content-disposition") || "";
  const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] || "download";
  return {
    data: await res.arrayBuffer(),
    filename,
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

function normalizeList<T>(payload: unknown, keys: string | string[]): ListResponse<T> {
  const listKeys = Array.isArray(keys) ? keys : [keys];
  let items: T[] = [];

  if (Array.isArray(payload)) {
    items = payload as T[];
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const named = listKeys.find((key) => Array.isArray(obj[key]));
    if (named) items = obj[named] as T[];
    else if (Array.isArray(obj.items)) items = obj.items as T[];
  }

  const obj = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  return {
    items,
    total: Number(obj.total ?? items.length),
    limit: obj.limit == null ? null : Number(obj.limit),
    offset: Number(obj.offset ?? 0),
    fields: String(obj.fields ?? "all"),
    order: obj.order == null ? null : String(obj.order),
  };
}

function asArray<T>(payload: unknown, key?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && key && Array.isArray((payload as Record<string, unknown>)[key])) {
    return (payload as Record<string, unknown>)[key] as T[];
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).items)) {
    return (payload as Record<string, unknown>).items as T[];
  }
  return [];
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function firstFinite(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function pushAmount(rows: { label: string; value: number }[], label: string, value: unknown) {
  const n = Number(value);
  if (Number.isFinite(n) && Math.abs(n) > 0) rows.push({ label, value: n });
}

function adaptScenarioReport(payload: unknown): Report {
  if (payload && typeof payload === "object" && "kpis" in payload && "gelirDagilim" in payload) {
    return payload as Report;
  }

  const envelope = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawResults = parseMaybeJson(envelope.results ?? payload);
  const results = rawResults && typeof rawResults === "object" ? (rawResults as Record<string, unknown>) : null;
  if (!results) {
    return {
      currency: "USD",
      kpis: {},
      gelirDagilim: [],
      giderDagilim: [],
      cached: Boolean(envelope.cached),
      calculatedAt: (envelope.calculatedAt as string | null | undefined) ?? null,
      disabledMessage: "Rapor verisi mobil ozet formata uyarlanamadi.",
      raw: payload,
    };
  }

  const years = results.years && typeof results.years === "object"
    ? (results.years as Record<string, unknown>)
    : { y1: results };
  const yearKeys = ["y1", "y2", "y3"];
  const selected = yearKeys.map((key) => years[key]).find(Boolean);
  const y = selected && typeof selected === "object" ? (selected as Record<string, unknown>) : {};
  const income = y.income && typeof y.income === "object" ? (y.income as Record<string, unknown>) : {};
  const expenses = y.expenses && typeof y.expenses === "object" ? (y.expenses as Record<string, unknown>) : {};
  const result = y.result && typeof y.result === "object" ? (y.result as Record<string, unknown>) : {};
  const kpis = y.kpis && typeof y.kpis === "object" ? (y.kpis as Record<string, unknown>) : {};
  const pnl = y.pnl && typeof y.pnl === "object" ? (y.pnl as Record<string, unknown>) : {};
  const students = y.students && typeof y.students === "object" ? (y.students as Record<string, unknown>) : {};

  const gelirDagilim: { label: string; value: number }[] = [];
  const grossBreakdown = Array.isArray(pnl.grossSalesBreakdown) ? pnl.grossSalesBreakdown : [];
  grossBreakdown.forEach((row) => {
    if (!row || typeof row !== "object") return;
    pushAmount(
      gelirDagilim,
      String((row as { label?: unknown }).label || "Gelir"),
      (row as { value?: unknown }).value,
    );
  });
  if (!gelirDagilim.length) {
    pushAmount(gelirDagilim, "Egitim Geliri", income.grossTuition);
    pushAmount(gelirDagilim, "Egitim Disi", income.nonEducationFeesTotal);
    pushAmount(gelirDagilim, "Yurt", income.dormitoryRevenuesTotal);
    pushAmount(gelirDagilim, "Diger", income.otherInstitutionIncomeTotal);
  }

  const giderDagilim: { label: string; value: number }[] = [];
  pushAmount(giderDagilim, "Isletme", expenses.operatingExpensesTotal ?? pnl.operatingTotal);
  pushAmount(giderDagilim, "Egitim Disi", expenses.nonTuitionServicesCostTotal);
  pushAmount(giderDagilim, "Yurt", expenses.dormitoryCostTotal);
  pushAmount(giderDagilim, "Satis Maliyeti", pnl.costOfSalesTotal);

  return {
    currency: "USD",
    kpis: {
      toplamGelir: firstFinite(income.netIncome, income.netActivityIncome, pnl.netSales, pnl.grossSales),
      toplamGider: firstFinite(expenses.totalExpenses, pnl.costOfSalesTotal),
      faaliyetKari: firstFinite(result.netResult, pnl.periodNetProfit),
      karMarji: pct(kpis.profitMargin),
      aktifOgrenci: firstFinite(students.totalStudents),
      toplamKapasite: firstFinite(students.schoolCapacity),
      doluluk: pct(students.utilizationRate),
      ogrenciBasinaGelir: firstFinite(kpis.revenuePerStudent, kpis.netCiroPerStudent),
      ogrenciBasinaGider: firstFinite(kpis.costPerStudent),
    },
    gelirDagilim,
    giderDagilim,
    cached: Boolean(envelope.cached),
    calculatedAt: (envelope.calculatedAt as string | null | undefined) ?? null,
    distributionMeta: envelope.distributionMeta,
    raw: payload,
  };
}

// ---------------- API surface ----------------
export type User = {
  id: Id;
  full_name?: string | null;
  email: string;
  role: string;
  country_id?: number | null;
  country_name?: string | null;
  country_code?: string | null;
  region?: string | null;
  must_reset_password?: boolean;
  permissions?: PermissionEntry[];
  principalSchoolIds?: Id[];
};

export type LoginResponse = { token: string; user: User };

export type School = {
  id: Id;
  name: string;
  city?: string | null;
  country_id?: number;
  country_name?: string | null;
  country_code?: string | null;
  status?: "active" | "closed" | string;
  created_at: string;
  updated_at?: string | null;
  progress?: number;
};

export type SchoolProgressEntry = {
  state?: "empty" | "approved" | "active" | "error" | string;
  label?: string;
  scenarioId?: Id;
  pct?: number | null;
  tooltipLines?: string[];
  debug?: unknown;
};

export type SchoolsProgressResponse = {
  progressBySchoolId: Record<string, SchoolProgressEntry>;
};

export type SchoolsExpenseSplitStaleResponse = {
  staleBySchoolId: Record<string, boolean>;
};

export type Scenario = {
  id: Id;
  school_id: Id;
  name: string;
  academic_year?: string;
  input_currency: string;
  fx_usd_to_local?: number | null;
  local_currency_code?: string | null;
  program_type?: string | null;
  created_at: string;
  updated_at?: string | null;
  status?: string;
  state?: string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  sent_at?: string | null;
  checked_at?: string | null;
  checked_by?: Id | null;
  progress_pct?: number | null;
  expense_split_applied?: boolean;
  expense_split_stale?: boolean;
};

export type ScenarioCreatePayload = {
  name: string;
  academicYear: string;
  kademeConfig?: unknown;
  inputCurrency?: "USD" | "LOCAL";
  localCurrencyCode?: string | null;
  fxUsdToLocal?: number | string | null;
  programType?: string | null;
};

export type ScenarioUpdatePayload = {
  name?: string;
  academicYear?: string;
  kademeConfig?: unknown;
  localCurrencyCode?: string | null;
  fxUsdToLocal?: number | string | null;
  programType?: string | null;
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

export type ScenarioInputsResponse = {
  inputs: Inputs;
  updatedAt?: string | null;
  scenario?: Scenario;
};

export type ScenarioContext = {
  scenario: Scenario;
  inputs: Inputs;
  inputsUpdatedAt?: string | null;
  norm?: unknown;
  normUpdatedAt?: string | null;
};

export type ScenarioProgressResponse = {
  scenarioId: Id;
  schoolId: Id;
  progress: unknown;
  cached?: boolean;
  calculatedAt?: string | null;
};

export type WorkItem = {
  work_id: string;
  resource?: string | null;
  state: string;
  updated_by?: Id | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  manager_comment?: string | null;
};

export type WorkItemsResponse = {
  workItems: WorkItem[];
  requiredWorkIds: string[];
};

export type WorkItemActionResponse = {
  workItem: WorkItem | null;
  scenario?: Scenario | null;
};

export type SendForApprovalResponse = {
  ok?: true;
  scenario?: Scenario | null;
  reasons?: string[];
};

export type Report = {
  currency: string;
  kpis: Record<string, number>;
  gelirDagilim: { label: string; value: number }[];
  giderDagilim: { label: string; value: number }[];
  cached?: boolean;
  calculatedAt?: string | null;
  distributionMeta?: unknown;
  disabledMessage?: string;
  raw?: unknown;
};

export type AdminUser = {
  id: Id;
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

export type PermissionEntry = {
  id?: Id;
  resource: string;
  action: string;
  scope_country_id?: number | null;
  scope_school_id?: number | null;
};

export type PermissionCatalog = Record<string, PermissionEntry[]>;

export type ScenarioKpi = {
  net_ciro: number | null;
  net_result: number | null;
  students_total: number | null;
};

export type ScenarioQueueRow = {
  scenario: {
    id: Id;
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
  school: { id: Id; name: string };
  country: { id: number; name: string; region?: string | null };
  kpis: { y1: ScenarioKpi | null; y2: ScenarioKpi | null; y3: ScenarioKpi | null };
  missingKpis: { y1: boolean; y2: boolean; y3: boolean };
};

export type ApprovalBatchRow = {
  batch_id: Id;
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
  scenario_id: Id;
  scenario_name: string;
  school_id: Id;
  school_name: string;
  status: string;
  sent_at?: string | null;
  progress_pct?: number | null;
  is_source: boolean;
};

type SaveInputsOptions = {
  modifiedResources?: string[];
  modifiedPaths?: string[];
  allowUnsafeAdminSave?: boolean;
};

function normalizeSaveOptions(input?: string[] | SaveInputsOptions): SaveInputsOptions {
  if (Array.isArray(input)) return { modifiedResources: input };
  return input || {};
}

function requireSafeSaveOptions(options: SaveInputsOptions) {
  const hasResources = Array.isArray(options.modifiedResources) && options.modifiedResources.length > 0;
  const hasPaths = Array.isArray(options.modifiedPaths) && options.modifiedPaths.length > 0;
  if (!hasResources && !hasPaths && !options.allowUnsafeAdminSave) {
    throw new ApiError(
      "Scenario input save is disabled until the mobile module sends valid modifiedResources.",
      0,
      { code: "MOBILE_SCENARIO_SAVE_GATED" },
    );
  }
}

function queryFromListOptions(opts: QueryParams = {}): QueryParams {
  return opts;
}

export const api = {
  setSession,
  request,
  requestBinary,
  buildApiUrl,

  register: (payload: unknown) => request("/auth/register", { method: "POST", body: payload }),
  login: (emailOrPayload: string | { email: string; password: string }, password?: string) => {
    const body =
      typeof emailOrPayload === "string"
        ? { email: emailOrPayload, password: password || "" }
        : emailOrPayload;
    return request<LoginResponse>("/auth/login", { method: "POST", body });
  },
  me: (token?: string | null) => request<User>("/auth/me", { token }),
  getMe: (token?: string | null) => request<User>("/auth/me", { token }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<LoginResponse>("/auth/change-password", { method: "POST", body: payload }),

  listSchools: async (opts: QueryParams = {}) =>
    normalizeList<School>(
      await request(`/schools${toQuery(queryFromListOptions(opts))}`),
      ["schools", "items"],
    ),
  createSchool: (payload: { name: string }) =>
    request<School>("/schools", { method: "POST", body: payload }),
  getSchool: (schoolId: Id) => request<School>(`/schools/${id(schoolId)}`),
  getSchoolsProgressBulk: (schoolIds: Id[] = []) =>
    request<SchoolsProgressResponse>(
      `/schools/progress${toQuery({ schoolIds: schoolIds.map(String).join(",") })}`,
      { noCache: true },
    ),
  getSchoolsExpenseSplitStale: (schoolIds: Id[] = []) =>
    request<SchoolsExpenseSplitStaleResponse>(
      `/schools/expense-split-stale${toQuery({ schoolIds: schoolIds.map(String).join(",") })}`,
      {
        noCache: true,
      },
    ),
  // No school hard-delete helper: the production backend intentionally blocks it. Use close/reopen.

  listScenarios: async (schoolId: Id, opts: QueryParams = {}) =>
    normalizeList<Scenario>(
      await request(`/schools/${id(schoolId)}/scenarios${toQuery(queryFromListOptions(opts))}`),
      ["scenarios", "items"],
    ),
  createScenario: (schoolId: Id, payload: ScenarioCreatePayload) =>
    request<Scenario>(`/schools/${id(schoolId)}/scenarios`, { method: "POST", body: payload }),
  updateScenario: async (schoolId: Id, scenarioId: Id, payload: ScenarioUpdatePayload) => {
    const updated = await request<{ scenario: Scenario | null }>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
    return updated.scenario;
  },
  deleteScenario: (schoolId: Id, scenarioId: Id) =>
    request<{ ok: true }>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}`, { method: "DELETE" }),
  getScenarioInputs: (schoolId: Id, scenarioId: Id) =>
    request<ScenarioInputsResponse>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/inputs`),
  getInputs: (schoolId: Id, scenarioId: Id) =>
    request<ScenarioInputsResponse>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/inputs`),
  getScenarioContext: (schoolId: Id, scenarioId: Id) =>
    request<ScenarioContext>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/context`),
  getScenarioProgress: (schoolId: Id, scenarioId: Id) =>
    request<ScenarioProgressResponse>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/progress`, {
      noCache: true,
    }),
  saveScenarioInputs: (
    schoolId: Id,
    scenarioId: Id,
    inputs: Inputs,
    options?: string[] | SaveInputsOptions,
    legacyModifiedPaths?: string[],
  ) => {
    const saveOptions = normalizeSaveOptions(options);
    if (legacyModifiedPaths?.length) saveOptions.modifiedPaths = legacyModifiedPaths;
    requireSafeSaveOptions(saveOptions);
    const body: Record<string, unknown> = { inputs };
    if (saveOptions.modifiedResources?.length) body.modifiedResources = saveOptions.modifiedResources;
    if (saveOptions.modifiedPaths?.length) body.modifiedPaths = saveOptions.modifiedPaths;
    return request<{ ok?: true; updated_at?: string }>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/inputs`,
      { method: "PUT", body },
    );
  },
  saveInputs: (
    schoolId: Id,
    scenarioId: Id,
    inputs: Inputs,
    modifiedResources?: string[],
    modifiedPaths?: string[],
  ) => api.saveScenarioInputs(schoolId, scenarioId, inputs, { modifiedResources, modifiedPaths }),
  calculateScenario: async (schoolId: Id, scenarioId: Id) => {
    const raw = await request<{ results?: unknown }>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/calculate`,
      { method: "POST" },
    );
    return { ok: true as const, ...raw, report: adaptScenarioReport(raw) };
  },
  calculate: async (schoolId: Id, scenarioId: Id) => {
    const raw = await request<{ results?: unknown }>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/calculate`,
      { method: "POST" },
    );
    return { ok: true as const, ...raw, report: adaptScenarioReport(raw) };
  },
  getScenarioReport: async (schoolId: Id, scenarioId: Id, mode = "original") =>
    adaptScenarioReport(
      await request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/report${toQuery({ mode })}`),
    ),
  getReport: async (schoolId: Id, scenarioId: Id, mode = "original") =>
    adaptScenarioReport(
      await request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/report${toQuery({ mode })}`),
    ),

  getNormConfig: (schoolId: Id, scenarioId?: Id) =>
    request(`/schools/${id(schoolId)}/norm-config${toQuery({ scenarioId })}`),
  saveNormConfig: (schoolId: Id, scenarioId: Id | undefined, payload: unknown) =>
    request(`/schools/${id(schoolId)}/norm-config${toQuery({ scenarioId })}`, {
      method: "PUT",
      body: payload,
    }),
  listWorkItems: async (schoolId: Id, scenarioId: Id) => {
    const payload = await request<WorkItemsResponse | WorkItem[]>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/work-items`,
      {
        noCache: true,
      },
    );
    if (Array.isArray(payload)) return { workItems: payload, requiredWorkIds: [] };
    return {
      workItems: Array.isArray(payload?.workItems) ? payload.workItems : [],
      requiredWorkIds: Array.isArray(payload?.requiredWorkIds)
        ? payload.requiredWorkIds.map((workId) => String(workId))
        : [],
    };
  },
  submitWorkItem: (schoolId: Id, scenarioId: Id, workId: string, body?: unknown) =>
    request<WorkItemActionResponse>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/work-items/${id(workId)}/submit`,
      {
        method: "POST",
        body,
      },
    ),
  reviewWorkItem: (schoolId: Id, scenarioId: Id, workId: string, body: unknown) =>
    request<WorkItemActionResponse>(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/work-items/${id(workId)}/review`,
      {
        method: "POST",
        body,
      },
    ),
  sendForApproval: (schoolId: Id, scenarioId: Id) =>
    request<SendForApprovalResponse>(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/send-for-approval`, {
      method: "POST",
    }),

  adminListUsers: async (opts: QueryParams & { unassigned?: boolean } = {}) => {
    const params = { ...opts, unassigned: opts.unassigned ? 1 : undefined };
    return normalizeList<AdminUser>(await request(`/admin/users${toQuery(params)}`), ["users", "items"]);
  },
  adminCreateUser: (payload: {
    full_name?: string;
    email: string;
    password: string;
    role: string;
    country_id?: number | null;
    country_code?: string | null;
  }) => request<AdminUser>("/admin/users", { method: "POST", body: payload }),
  adminUpdateUserRole: (userId: Id, roleOrPayload: string | { role: string }) =>
    request<AdminUser>(`/admin/users/${id(userId)}/role`, {
      method: "PATCH",
      body: typeof roleOrPayload === "string" ? { role: roleOrPayload } : roleOrPayload,
    }),
  adminAssignUserCountry: (userId: Id, payload: { country_id?: number; country_code?: string }) =>
    request<AdminUser>(`/admin/users/${id(userId)}/country`, { method: "PATCH", body: payload }),
  adminResetUserPassword: (userId: Id, passwordOrPayload?: string | { password?: string }) =>
    request<{ ok: true; user_id: number; email: string; temporary_password: string }>(
      `/admin/users/${id(userId)}/reset-password`,
      {
        method: "POST",
        body:
          typeof passwordOrPayload === "string"
            ? { password: passwordOrPayload }
            : passwordOrPayload || {},
      },
    ),
  adminDeleteUser: (userId: Id) => request<{ ok: true }>(`/admin/users/${id(userId)}`, { method: "DELETE" }),
  adminListCountries: async () =>
    normalizeList<Country>(await request("/admin/countries"), ["countries", "items"]),
  listCountries: async () =>
    normalizeList<Country>(await request("/admin/countries"), ["countries", "items"]),
  adminCreateCountry: (payload: { name: string; code: string; region: string }) =>
    request<Country>("/admin/countries", { method: "POST", body: payload }),
  adminListCountrySchools: async (countryId: Id, opts: { includeClosed?: boolean } = {}) =>
    normalizeList<School>(
      await request(`/admin/countries/${id(countryId)}/schools${toQuery({ includeClosed: opts.includeClosed })}`),
      ["schools", "items"],
    ),
  adminCreateCountrySchool: (countryId: Id, payload: { name: string }) =>
    request<School>(`/admin/countries/${id(countryId)}/schools`, { method: "POST", body: payload }),
  adminUpdateSchool: (schoolId: Id, payload: { name?: string; status?: "active" | "closed" }) =>
    request<School>(`/admin/schools/${id(schoolId)}`, { method: "PATCH", body: payload }),
  adminCloseSchool: (schoolId: Id) =>
    request<School>(`/admin/schools/${id(schoolId)}`, { method: "PATCH", body: { status: "closed" } }),
  adminReopenSchool: (schoolId: Id) =>
    request<School>(`/admin/schools/${id(schoolId)}`, { method: "PATCH", body: { status: "active" } }),
  adminGetProgressRequirements: (countryId?: Id) =>
    request(`/admin/progress-requirements${toQuery({ countryId })}`, { noCache: true }),
  adminSaveProgressRequirements: (countryId: Id, config: unknown) =>
    request(`/admin/progress-requirements${toQuery({ countryId })}`, {
      method: "PUT",
      body: { config },
    }),
  adminBulkSaveProgressRequirements: (countryIds: Id[], config: unknown) =>
    request("/admin/progress-requirements/bulk", {
      method: "PUT",
      body: { countryIds, config },
    }),
  adminGetPermissionsCatalog: () => request<PermissionCatalog>("/admin/permissions/catalog", { noCache: true }),
  adminGetUserPermissions: (userId: Id) =>
    request<PermissionEntry[]>(`/admin/users/${id(userId)}/permissions`, { noCache: true }),
  adminSetUserPermissions: (userId: Id, payload: { permissions: PermissionEntry[] }) =>
    request<{ ok: true }>(`/admin/users/${id(userId)}/permissions`, { method: "PUT", body: payload }),
  adminGetSchoolPrincipals: (schoolId: Id) =>
    request<AdminUser[]>(`/admin/schools/${id(schoolId)}/principals`, { noCache: true }),
  adminSetSchoolPrincipals: (schoolId: Id, payload: { userIds: Id[] }) =>
    request<{ ok: true }>(`/admin/schools/${id(schoolId)}/principals`, { method: "PUT", body: payload }),
  adminGetSchoolAssignments: (schoolId: Id) =>
    request(`/admin/schools/${id(schoolId)}/assignments`, { noCache: true }),
  adminSetSchoolAssignments: (schoolId: Id, payload: unknown) =>
    request<{ ok: true }>(`/admin/schools/${id(schoolId)}/assignments`, { method: "PUT", body: payload }),

  adminGetScenarioQueue: async (opts: QueryParams = {}) =>
    asArray<ScenarioQueueRow>(await request(`/admin/scenarios/queue${toQuery(opts)}`, { noCache: true })),
  adminReviewScenario: (
    scenarioId: Id,
    body: {
      action: "approve" | "revise";
      note?: string | null;
      includedYears?: string[];
      revisionWorkIds?: string[];
    },
  ) => request<{ ok: true }>(`/admin/scenarios/${id(scenarioId)}/review`, { method: "PATCH", body }),
  adminGetApprovalBatchQueue: async (opts: QueryParams = {}) =>
    asArray<ApprovalBatchRow>(await request(`/admin/approval-batches/queue${toQuery(opts)}`, { noCache: true })),
  adminGetApprovalBatch: (batchId: Id) =>
    request<{ batch: ApprovalBatchRow; items: BatchItem[] }>(`/admin/approval-batches/${id(batchId)}`, {
      noCache: true,
    }),
  adminReviewApprovalBatch: (
    batchId: Id,
    body: {
      action: "approve" | "revise";
      note?: string | null;
      includedYears?: string[];
      revisionWorkIds?: string[];
    },
  ) => request<{ ok: true }>(`/admin/approval-batches/${id(batchId)}/review`, { method: "PATCH", body }),
  adminGetRollup: (params: QueryParams = {}) =>
    request(`/admin/reports/rollup${toQuery(params)}`, { noCache: true }),

  managerListUsers: async (opts: QueryParams = {}) =>
    normalizeList<AdminUser>(await request(`/manager/users${toQuery(opts)}`), ["users", "items"]),
  managerCreateUser: (payload: {
    full_name?: string;
    email: string;
    password: string;
    role: "principal" | "hr";
  }) => request<AdminUser>("/manager/users", { method: "POST", body: payload }),
  managerUpdateUserRole: (userId: Id, roleOrPayload: string | { role: string }) =>
    request<AdminUser>(`/manager/users/${id(userId)}/role`, {
      method: "PATCH",
      body: typeof roleOrPayload === "string" ? { role: roleOrPayload } : roleOrPayload,
    }),
  managerUpdateUserEmail: (userId: Id, emailOrPayload: string | { email: string }) =>
    request<AdminUser>(`/manager/users/${id(userId)}/email`, {
      method: "PATCH",
      body: typeof emailOrPayload === "string" ? { email: emailOrPayload } : emailOrPayload,
    }),
  managerResetUserPassword: (userId: Id, passwordOrPayload?: string | { password?: string }) =>
    request<{ ok: true; user_id: number; email: string; temporary_password: string }>(
      `/manager/users/${id(userId)}/reset-password`,
      {
        method: "POST",
        body:
          typeof passwordOrPayload === "string"
            ? { password: passwordOrPayload }
            : passwordOrPayload || {},
      },
    ),
  managerGetPermissionsCatalog: () => request<PermissionCatalog>("/manager/permissions/catalog", { noCache: true }),
  managerGetUserPermissions: (userId: Id) =>
    request<PermissionEntry[]>(`/manager/users/${id(userId)}/permissions`, { noCache: true }),
  managerSetUserPermissions: (userId: Id, payload: { permissions: PermissionEntry[] }) =>
    request<{ ok: true }>(`/manager/users/${id(userId)}/permissions`, { method: "PUT", body: payload }),
  managerGetSchoolPrincipals: (schoolId: Id) =>
    request<AdminUser[]>(`/manager/schools/${id(schoolId)}/principals`, { noCache: true }),
  managerSetSchoolPrincipals: (schoolId: Id, payload: { userIds: Id[] }) =>
    request<{ ok: true }>(`/manager/schools/${id(schoolId)}/principals`, { method: "PUT", body: payload }),
  managerGetSchoolAssignments: (schoolId: Id) =>
    request(`/manager/schools/${id(schoolId)}/assignments`, { noCache: true }),
  managerSetSchoolAssignments: (schoolId: Id, payload: unknown) =>
    request<{ ok: true }>(`/manager/schools/${id(schoolId)}/assignments`, { method: "PUT", body: payload }),
  managerGetReviewQueue: () => request("/manager/review-queue", { noCache: true }),

  expenseSplitTargets: (academicYear: string, yearBasis?: string) =>
    request(`/expense-distributions/targets${toQuery({ academicYear, yearBasis })}`, { noCache: true }),
  getExpenseSplitLastScope: (schoolId: Id, scenarioId: Id) =>
    request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/expense-split/last-scope`, { noCache: true }),
  previewExpenseSplit: (schoolId: Id, scenarioId: Id, payload: unknown) =>
    request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/expense-split/preview`, {
      method: "POST",
      body: payload,
    }),
  applyExpenseSplit: (schoolId: Id, scenarioId: Id, payload: unknown) =>
    request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/expense-split/apply`, {
      method: "POST",
      body: payload,
    }),
  revertExpenseSplit: (schoolId: Id, scenarioId: Id, payload: unknown) =>
    request(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/expense-split/revert`, {
      method: "POST",
      body: payload,
    }),
  bulkSendPreview: (schoolIds: Id[] = []) =>
    request("/schools/bulk-send/preview", { method: "POST", body: { schoolIds }, noCache: true }),
  bulkSendApply: (scenarioIds: Id[] = []) =>
    request("/schools/bulk-send/apply", { method: "POST", body: { scenarioIds } }),
  countryApprovalBatchPreview: (countryId: Id, academicYear: string, yearBasis?: string) =>
    request(`/countries/${id(countryId)}/approval-batches/preview`, {
      method: "POST",
      body: { academicYear, yearBasis },
      noCache: true,
    }),
  countryApprovalBatchYears: (countryId: Id, yearBasis?: string) =>
    request(`/countries/${id(countryId)}/approval-batches/years${toQuery({ yearBasis })}`, { noCache: true }),
  countryApprovalBatchSend: (countryId: Id, academicYear: string, yearBasis?: string) =>
    request(`/countries/${id(countryId)}/approval-batches`, {
      method: "POST",
      body: { academicYear, yearBasis },
    }),
  getProgressRequirements: () => request("/meta/progress-requirements", { noCache: true }),

  exportXlsxUrl: (schoolId: Id, scenarioId: Id, reportCurrency = "usd", mode = "original") =>
    buildApiUrl(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/export-xlsx${toQuery({ reportCurrency, mode })}`),
  exportPdfUrl: (schoolId: Id, scenarioId: Id, reportCurrency = "usd", mode = "original") =>
    buildApiUrl(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/export-xlsx${toQuery({
        reportCurrency,
        mode,
        format: "pdf",
      })}`,
    ),
  downloadXlsx: (schoolId: Id, scenarioId: Id, reportCurrency = "usd", mode = "original") =>
    requestBinary(`/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/export-xlsx${toQuery({ reportCurrency, mode })}`),
  downloadPdf: (schoolId: Id, scenarioId: Id, reportCurrency = "usd", mode = "original") =>
    requestBinary(
      `/schools/${id(schoolId)}/scenarios/${id(scenarioId)}/export-xlsx${toQuery({
        reportCurrency,
        mode,
        format: "pdf",
      })}`,
    ),
  adminExportRollupXlsxUrl: (academicYear?: string) =>
    buildApiUrl(`/admin/reports/rollup.xlsx${toQuery({ academicYear })}`),
};
