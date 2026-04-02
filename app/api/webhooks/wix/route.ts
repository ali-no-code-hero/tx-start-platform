import { toStoredUsPhone } from "@/lib/phone-format";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWixPayload } from "@/lib/wix/normalize";
import { NextResponse } from "next/server";

function verifySecret(request: Request): boolean {
  const secret = process.env.WIX_WEBHOOK_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header && header === secret) return true;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("secret");
    if (q && q === secret) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function POST(request: Request) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const normalized = normalizeWixPayload(body);
  if (!normalized) {
    return NextResponse.json(
      { error: "Could not parse submission (missing submission id or email)" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: locations, error: locErr } = await admin
    .from("locations")
    .select("id,name");

  if (locErr) {
    console.error(locErr);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const nameToId = new Map(
    (locations ?? []).map((l: { id: string; name: string }) => [
      l.name.trim().toLowerCase(),
      l.id,
    ]),
  );

  let locationId: string | null = null;
  let needsLocationReview = false;
  if (normalized.locationName) {
    const key = normalized.locationName.trim().toLowerCase();
    locationId = nameToId.get(key) ?? null;
    if (!locationId) needsLocationReview = true;
  } else {
    needsLocationReview = true;
  }

  const submissionMetadata: Record<string, unknown> = {
    ...(normalized.wixFormId ? { wix_form_id: normalized.wixFormId } : {}),
    ...(normalized.submissionsUrl
      ? { submissions_url: normalized.submissionsUrl }
      : {}),
    ...(needsLocationReview ? { needs_location_review: true } : {}),
  };

  const createdAt = normalized.submittedAt
    ? new Date(normalized.submittedAt).toISOString()
    : undefined;

  let customerId: string | null = null;

  if (normalized.wixContactId) {
    const { data: byWix } = await admin
      .from("customers")
      .select("id")
      .eq("wix_contact_id", normalized.wixContactId)
      .maybeSingle();
    if (byWix?.id) customerId = byWix.id;
  }

  if (!customerId) {
    const { data: byEmail } = await admin
      .from("customers")
      .select("id")
      .ilike("email", normalized.email)
      .maybeSingle();
    if (byEmail?.id) customerId = byEmail.id;
  }

  if (!customerId && normalized.phoneDigits.length >= 10) {
    const { data: candidates } = await admin
      .from("customers")
      .select("id,phone")
      .not("phone", "is", null)
      .limit(50);

    const match = (candidates ?? []).find((c: { id: string; phone: string | null }) => {
      const d = (c.phone ?? "").replace(/\D/g, "");
      return d === normalized.phoneDigits || d.endsWith(normalized.phoneDigits.slice(-10));
    });
    if (match) customerId = match.id;
  }

  if (!customerId) {
    const { data: insertedCustomer, error: custErr } = await admin
      .from("customers")
      .insert({
        first_name: normalized.firstName,
        last_name: normalized.lastName,
        email: normalized.email,
        phone: toStoredUsPhone(normalized.phone || normalized.phoneDigits),
        wix_contact_id: normalized.wixContactId ?? null,
      })
      .select("id")
      .single();

    if (custErr) {
      console.error(custErr);
      return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
    customerId = insertedCustomer.id;
  } else {
    const custUpdate: Record<string, string> = {
      first_name: normalized.firstName,
      last_name: normalized.lastName,
    };
    const phonePatch = toStoredUsPhone(normalized.phone || normalized.phoneDigits);
    if (phonePatch) custUpdate.phone = phonePatch;
    if (normalized.wixContactId) custUpdate.wix_contact_id = normalized.wixContactId;
    await admin.from("customers").update(custUpdate).eq("id", customerId);
  }

  const { data: existingApp } = await admin
    .from("applications")
    .select("id")
    .eq("wix_submission_id", normalized.wixSubmissionId)
    .maybeSingle();

  if (existingApp?.id) {
    await admin
      .from("applications")
      .update({
        submission_metadata: submissionMetadata,
        raw_payload: body as object,
      })
      .eq("id", existingApp.id);
    return NextResponse.json({ ok: true, customer_id: customerId, idempotent: true });
  }

  const appRow = {
    customer_id: customerId,
    location_id: locationId,
    wix_submission_id: normalized.wixSubmissionId,
    type_of_loan: normalized.typeOfLoan ?? null,
    loan_amount_requested: normalized.loanAmountRequested ?? null,
    urgent_same_day: normalized.urgentSameDay,
    terms_agreed: normalized.termsAgreed,
    status: "Pending" as const,
    submission_metadata: submissionMetadata,
    raw_payload: body as object,
    ...(createdAt ? { created_at: createdAt } : {}),
  };

  const { error: appErr } = await admin.from("applications").insert(appRow);

  if (appErr) {
    console.error(appErr);
    return NextResponse.json({ error: "Failed to save application" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, customer_id: customerId });
}
