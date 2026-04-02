"use server";

import { getProfile } from "@/lib/auth";
import { sendResendCustomerEmail } from "@/lib/email/resend-customer";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendCustomerEmailAction(input: {
  applicationId: string;
  toEmail: string;
  subject: string;
  body: string;
}) {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");
  if (profile.role === "customer") throw new Error("Forbidden");

  const resendId = await sendResendCustomerEmail({
    to: input.toEmail,
    subject: input.subject,
    body: input.body,
  });

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from("application_emails").insert({
    application_id: input.applicationId,
    sent_by_user_id: profile.id,
    to_email: input.toEmail.trim(),
    subject: input.subject.trim(),
    body: input.body.trim(),
    resend_id: resendId,
    automation_rule_id: null,
    status_entered_at_snapshot: null,
  });

  if (dbErr) throw new Error(dbErr.message);

  revalidatePath(`/applications/${input.applicationId}`);
}
