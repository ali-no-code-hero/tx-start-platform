import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostgrestLikeError } from "@/lib/server-trace";
import type { ApplicationRow, ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/types";

export const APPLICATION_LIST_PAGE_SIZE_DEFAULT = 25;
export const APPLICATION_LIST_PAGE_SIZE_MAX = 100;
/** Keeps `.in(uuid,...)` filters within typical reverse-proxy URL limits. */
const SEARCH_IDS_CAP = 60;
const LOAN_TYPE_SCAN_LIMIT = 1500;

const MAX_LOAN_FILTERS = 48;
const MAX_LOC_FILTERS = 64;

/** Flat select — no embedded resources (avoids expensive PostgREST joins + RLS per nested row). */
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
  submission_metadata
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
  submission_metadata: Record<string, unknown> | null;
};

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
    submission_metadata: a.submission_metadata,
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
): Promise<{ customerIds: string[]; locationIds: string[]; error: PostgrestLikeError | null }> {
  const ilike = `%${token}%`;

  const [custRes, locRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id")
      .or(
        `first_name.ilike.${ilike},last_name.ilike.${ilike},email.ilike.${ilike},phone.ilike.${ilike}`,
      )
      .limit(SEARCH_IDS_CAP),
    supabase.from("locations").select("id").ilike("name", ilike).limit(SEARCH_IDS_CAP),
  ]);

  if (custRes.error) {
    return { customerIds: [], locationIds: [], error: custRes.error };
  }
  if (locRes.error) {
    return { customerIds: [], locationIds: [], error: locRes.error };
  }

  const customerIds = (custRes.data ?? []).map((row) => (row as { id: string }).id);
  const locationIds = (locRes.data ?? []).map((row) => (row as { id: string }).id);
  return { customerIds, locationIds, error: null };
}

export async function fetchLoanTypeFilterOptions(
  supabase: SupabaseClient,
): Promise<{ options: string[]; hasUnknown: boolean }> {
  const { data, error } = await supabase
    .from("applications")
    .select("type_of_loan")
    .limit(LOAN_TYPE_SCAN_LIMIT);

  if (error || !data) {
    return { options: [], hasUnknown: false };
  }

  const set = new Set<string>();
  let hasUnknown = false;
  for (const row of data) {
    const t = (row as { type_of_loan: string | null }).type_of_loan?.trim() ?? "";
    if (t) set.add(t);
    else hasUnknown = true;
  }
  return {
    options: [...set].sort((a, b) => a.localeCompare(b)),
    hasUnknown,
  };
}

export async function fetchApplicationsPage(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
): Promise<{ rows: ApplicationRow[]; total: number; error: PostgrestLikeError | null }> {
  const { page, pageSize, q } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const token = sanitizeSearchToken(q);
  let customerIdsForSearch: string[] = [];
  let searchLocationIds: string[] = [];

  if (token.length > 0) {
    const resolved = await resolveSearchCustomerAndLocationIds(supabase, token);
    if (resolved.error) {
      return { rows: [], total: 0, error: resolved.error };
    }
    customerIdsForSearch = resolved.customerIds;
    searchLocationIds = resolved.locationIds;
  }

  let dataQuery = supabase
    .from("applications")
    .select(APPLICATION_FLAT_SELECT)
    .order("created_at", { ascending: false });

  let countQuery = supabase
    .from("applications")
    .select("id", { count: "exact", head: true });

  dataQuery = applyApplicationListFilters(dataQuery, params);
  countQuery = applyApplicationListFilters(countQuery, params);

  if (token.length > 0) {
    const ilike = `%${token}%`;
    const orParts: string[] = [`type_of_loan.ilike.${ilike}`];
    const statusMatches = APPLICATION_STATUSES.filter((s) =>
      s.toLowerCase().includes(token.toLowerCase()),
    );
    if (statusMatches.length > 0) {
      orParts.push(`status.in.(${statusMatches.join(",")})`);
    }
    if (customerIdsForSearch.length > 0) {
      orParts.push(`customer_id.in.(${customerIdsForSearch.join(",")})`);
    }
    if (searchLocationIds.length > 0) {
      orParts.push(`location_id.in.(${searchLocationIds.join(",")})`);
    }
    const searchOr = orParts.join(",");
    dataQuery = dataQuery.or(searchOr);
    countQuery = countQuery.or(searchOr);
  }

  const [pageRes, countRes] = await Promise.all([
    dataQuery.range(from, to),
    countQuery,
  ]);

  if (pageRes.error) {
    return { rows: [], total: 0, error: pageRes.error };
  }
  if (countRes.error) {
    return { rows: [], total: 0, error: countRes.error };
  }

  const flatRows = (pageRes.data ?? []) as FlatApplicationRow[];
  const total = countRes.count ?? 0;

  const uniqueCustomerIds = [...new Set(flatRows.map((r) => r.customer_id))];
  const uniqueLocationIds = [
    ...new Set(
      flatRows.map((r) => r.location_id).filter((id): id is string => id != null && id !== ""),
    ),
  ];

  const [customersRes, locationsRes] = await Promise.all([
    uniqueCustomerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone")
          .in("id", uniqueCustomerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    uniqueLocationIds.length > 0
      ? supabase.from("locations").select("id, name").in("id", uniqueLocationIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  if (customersRes.error) {
    return { rows: [], total: 0, error: customersRes.error };
  }
  if (locationsRes.error) {
    return { rows: [], total: 0, error: locationsRes.error };
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
    error: null,
  };
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
