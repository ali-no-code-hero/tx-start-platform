import { toE164Us } from "@/lib/phone-format";
import twilio from "twilio";

export { toE164Us };

export async function sendTwilioSms(input: { toE164: string; body: string }): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER is not configured");
  }
  const client = twilio(sid, token);
  const msg = await client.messages.create({
    from,
    to: input.toE164,
    body: input.body,
  });
  return msg.sid;
}
