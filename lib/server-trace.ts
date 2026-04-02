import { headers } from "next/headers";

import {
  logSupabaseQueryError,
  type PostgrestLikeError,
  type VercelRequestTrace,
} from "@/lib/server-trace-core";

export type { PostgrestLikeError, VercelRequestTrace } from "@/lib/server-trace-core";
export {
  coercePostgrestLikeError,
  logSupabaseQueryError,
  snapshotUnknownError,
} from "@/lib/server-trace-core";

export async function getVercelRequestTrace(): Promise<VercelRequestTrace> {
  const h = await headers();
  return {
    vercelId: h.get("x-vercel-id") ?? undefined,
    deploymentId: h.get("x-vercel-deployment-id") ?? undefined,
    region: h.get("x-vercel-ip-country-region") ?? undefined,
  };
}

export async function logSupabaseQueryErrorWithRequest(
  event: string,
  err: PostgrestLikeError,
  ctx: Record<string, unknown> = {},
  diag?: Record<string, unknown> | null,
): Promise<void> {
  const vercel = await getVercelRequestTrace();
  logSupabaseQueryError(event, err, { ...ctx, vercel }, diag);
}
