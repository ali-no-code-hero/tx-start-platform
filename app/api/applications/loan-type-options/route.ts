import { fetchLoanTypeFilterOptions } from "@/lib/applications-list";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Authenticated JSON for loan-type filter chips. Loaded client-side after the list shell
 * so the main /applications RSC path avoids the heavy distinct RPC.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { options, hasUnknown } = await fetchLoanTypeFilterOptions(supabase);
  return NextResponse.json({ options, has_unknown: hasUnknown });
}
