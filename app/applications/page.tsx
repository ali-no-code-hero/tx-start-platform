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

  const [{ rows, total, error }, loanTypesMeta] = await Promise.all([
    fetchApplicationsPage(supabase, listQuery),
    fetchLoanTypeFilterOptions(supabase),
  ]);

  if (error) {
    await logSupabaseQueryErrorWithRequest("applications_list_query_failed", error, {
      route: "/applications",
      profileRole: profile.role,
      profileId: profile.id,
      locationId: profile.location_id,
      query: "applications_paginated_list",
    });
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load applications: {error.message}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / listQuery.pageSize));
  if (total > 0 && listQuery.page > totalPages) {
    redirect(
      `/applications?${applicationsListSearchParams({ ...listQuery, page: totalPages }).toString()}`,
    );
  }

  const safePage = Math.min(listQuery.page, totalPages);

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
