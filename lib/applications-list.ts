import type { SupabaseClient } from "@supabase/supabase-js";

import {
  coercePostgrestLikeError,
  snapshotUnknownError,
  type PostgrestLikeError,
} from "@/lib/server-trace-core";
import type { ApplicationRow, ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/types";

export const APPLICATION_LIST_PAGE_SIZE_DEFAULT = 50;
export const APPLICATION_LIST_PAGE_SIZE_MAX = 100;
/**
 * Shorter tokens skip search (no customer/location resolution, no wide `.or()` / RPC search).
 * Avoids statement_timeout from overly broad ILIKE + OR plans.
 */
export const APPLICATION_LIST_MIN_SEARCH_CHARS = 5;
/** Keeps `.in(uuid,...)` filters within typical reverse-proxy URL limits. */
const SEARCH_IDS_CAP = 60;
const MAX_LOAN_FILTERS = 48;
const MAX_LOC_FILTERS = 64;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function allTokens(v: string | string[] | undefined, max: number): string[] {
  if (v === undefined) return [];
  const parts = Array.isArray(v) ? v : [v];
  return parts
    .flatMap((p) => p.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Keyset cursor: `created_at` ISO string from the DB + row `id` (stable with `order by created_at desc, id desc`). */
export type ApplicationsListKeysetCursor = {
  created_at: string;
  id: string;
};

export type ApplicationsListQueryState = {
  pageSize: number;
  q: string;
  status: ApplicationStatus | "all";
  urgent: "all" | "yes" | "no";
  locationIds: string[];
  unassignedOnly: boolean;
  loanTypes: string[];
  /** Next page: rows strictly older than this tuple. Mutually exclusive with `before` in normal use. */
  after: ApplicationsListKeysetCursor | null;
  /** Previous page: rows strictly newer than this tuple. Mutually exclusive with `after` in normal use. */
  before: ApplicationsListKeysetCursor | null;
};

function isValidIsoTimestamptz(s: string): boolean {
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function serializeApplicationsListCursor(c: ApplicationsListKeysetCursor): string {
  return encodeURIComponent(JSON.stringify({ t: c.created_at, i: c.id }));
}

export function parseApplicationsListCursor(raw: string | undefined): ApplicationsListKeysetCursor | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as { t?: unknown; i?: unknown };
    if (typeof o.t !== "string" || typeof o.i !== "string" || !o.t || !o.i) return null;
    if (!isUuid(o.i)) return null;
    if (!isValidIsoTimestamptz(o.t)) return null;
    return { created_at: o.t, id: o.i };
  } catch {
    return null;
  }
}

export function parseApplicationsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ApplicationsListQueryState {
  const rawSize = Number.parseInt(firstParam(raw.pageSize) ?? "", 10);
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(APPLICATION_LIST_PAGE_SIZE_MAX, Math.max(10, rawSize))
    : APPLICATION_LIST_PAGE_SIZE_DEFAULT;
  const q = (firstParam(raw.q) ?? "").trim();
  const st = firstParam(raw.status) ?? "all";
  const status =
    st === "all"
      ? "all"
      : (APPLICATION_STATUSES as readonly string[]).includes(st)
        ? (st as ApplicationStatus)
        : "all";

  const u = firstParam(raw.urgent);
  const urgent = u === "yes" || u === "no" ? u : "all";

  const unassignedRaw = firstParam(raw.unassigned);
  const unassignedOnly = unassignedRaw === "1" || unassignedRaw === "true";

  const locTokens = allTokens(raw.loc, MAX_LOC_FILTERS);
  const locationIds = locTokens.filter(isUuid);

  const loanTypes = allTokens(raw.loan, MAX_LOAN_FILTERS);

  const after = parseApplicationsListCursor(firstParam(raw.after));
  const beforeRaw = parseApplicationsListCursor(firstParam(raw.before));
  const before = after ? null : beforeRaw;

  return {
    pageSize,
    q,
    status,
    urgent,
    locationIds,
    unassignedOnly,
    loanTypes,
    after,
    before,
  };
}

/** Strip LIKE wildcards and delimiter chars so .or() filter strings stay safe. */
function sanitizeSearchToken(raw: string): string {
  return raw
    .trim()
    .slice(0, 120)
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applicationStatusesMatchingSearchToken(token: string): ApplicationStatus[] {
  const t = token.trim().toLowerCase();
  // `"".includes("")` is true in JS — empty token must not return every status or the RPC
  // treats search as active (non-empty p_search_statuses) and runs the heavy matching_ids path.
  if (t.length === 0) return [];
  return APPLICATION_STATUSES.filter((s) => s.toLowerCase().includes(t));
}

function escapePostgrestInToken(s: string): string {
  if (/^[a-zA-Z0-9 _./+\-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

type PostgrestFailureParts = {
  error: unknown;
  status: number;
  statusText: string;
};

function getPostgrestUrlLength(builder: unknown): number | undefined {
  if (builder && typeof builder === "object" && "url" in builder) {
    const u = (builder as { url?: URL }).url;
    if (u instanceof URL) return u.toString().length;
  }
  return undefined;
}

export type ApplicationsListFetchFailure = {
  rows: ApplicationRow[];
  total: number | null;
  hasNextPage: boolean;
  error: PostgrestLikeError;
  logContext: Record<string, unknown>;
};

function buildFailure(
  step: string,
  parts: PostgrestFailureParts,
  requestUrlLength?: number,
): ApplicationsListFetchFailure {
  return {
    rows: [],
    total: 0,
    hasNextPage: false,
    error: coercePostgrestLikeError(parts.error, {
      status: parts.status,
      statusText: parts.statusText,
    }),
    logContext: {
      step,
      httpStatus: parts.status,
      httpStatusText: parts.statusText,
      requestUrlLength,
      errorSnapshot: snapshotUnknownError(parts.error),
    },
  };
}

type FlatApplicationRow = {
  id: string;
  customer_id: string;
  status: ApplicationStatus;
  created_at: string;
  urgent_same_day: boolean;
  loan_amount_requested: number | null;
  loan_amount_approved: number | null;
  type_of_loan: string | null;
  location_id: string | null;
  /** From `submission_metadata->needs_location_review` (boolean, string, or null). */
  needs_location_review: unknown;
};

function parseNeedsLocationReviewFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return Boolean(raw);
}

function mapFlatToApplicationRows(
  apps: FlatApplicationRow[],
  customersById: Map<
    string,
    { id: string; first_name: string; last_name: string; email: string; phone: string | null }
  >,
  locationsById: Map<string, { name: string }>,
): ApplicationRow[] {
  return apps.map((a) => ({
    id: a.id,
    status: a.status,
    created_at: a.created_at,
    urgent_same_day: a.urgent_same_day,
    loan_amount_requested: a.loan_amount_requested,
    loan_amount_approved: a.loan_amount_approved,
    type_of_loan: a.type_of_loan,
    location_id: a.location_id,
    submission_metadata:
      a.needs_location_review == null
        ? null
        : { needs_location_review: parseNeedsLocationReviewFlag(a.needs_location_review) },
    customers: customersById.get(a.customer_id) ?? null,
    locations: a.location_id ? locationsById.get(a.location_id) ?? null : null,
  }));
}

/**
 * Shared filters for list + count queries. Uses a loose type so the same logic applies to
 * different PostgREST select shapes (full row vs id-only head count).
 */
function applyApplicationListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder differs per select()
  q: any,
  params: ApplicationsListQueryState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { status, urgent, locationIds, unassignedOnly, loanTypes } = params;

  if (status !== "all") {
    q = q.eq("status", status);
  }

  if (urgent === "yes") {
    q = q.eq("urgent_same_day", true);
  } else if (urgent === "no") {
    q = q.eq("urgent_same_day", false);
  }

  const hasLoc = locationIds.length > 0 || unassignedOnly;
  if (hasLoc) {
    if (unassignedOnly && locationIds.length === 0) {
      q = q.is("location_id", null);
    } else if (!unassignedOnly && locationIds.length > 0) {
      q = q.in("location_id", locationIds);
    } else {
      q = q.or(`location_id.is.null,location_id.in.(${locationIds.join(",")})`);
    }
  }

  if (loanTypes.length > 0) {
    const wantUnknown = loanTypes.includes("Unknown");
    const known = loanTypes.filter((l) => l !== "Unknown");
    if (wantUnknown && known.length > 0) {
      const inList = known.map(escapePostgrestInToken).join(",");
      q = q.or(`type_of_loan.is.null,type_of_loan.eq.,type_of_loan.in.(${inList})`);
    } else if (wantUnknown) {
      q = q.or("type_of_loan.is.null,type_of_loan.eq.");
    } else {
      q = q.in("type_of_loan", known);
    }
  }

  return q;
}

async function resolveSearchCustomerAndLocationIds(
  supabase: SupabaseClient,
  token: string,
): Promise<
  | { ok: true; customerIds: string[]; locationIds: string[] }
  | { ok: false; failure: ApplicationsListFetchFailure }
> {
  const ilike = `%${token}%`;

  const custQuery = supabase
    .from("customers")
    .select("id")
    .or(
      `first_name.ilike.${ilike},last_name.ilike.${ilike},email.ilike.${ilike},phone.ilike.${ilike}`,
    )
    .limit(SEARCH_IDS_CAP);
  const locQuery = supabase.from("locations").select("id").ilike("name", ilike).limit(SEARCH_IDS_CAP);

  const custUrlLen = getPostgrestUrlLength(custQuery);
  const locUrlLen = getPostgrestUrlLength(locQuery);

  const [custRes, locRes] = await Promise.all([custQuery, locQuery]);

  if (custRes.error) {
    return {
      ok: false,
      failure: buildFailure(
        "applications_search_customers",
        { error: custRes.error, status: custRes.status, statusText: custRes.statusText },
        custUrlLen,
      ),
    };
  }
  if (locRes.error) {
    return {
      ok: false,
      failure: buildFailure(
        "applications_search_locations",
        { error: locRes.error, status: locRes.status, statusText: locRes.statusText },
        locUrlLen,
      ),
    };
  }

  const customerIds = (custRes.data ?? []).map((row) => (row as { id: string }).id);
  const locationIds = (locRes.data ?? []).map((row) => (row as { id: string }).id);
  return { ok: true, customerIds, locationIds };
}

/** Resolved customer/location id lists for search token (empty when no search). */
export type ApplicationsListSearchResolved = {
  token: string;
  customerIds: string[];
  locationIds: string[];
};

export async function resolveApplicationsListSearch(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
): Promise<
  | { ok: true; resolved: ApplicationsListSearchResolved }
  | { ok: false; failure: ApplicationsListFetchFailure }
> {
  const token = sanitizeSearchToken(params.q);
  if (!token || token.length < APPLICATION_LIST_MIN_SEARCH_CHARS) {
    return { ok: true, resolved: { token: "", customerIds: [], locationIds: [] } };
  }
  const result = await resolveSearchCustomerAndLocationIds(supabase, token);
  if (!result.ok) return result;
  return {
    ok: true,
    resolved: {
      token,
      customerIds: result.customerIds,
      locationIds: result.locationIds,
    },
  };
}

export function applicationsListHasActiveFilters(s: ApplicationsListQueryState): boolean {
  return (
    s.q.trim().length > 0 ||
    s.status !== "all" ||
    s.urgent !== "all" ||
    s.locationIds.length > 0 ||
    s.unassignedOnly ||
    s.loanTypes.length > 0
  );
}

/**
 * True when list/count queries apply non-default DB predicates (matches what the server actually filters).
 * Short search text (below MIN_SEARCH_CHARS) is ignored for loading, so it is not "effective".
 */
export function applicationsListHasEffectiveListFilters(s: ApplicationsListQueryState): boolean {
  return (
    s.status !== "all" ||
    s.urgent !== "all" ||
    s.locationIds.length > 0 ||
    s.unassignedOnly ||
    s.loanTypes.length > 0 ||
    s.q.trim().length >= APPLICATION_LIST_MIN_SEARCH_CHARS
  );
}

function applyApplicationsListSearchOr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder
  q: any,
  resolved: ApplicationsListSearchResolved,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!resolved.token) return q;
  const ilike = `%${resolved.token}%`;
  const orParts: string[] = [`type_of_loan.ilike.${ilike}`];
  const statusMatches = APPLICATION_STATUSES.filter((s) =>
    s.toLowerCase().includes(resolved.token.toLowerCase()),
  );
  if (statusMatches.length > 0) {
    orParts.push(`status.in.(${statusMatches.join(",")})`);
  }
  if (resolved.customerIds.length > 0) {
    orParts.push(`customer_id.in.(${resolved.customerIds.join(",")})`);
  }
  if (resolved.locationIds.length > 0) {
    orParts.push(`location_id.in.(${resolved.locationIds.join(",")})`);
  }
  return q.or(orParts.join(","));
}

/**
 * Total rows matching current filters + search (RLS-scoped). Separate HEAD request using
 * planner statistics (`planned`) — fast and stable for large tables; can differ slightly from exact COUNT.
 */
export async function fetchApplicationsMatchingCount(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
  resolved: ApplicationsListSearchResolved,
): Promise<number | null> {
  if (resolved.token.length > 0) {
    return null;
  }
  if (!applicationsListHasEffectiveListFilters(params)) {
    return null;
  }
  try {
    let q = supabase.from("applications").select("id", { count: "planned", head: true });
    q = applyApplicationListFilters(q, params);
    q = applyApplicationsListSearchOr(q, resolved);
    const { count, error } = await q;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

export async function fetchLoanTypeFilterOptions(
  supabase: SupabaseClient,
): Promise<{ options: string[]; hasUnknown: boolean }> {
  const { data, error } = await supabase.rpc("applications_distinct_loan_type_options");

  if (!error && data != null && typeof data === "object" && !Array.isArray(data)) {
    const o = data as { types?: unknown; has_unknown?: unknown };
    const rawTypes = o.types;
    const options = Array.isArray(rawTypes)
      ? rawTypes.filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
    return {
      options: [...new Set(options.map((t) => t.trim()))].sort((a, b) => a.localeCompare(b)),
      hasUnknown: Boolean(o.has_unknown),
    };
  }

  // No table scan fallback: it matched multi-second PostgREST plans under RLS. Fix RPC / migration instead.
  return { options: [], hasUnknown: false };
}

export type ApplicationsListFetchResult = {
  rows: ApplicationRow[];
  /** Exact row count when the last page is known; `null` when more rows may exist after this page. */
  total: number | null;
  hasNextPage: boolean;
  error: PostgrestLikeError | null;
  /** Merge into Vercel log `diag` when `error` is set. */
  logContext?: Record<string, unknown>;
  /** How the applications rows were loaded (for perf logs). */
  listDataSource?: "rpc" | "rest";
};

/** Filled by `fetchApplicationsPage` when passed in `options.timings` (for server-side diagnostics). */
export type ApplicationsListFetchTimings = {
  applicationsSelectMs?: number;
  batchHydrateMs?: number;
};

async function hydrateFlatApplicationRows(
  supabase: SupabaseClient,
  flatRows: FlatApplicationRow[],
  options?: { timings?: ApplicationsListFetchTimings },
): Promise<ApplicationsListFetchResult | ApplicationsListFetchFailure> {
  const uniqueCustomerIds = [...new Set(flatRows.map((r) => r.customer_id))];
  const uniqueLocationIds = [
    ...new Set(
      flatRows.map((r) => r.location_id).filter((id): id is string => id != null && id !== ""),
    ),
  ];

  const customersQ =
    uniqueCustomerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone")
          .in("id", uniqueCustomerIds)
      : null;
  const locationsQ =
    uniqueLocationIds.length > 0
      ? supabase.from("locations").select("id, name").in("id", uniqueLocationIds)
      : null;

  const customersUrlLen = customersQ ? getPostgrestUrlLength(customersQ) : undefined;
  const locationsUrlLen = locationsQ ? getPostgrestUrlLength(locationsQ) : undefined;

  const hydrateStarted = performance.now();
  const [customersRes, locationsRes] = await Promise.all([
    customersQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null, status: 200, statusText: "OK" }),
    locationsQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null, status: 200, statusText: "OK" }),
  ]);
  if (options?.timings) {
    options.timings.batchHydrateMs = Math.round(performance.now() - hydrateStarted);
  }

  if (customersRes.error) {
    return buildFailure(
      "applications_list_customers_batch",
      {
        error: customersRes.error,
        status: customersRes.status,
        statusText: customersRes.statusText,
      },
      customersUrlLen,
    );
  }
  if (locationsRes.error) {
    return buildFailure(
      "applications_list_locations_batch",
      {
        error: locationsRes.error,
        status: locationsRes.status,
        statusText: locationsRes.statusText,
      },
      locationsUrlLen,
    );
  }

  const customersById = new Map<
    string,
    { id: string; first_name: string; last_name: string; email: string; phone: string | null }
  >();
  for (const row of customersRes.data ?? []) {
    const c = row as {
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
    };
    customersById.set(c.id, c);
  }

  const locationsById = new Map<string, { name: string }>();
  for (const row of locationsRes.data ?? []) {
    const l = row as { id: string; name: string };
    locationsById.set(l.id, { name: l.name });
  }

  return {
    rows: mapFlatToApplicationRows(flatRows, customersById, locationsById),
    total: null,
    hasNextPage: false,
    error: null,
  };
}

export async function fetchApplicationsPage(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
  resolved: ApplicationsListSearchResolved,
  options?: { timings?: ApplicationsListFetchTimings },
): Promise<ApplicationsListFetchResult> {
  try {
    const { pageSize } = params;
    const knownLoanTypes = params.loanTypes.filter((l) => l !== "Unknown");
    const useBefore = params.before != null;
    const selectStarted = performance.now();
    const { data: rpcData, error: rpcError } = await supabase.rpc("applications_list_flat_page", {
      p_limit: pageSize + 1,
      p_after_created_at: useBefore ? null : params.after?.created_at ?? null,
      p_after_id: useBefore ? null : params.after?.id ?? null,
      p_before_created_at: useBefore ? params.before!.created_at : null,
      p_before_id: useBefore ? params.before!.id : null,
      p_status: params.status === "all" ? "all" : params.status,
      p_urgent: params.urgent,
      p_filter_by_location: params.locationIds.length > 0 || params.unassignedOnly,
      p_unassigned_only: params.unassignedOnly,
      p_filter_location_ids: params.locationIds,
      p_has_loan_filter: params.loanTypes.length > 0,
      p_loan_unknown: params.loanTypes.includes("Unknown"),
      p_loan_types: knownLoanTypes,
      p_search_token: resolved.token,
      p_search_customer_ids: resolved.customerIds,
      p_search_location_ids: resolved.locationIds,
      p_search_statuses: applicationStatusesMatchingSearchToken(resolved.token),
    });
    if (options?.timings) {
      options.timings.applicationsSelectMs = Math.round(performance.now() - selectStarted);
    }

    if (rpcError) {
      const f = buildFailure(
        "applications_list_rpc",
        { error: rpcError, status: 500, statusText: "RPC Error" },
        undefined,
      );
      return {
        rows: f.rows,
        total: f.total,
        hasNextPage: f.hasNextPage,
        error: f.error,
        logContext: { ...f.logContext, listFetchMode: "applications_list_flat_page_rpc_keyset" },
        listDataSource: "rpc",
      };
    }

    const rawFlat = (rpcData ?? []) as FlatApplicationRow[];

    let hasNextPage: boolean;
    let total: number | null;
    let flatRows: FlatApplicationRow[];

    const atFirstAnchor = params.after == null && params.before == null;

    if (rawFlat.length === 0) {
      hasNextPage = false;
      flatRows = [];
      total = atFirstAnchor ? 0 : null;
    } else if (rawFlat.length > pageSize) {
      hasNextPage = true;
      total = null;
      flatRows = rawFlat.slice(0, pageSize);
    } else {
      hasNextPage = false;
      total = atFirstAnchor ? rawFlat.length : null;
      flatRows = rawFlat;
    }

    const hydrated = await hydrateFlatApplicationRows(supabase, flatRows, options);
    if (hydrated.error) {
      return {
        ...hydrated,
        listDataSource: "rpc",
      };
    }

    return {
      rows: hydrated.rows,
      total,
      hasNextPage,
      error: null,
      listDataSource: "rpc",
    };
  } catch (unexpected) {
    return {
      rows: [],
      total: 0,
      hasNextPage: false,
      error: coercePostgrestLikeError(unexpected, { status: 0, statusText: "" }),
      logContext: {
        step: "applications_list_unexpected",
        errorSnapshot: snapshotUnknownError(unexpected),
        exceptionName: unexpected instanceof Error ? unexpected.name : typeof unexpected,
      },
    };
  }
}

export function applicationsListSearchParams(state: ApplicationsListQueryState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.after) p.set("after", serializeApplicationsListCursor(state.after));
  if (state.before) p.set("before", serializeApplicationsListCursor(state.before));
  if (state.pageSize !== APPLICATION_LIST_PAGE_SIZE_DEFAULT) {
    p.set("pageSize", String(state.pageSize));
  }
  if (state.q) p.set("q", state.q);
  if (state.status !== "all") p.set("status", state.status);
  if (state.urgent !== "all") p.set("urgent", state.urgent);
  if (state.unassignedOnly) p.set("unassigned", "1");
  for (const id of state.locationIds) {
    p.append("loc", id);
  }
  for (const lt of state.loanTypes) {
    p.append("loan", lt);
  }
  return p;
}
