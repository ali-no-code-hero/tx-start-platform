"use server";

import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function inviteStaffUser(input: {
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  location_id: string | null;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  if (input.role !== "staff" && input.role !== "admin") {
    throw new Error("Invite role must be staff or admin");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: {
      role: input.role,
      location_id: input.location_id ?? "",
      first_name: input.first_name,
      last_name: input.last_name,
    },
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function inviteCustomerPortalUser(input: {
  email: string;
  first_name: string;
  last_name: string;
  customerId: string;
  applicationId: string;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  const admin = createAdminClient();
  const { data: cust, error: loadErr } = await admin
    .from("customers")
    .select("id, auth_user_id")
    .eq("id", input.customerId)
    .maybeSingle();

  if (loadErr) throw new Error(loadErr.message);
  if (!cust) throw new Error("Customer not found");
  if (cust.auth_user_id) throw new Error("This customer already has a portal account linked");

  const { error } = await admin.auth.admin.inviteUserByEmail(input.email.trim(), {
    data: {
      role: "customer",
      customer_id: input.customerId,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
    },
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
  revalidatePath("/applications");
  revalidatePath(`/applications/${input.applicationId}`);
}

export async function updateUserProfile(input: {
  userId: string;
  role: UserRole;
  location_id: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      role: input.role,
      location_id: input.location_id ?? "",
      first_name: input.first_name ?? "",
      last_name: input.last_name ?? "",
    },
  });
  if (authErr) throw new Error(authErr.message);

  const { error } = await admin.from("profiles").update({
    role: input.role,
    location_id: input.location_id,
    first_name: input.first_name,
    last_name: input.last_name,
  }).eq("id", input.userId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function createLocation(name: string) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ name: name.trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/locations");
}

export async function updateLocation(id: string, name: string) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/locations");
}

export async function deleteLocation(id: string) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");

  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/locations");
}
