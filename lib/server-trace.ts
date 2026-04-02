import { headers } from "next/headers";

/** PostgREST / Supabase client error shape (subset we log). */
export type PostgrestLikeError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function normalizePostgrestLogFields(err: PostgrestLikeError): PostgrestLikeError {
  const msg = (err.message ?? "").trim();
  if (msg) return { ...err, message: msg };
  const fallback = [err.code, err.details, err.hint]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" — ");
  return {
    ...err,
    message: fallback || "(empty error message; likely non-JSON or empty upstream body)",
  };
}

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
  const n = normalizePostgrestLogFields(err);
  const payload = {
    source: "tx-star-crm",
    event,
    supabase: {
      message: n.message,
      code: n.code ?? null,
      details: n.details ?? null,
      hint: n.hint ?? null,
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
