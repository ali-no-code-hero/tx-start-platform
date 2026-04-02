import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  location_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,location_id,first_name,last_name")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}
