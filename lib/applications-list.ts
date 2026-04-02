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
/** Keeps `.in(uuid,...)` filters within typical reverse-proxy URL limits. */
const SEARCH_IDS_CAP = 60;
const MAX_LOAN_FILTERS = 48;
const MAX_LOC_FILTERS = 64;

/** Flat select — no embedded resources; only list UI fields (avoids wide jsonb on every row). */
const APPLICATION_FLAT_SELECT = `
  id,
  customer_id,
  status,
  created_at,
  urgent_same_day,
  loan_amount_requested,
  loan_amount_approved,
  type_of_loan,
  location_id,
  needs_location_review:submission_metadata->needs_location_review
`;

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

export type ApplicationsListQueryState = {
  page: number;
  pageSize: number;
  q: string;
  status: ApplicationStatus | "all";
  urgent: "all" | "yes" | "no";
  locationIds: string[];
  unassignedOnly: boolean;
  loanTypes: string[];
};

export function parseApplicationsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ApplicationsListQueryState {
  const page = Math.max(1, Number.parseInt(firstParam(raw.page) ?? "1", 10) || 1);
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

  return {
    page,
    pageSize,
    q,
    status,
    urgent,
    locationIds,
    unassignedOnly,
    loanTypes,
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
  if (!token) {
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

  const { data: rows, error: fallbackError } = await supabase
    .from("applications")
    .select("type_of_loan")
    .limit(500);

  if (fallbackError || !rows) {
    return { options: [], hasUnknown: false };
  }

  const set = new Set<string>();
  let hasUnknown = false;
  for (const row of rows) {
    const t = (row as { type_of_loan: string | null }).type_of_loan?.trim() ?? "";
    if (t) set.add(t);
    else hasUnknown = true;
  }
  return {
    options: [...set].sort((a, b) => a.localeCompare(b)),
    hasUnknown,
  };
}

export type ApplicationsListFetchResult = {
  rows: ApplicationRow[];
  /** Exact row count when the last page is known; `null` when more rows may exist after this page. */
  total: number | null;
  hasNextPage: boolean;
  error: PostgrestLikeError | null;
  /** Merge into Vercel log `diag` when `error` is set. */
  logContext?: Record<string, unknown>;
};

export async function fetchApplicationsPage(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
  resolved: ApplicationsListSearchResolved,
): Promise<ApplicationsListFetchResult> {
  try {
    const { page, pageSize } = params;
    const from = (page - 1) * pageSize;
    /** Fetch one extra row so we know if another page exists without a global COUNT (avoids statement_timeout on large tables). */
    const to = from + pageSize;

    // Omit PostgREST count on this request: use pageSize+1 to detect "next page".
    let dataQuery = supabase
      .from("applications")
      .select(APPLICATION_FLAT_SELECT)
      .order("created_at", { ascending: false });

    dataQuery = applyApplicationListFilters(dataQuery, params);
    dataQuery = applyApplicationsListSearchOr(dataQuery, resolved);

    const pagedQuery = dataQuery.range(from, to);
    const listUrlLen = getPostgrestUrlLength(pagedQuery);
    const pageRes = await pagedQuery;

    if (pageRes.error) {
      return buildFailure(
        "applications_list_page",
        { error: pageRes.error, status: pageRes.status, statusText: pageRes.statusText },
        listUrlLen,
      );
    }

    const rawFlat = (pageRes.data ?? []) as FlatApplicationRow[];

    let hasNextPage: boolean;
    let total: number | null;
    let flatRows: FlatApplicationRow[];

    if (rawFlat.length === 0) {
      hasNextPage = false;
      flatRows = [];
      total = from === 0 ? 0 : null;
    } else if (rawFlat.length > pageSize) {
      hasNextPage = true;
      total = null;
      flatRows = rawFlat.slice(0, pageSize);
    } else {
      hasNextPage = false;
      total = from + rawFlat.length;
      flatRows = rawFlat;
    }

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

    const [customersRes, locationsRes] = await Promise.all([
      customersQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null, status: 200, statusText: "OK" }),
      locationsQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null, status: 200, statusText: "OK" }),
    ]);

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
      total,
      hasNextPage,
      error: null,
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
  if (state.page > 1) p.set("page", String(state.page));
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
