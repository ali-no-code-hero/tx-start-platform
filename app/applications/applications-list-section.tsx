import { ApplicationsTable } from "@/components/applications-table";
import {
  applicationsListSearchParams,
  fetchApplicationsPage,
  fetchLoanTypeFilterOptions,
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

  const [listResult, loanTypesMeta] = await Promise.all([
    timer.timeAsync("applications_list", () =>
      fetchApplicationsPage(supabase, listQuery, resolved, {
        timings: listFetchTimings,
      }),
    ),
    timer.timeAsync("loan_type_options_rpc", () => fetchLoanTypeFilterOptions(supabase)),
  ]);

  const { rows, total, hasNextPage, error, logContext } = listResult;

  timer.finish({
    profileRole: profile.role,
    page: listQuery.page,
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
          page: listQuery.page,
          pageSize: listQuery.pageSize,
          qLen: listQuery.q.length,
          status: listQuery.status,
          urgent: listQuery.urgent,
          locationFilterCount: listQuery.locationIds.length,
          loanTypeFilterCount: listQuery.loanTypes.length,
          unassignedOnly: listQuery.unassignedOnly,
        },
      },
      logContext
        ? {
            ...logContext,
            listFetchMode: "single_rest_select_no_count_overshoot_one",
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

  if (rows.length === 0 && listQuery.page > 1) {
    redirect(
      `/applications?${applicationsListSearchParams({ ...listQuery, page: 1 }).toString()}`,
    );
  }

  const totalPages =
    total != null ? Math.max(1, Math.ceil(total / listQuery.pageSize)) : null;
  if (total != null && total > 0 && totalPages != null && listQuery.page > totalPages) {
    redirect(
      `/applications?${applicationsListSearchParams({ ...listQuery, page: totalPages }).toString()}`,
    );
  }

  const safePage =
    totalPages != null ? Math.min(listQuery.page, totalPages) : listQuery.page;

  return (
    <ApplicationsTable
      rows={rows}
      totalCount={total}
      hasNextPage={hasNextPage}
      page={safePage}
      pageSize={listQuery.pageSize}
      queryState={listQuery}
      isAdmin={profile.role === "admin"}
      isCustomer={profile.role === "customer"}
      locations={locationsForFilters}
      loanTypeOptions={loanTypesMeta.options}
      hasUnknownLoanType={loanTypesMeta.hasUnknown}
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
