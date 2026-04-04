import { fetchLoanTypeFilterOptions } from "@/lib/applications-list";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  coercePostgrestLikeError,
  getVercelRequestTrace,
  logSupabaseQueryErrorWithRequest,
  snapshotUnknownError,
} from "@/lib/server-trace";
import { NextResponse } from "next/server";

function deployMeta() {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  };
}

/**
 * Authenticated JSON for loan-type filter chips. Loaded client-side after the list shell
 * so the main /applications RSC path avoids the heavy distinct RPC.
 */
export async function GET() {
  const route = "/api/applications/loan-type-options";
  const wallStart = performance.now();

  try {
    const profileStart = performance.now();
    const profile = await getProfile();
    const profileMs = Math.round(performance.now() - profileStart);

    if (!profile) {
      const vercel = await getVercelRequestTrace();
      console.warn(
        JSON.stringify({
          source: "tx-star-crm",
          event: "api_loan_type_options_unauthorized",
          severity: "warn",
          ctx: { route, profileMs, vercel },
          deploy: deployMeta(),
          ts: new Date().toISOString(),
        }),
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientStart = performance.now();
    const supabase = await createClient();
    const clientMs = Math.round(performance.now() - clientStart);

    const result = await fetchLoanTypeFilterOptions(supabase);

    if (result.error) {
      await logSupabaseQueryErrorWithRequest(
        "api_loan_type_options_failed",
        result.error,
        {
          route,
          profileRole: profile.role,
          profileId: profile.id,
          locationId: profile.location_id,
          query: "applications_distinct_loan_type_options",
        },
        {
          rpcMs: result.rpcMs,
          profileMs,
          clientMs,
          unexpectedShape: result.unexpectedShape ?? false,
        },
      );
      return NextResponse.json(
        {
          error: "Failed to load loan type options",
          options: [],
          has_unknown: false,
        },
        { status: 502 },
      );
    }

    const totalMs = Math.round(performance.now() - wallStart);
    const vercel = await getVercelRequestTrace();
    console.info(
      JSON.stringify({
        source: "tx-star-crm",
        event: "api_loan_type_options_ok",
        severity: "info",
        ctx: {
          route,
          profileRole: profile.role,
          profileId: profile.id,
          locationId: profile.location_id,
          optionCount: result.options.length,
          hasUnknown: result.hasUnknown,
          rpcMs: result.rpcMs,
          profileMs,
          clientMs,
          totalMs,
          vercel,
        },
        deploy: deployMeta(),
        ts: new Date().toISOString(),
      }),
    );

    return NextResponse.json({ options: result.options, has_unknown: result.hasUnknown });
  } catch (unexpected) {
    const err = coercePostgrestLikeError(unexpected, { status: 0, statusText: "" });
    await logSupabaseQueryErrorWithRequest(
      "api_loan_type_options_unexpected",
      err,
      {
        route,
        query: "applications_distinct_loan_type_options",
      },
      {
        totalMs: Math.round(performance.now() - wallStart),
        errorSnapshot: snapshotUnknownError(unexpected),
        exceptionName: unexpected instanceof Error ? unexpected.name : typeof unexpected,
      },
    );
    return NextResponse.json({ error: "Internal server error", options: [], has_unknown: false }, { status: 500 });
  }
}
