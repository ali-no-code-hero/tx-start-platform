import { ApplicationsTable } from "@/components/applications-table";
import {
  applicationsListSearchParams,
  fetchApplicationsPage,
  type ApplicationsListFetchTimings,
  type ApplicationsListQueryState,
  type ApplicationsListSearchResolved,
} from "@/lib/applications-list";
import type { Profile } from "@/lib/auth";
import type { ServerPhaseTimer } from "@/lib/server-phase-timing";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseQueryErrorWithRequest } from "@/lib/server-trace";
import { redirect } from "next/navigation";

export async function ApplicationsListSection({
  timer,
  profile,
  listQuery,
  resolved,
  locationsForFilters,
}: {
  timer: ServerPhaseTimer;
  profile: Profile;
  listQuery: ApplicationsListQueryState;
  resolved: ApplicationsListSearchResolved;
  locationsForFilters: { id: string; name: string }[];
}) {
  const supabase = await createClient();
  const listFetchTimings: ApplicationsListFetchTimings = {};

  const listResult = await timer.timeAsync("applications_list", () =>
    fetchApplicationsPage(supabase, listQuery, resolved, {
      timings: listFetchTimings,
    }),
  );

  const { rows, total, hasNextPage, error, logContext } = listResult;

  timer.finish({
    profileRole: profile.role,
    listKeysetAfter: listQuery.after != null,
    listKeysetBefore: listQuery.before != null,
    pageSize: listQuery.pageSize,
    hasSearch: listQuery.q.trim().length > 0,
    qUrlLen: listQuery.q.length,
    searchTokenLen: resolved.token.length,
    listDataSource: listResult.listDataSource ?? null,
    filterSummary: {
      status: listQuery.status,
      urgent: listQuery.urgent,
      locationIds: listQuery.locationIds.length,
      loanTypes: listQuery.loanTypes.length,
      unassignedOnly: listQuery.unassignedOnly,
    },
    listFetchTimings,
    rowCount: rows.length,
    hasNextPage,
    totalApprox: total,
  });

  if (error) {
    await logSupabaseQueryErrorWithRequest(
      "applications_list_query_failed",
      error,
      {
        route: "/applications",
        profileRole: profile.role,
        profileId: profile.id,
        locationId: profile.location_id,
        query: "applications_paginated_list",
        listQuery: {
          pageSize: listQuery.pageSize,
          qLen: listQuery.q.length,
          status: listQuery.status,
          urgent: listQuery.urgent,
          locationFilterCount: listQuery.locationIds.length,
          loanTypeFilterCount: listQuery.loanTypes.length,
          unassignedOnly: listQuery.unassignedOnly,
          listKeysetAfter: listQuery.after != null,
          listKeysetBefore: listQuery.before != null,
        },
      },
      logContext
        ? {
            ...logContext,
            listFetchMode: "applications_list_flat_page_rpc_keyset",
          }
        : null,
    );
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load applications:{" "}
        {[error.message, error.details, error.code].filter(Boolean).join(" — ") ||
          "Something went wrong loading this list."}
      </div>
    );
  }

  if (rows.length === 0 && (listQuery.after != null || listQuery.before != null)) {
    redirect(
      `/applications?${applicationsListSearchParams({ ...listQuery, after: null, before: null }).toString()}`,
    );
  }

  const hasPreviousPage = listQuery.after != null || listQuery.before != null;

  return (
    <ApplicationsTable
      rows={rows}
      totalCount={total}
      hasNextPage={hasNextPage}
      hasPreviousPage={hasPreviousPage}
      pageSize={listQuery.pageSize}
      queryState={listQuery}
      isAdmin={profile.role === "admin"}
      isCustomer={profile.role === "customer"}
      locations={locationsForFilters}
      deferLoanTypeOptions
    />
  );
}

export function ApplicationsListSectionFallback() {
  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-card p-4 animate-pulse"
      aria-hidden
    >
      <div className="h-10 max-w-md rounded-md bg-muted" />
      <div className="h-32 rounded-md bg-muted" />
      <div className="h-64 rounded-md bg-muted" />
    </div>
  );
}
