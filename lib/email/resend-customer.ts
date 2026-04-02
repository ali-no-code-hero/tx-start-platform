import { Resend } from "resend";

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendResendCustomerEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    throw new Error("RESEND_API_KEY or RESEND_FROM_EMAIL is not configured");
  }
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to.trim(),
    subject: input.subject.trim(),
    html: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(input.body)}</div>`,
  });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
