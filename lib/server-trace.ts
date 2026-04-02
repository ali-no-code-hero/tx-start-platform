import { headers } from "next/headers";

/** PostgREST / Supabase client error shape (subset we log). */
export type PostgrestLikeError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type VercelRequestTrace = {
  vercelId?: string;
  deploymentId?: string;
  /** Edge / routing region when present */
  region?: string;
};

export async function getVercelRequestTrace(): Promise<VercelRequestTrace> {
  const h = await headers();
  return {
    vercelId: h.get("x-vercel-id") ?? undefined,
    deploymentId: h.get("x-vercel-deployment-id") ?? undefined,
    region: h.get("x-vercel-ip-country-region") ?? undefined,
  };
}

function getVercelDeployMeta(): Record<string, string | undefined> {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  };
}

/**
 * One JSON line per call — filter in Vercel → Logs with e.g. `applications_list_query_failed`
 * or `source:tx-star-crm`.
 */
export function logSupabaseQueryError(
  event: string,
  err: PostgrestLikeError,
  ctx: Record<string, unknown> = {},
): void {
  const payload = {
    source: "tx-star-crm",
    event,
    supabase: {
      message: err.message,
      code: err.code ?? null,
      details: err.details ?? null,
      hint: err.hint ?? null,
    },
    ctx,
    deploy: getVercelDeployMeta(),
    ts: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}

export async function logSupabaseQueryErrorWithRequest(
  event: string,
  err: PostgrestLikeError,
  ctx: Record<string, unknown> = {},
): Promise<void> {
  const vercel = await getVercelRequestTrace();
  logSupabaseQueryError(event, err, { ...ctx, vercel });
}
