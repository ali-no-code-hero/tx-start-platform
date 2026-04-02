"use server";

import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addComment(input: {
  applicationId: string;
  content: string;
  mentionUserIds: string[];
}) {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");
  if (profile.role === "customer") throw new Error("Forbidden");

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    application_id: input.applicationId,
    user_id: profile.id,
    content: input.content.trim(),
    mentions: input.mentionUserIds,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/applications/${input.applicationId}`);
}
