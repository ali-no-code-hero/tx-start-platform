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

  const { data: rpcRows, error: rpcError } = await supabase.rpc("get_my_profile");
  if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
    return rpcRows[0] as Profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,location_id,first_name,last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Profile;
}
