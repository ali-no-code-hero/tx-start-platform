"use server";

import { getProfile } from "@/lib/auth";
import { parseLegacyLoanExportCsv } from "@/lib/legacy-loan-csv";
import { toStoredUsPhone } from "@/lib/phone-format";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type LegacyImportResult = {
  imported: number;
  skippedDuplicate: number;
  failedImports: number;
  parseErrors: { rowIndex: number; message: string }[];
  importErrors: { rowIndex: number; message: string }[];
  unknownLocations: string[];
};

export async function importLegacyLoanCsv(csvText: string): Promise<LegacyImportResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Only admins can import legacy loan data.");
  }

  const parsed = parseLegacyLoanExportCsv(csvText);
  if (!parsed.ok) {
    return {
      imported: 0,
      skippedDuplicate: 0,
      failedImports: 0,
      parseErrors: [],
      importErrors: [{ rowIndex: 0, message: parsed.error }],
      unknownLocations: [],
    };
  }

  const admin = createAdminClient();

  const { data: locations, error: locErr } = await admin.from("locations").select("id,name");
  if (locErr) {
    return {
      imported: 0,
      skippedDuplicate: 0,
      failedImports: 0,
      parseErrors: parsed.errors,
      importErrors: [{ rowIndex: 0, message: locErr.message }],
      unknownLocations: [],
    };
  }

  const nameToId = new Map(
    (locations ?? []).map((l: { id: string; name: string }) => [
      l.name.trim().toLowerCase(),
      l.id as string,
    ]),
  );

  const unknownLocationSet = new Set<string>();
  let imported = 0;
  let skippedDuplicate = 0;
  const importErrors: { rowIndex: number; message: string }[] = [];

  const dataRowOffset = 2;

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const displayRow = i + dataRowOffset;

    let locationId: string | null = null;
    if (row.locationName) {
      const key = row.locationName.trim().toLowerCase();
      locationId = nameToId.get(key) ?? null;
      if (!locationId) unknownLocationSet.add(row.locationName.trim());
    }

    const { data: existingApp } = await admin
      .from("applications")
      .select("id")
      .eq("wix_submission_id", row.legacyUuid)
      .maybeSingle();

    if (existingApp?.id) {
      skippedDuplicate++;
      continue;
    }

    let customerId: string | null = null;
    const { data: byEmail } = await admin
      .from("customers")
      .select("id")
      .ilike("email", row.email)
      .maybeSingle();

    if (byEmail?.id) {
      customerId = byEmail.id as string;
    } else {
      const { data: newCust, error: custErr } = await admin
        .from("customers")
        .insert({
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          phone: toStoredUsPhone(row.phone),
        })
        .select("id")
        .single();

      if (custErr || !newCust) {
        importErrors.push({
          rowIndex: displayRow,
          message: custErr?.message ?? "Failed to create customer",
        });
        continue;
      }
      customerId = newCust.id as string;
    }

    const submissionMetadata: Record<string, unknown> = {
      legacy_import: true,
      legacy_numeric_id: row.legacyNumericId || null,
      legacy_business_before: row.businessBefore,
      ...(locationId ? {} : row.locationName ? { needs_location_review: true } : {}),
    };

    const createdAt = row.createdAt?.toISOString() ?? new Date().toISOString();
    const updatedAt = row.updatedAt?.toISOString() ?? row.createdAt?.toISOString() ?? createdAt;

    const { error: appErr } = await admin.from("applications").insert({
      customer_id: customerId,
      location_id: locationId,
      wix_submission_id: row.legacyUuid,
      type_of_loan: row.typeOfLoan,
      loan_amount_requested: row.loanAmountRequested,
      loan_amount_approved: row.loanAmountApproved,
      urgent_same_day: row.urgentSameDay,
      terms_agreed: row.termsAgreed,
      status: row.status,
      submission_metadata: submissionMetadata,
      raw_payload: row.raw,
      created_at: createdAt,
      updated_at: updatedAt,
    });

    if (appErr) {
      importErrors.push({ rowIndex: displayRow, message: appErr.message });
      continue;
    }
    imported++;
  }

  revalidatePath("/applications");
  revalidatePath("/admin/import");

  return {
    imported,
    skippedDuplicate,
    failedImports: importErrors.length,
    parseErrors: parsed.errors,
    importErrors,
    unknownLocations: [...unknownLocationSet].sort(),
  };
}
