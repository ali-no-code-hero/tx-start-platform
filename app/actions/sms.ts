"use server";

import { getProfile } from "@/lib/auth";
import { sendTwilioSms, toE164Us } from "@/lib/sms/twilio-send";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendCustomerSmsAction(input: {
  applicationId: string;
  toPhone: string;
  body: string;
}) {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");
  if (profile.role === "customer") throw new Error("Forbidden");

  const e164 = toE164Us(input.toPhone);
  if (!e164) {
    throw new Error("Invalid phone number (need 10 digits or +E.164)");
  }

  const twilioSid = await sendTwilioSms({ toE164: e164, body: input.body.trim() });

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from("application_sms").insert({
    application_id: input.applicationId,
    sent_by_user_id: profile.id,
    automation_rule_id: null,
    status_entered_at_snapshot: null,
    to_phone: e164,
    body: input.body.trim(),
    twilio_sid: twilioSid,
  });

  if (dbErr) throw new Error(dbErr.message);

  revalidatePath(`/applications/${input.applicationId}`);
}
