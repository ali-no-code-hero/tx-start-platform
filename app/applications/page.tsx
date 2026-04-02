import { ApplicationsTable } from "@/components/applications-table";
import { getProfile } from "@/lib/auth";
import {
  applicationsListSearchParams,
  fetchApplicationsPage,
  fetchLoanTypeFilterOptions,
  parseApplicationsListQuery,
} from "@/lib/applications-list";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseQueryErrorWithRequest } from "@/lib/server-trace";
import { redirect } from "next/navigation";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/account/unauthorized");

  const raw = await searchParams;
  const listQuery = parseApplicationsListQuery(raw);

  const supabase = await createClient();

  let locationsForFilters: { id: string; name: string }[] = [];
  if (profile.role !== "customer") {
    const { data: locs } = await supabase.from("locations").select("id, name").order("name");
    locationsForFilters = locs ?? [];
  }

  const { rows, total, hasNextPage, error, logContext } = await fetchApplicationsPage(
    supabase,
    listQuery,
  );

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

  const loanTypesMeta = await fetchLoanTypeFilterOptions(supabase);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          {profile.role === "customer"
            ? "Your loan applications and status updates."
            : profile.role === "staff"
              ? `Applications for your assigned location (${listQuery.pageSize} per page; filters and search apply across all you can access).`
              : `All locations (${listQuery.pageSize} per page; filters and search apply across the full dataset).`}
        </p>
      </div>
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
    </div>
  );
}
