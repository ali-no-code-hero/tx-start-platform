"use server";

import { getProfile } from "@/lib/auth";
import { toStoredUsPhone } from "@/lib/phone-format";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function updateApplicationFields(input: {
  applicationId: string;
  status?: ApplicationStatus;
  loan_amount_approved?: number | null;
  location_id?: string | null;
}) {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");
  if (profile.role === "customer") throw new Error("Forbidden");

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.loan_amount_approved !== undefined)
    patch.loan_amount_approved = input.loan_amount_approved;
  if (input.location_id !== undefined && profile.role === "admin") {
    patch.location_id = input.location_id;
  }

  const { error } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", input.applicationId);

  if (error) throw new Error(error.message);

  revalidatePath("/applications");
  revalidatePath(`/applications/${input.applicationId}`);
}

export async function updateCustomerFields(input: {
  customerId: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}) {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");

  const supabase = await createClient();
  if (profile.role === "customer") {
    const { data: row } = await supabase
      .from("customers")
      .select("id")
      .eq("id", input.customerId)
      .eq("auth_user_id", profile.id)
      .maybeSingle();
    if (!row) throw new Error("Forbidden");
  }

  const { error } = await supabase
    .from("customers")
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email.trim().toLowerCase(),
      phone: toStoredUsPhone(input.phone),
    })
    .eq("id", input.customerId);

  if (error) throw new Error(error.message);

  revalidatePath("/applications");
}
