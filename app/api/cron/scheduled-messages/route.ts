import { sendResendCustomerEmail } from "@/lib/email/resend-customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplate, type TemplateContext } from "@/lib/template-render";
import { sendTwilioSms, toE164Us } from "@/lib/sms/twilio-send";
import type { ApplicationStatus } from "@/lib/types";
import { NextResponse } from "next/server";

function verifyCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

type AutomationRuleRow = {
  id: string;
  name: string;
  channel: "sms" | "email";
  application_status: ApplicationStatus;
  delay_minutes: number;
  body_template: string;
  subject_template: string | null;
  is_active: boolean;
};

type CustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

type AppWithCustomer = {
  id: string;
  status: ApplicationStatus;
  status_entered_at: string;
  customers: CustomerRow | CustomerRow[] | null;
};

function singleCustomer(
  c: AppWithCustomer["customers"],
): CustomerRow | null {
  if (c == null) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function delayElapsed(statusEnteredAt: string, delayMinutes: number): boolean {
  const entered = new Date(statusEnteredAt).getTime();
  const due = entered + delayMinutes * 60 * 1000;
  return Date.now() >= due;
}

export async function GET(request: Request) {
  return runScheduledMessages(request);
}

export async function POST(request: Request) {
  return runScheduledMessages(request);
}

async function runScheduledMessages(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: rules, error: rulesErr } = await admin
    .from("automation_rules")
    .select(
      "id, name, channel, application_status, delay_minutes, body_template, subject_template, is_active",
    )
    .eq("is_active", true);

  if (rulesErr) {
    console.error(rulesErr);
    return NextResponse.json({ error: rulesErr.message }, { status: 500 });
  }

  const activeRules = (rules ?? []) as AutomationRuleRow[];
  let sentSms = 0;
  let sentEmail = 0;
  let skipped = 0;
  let errors = 0;

  for (const rule of activeRules) {
    const { data: apps, error: appsErr } = await admin
      .from("applications")
      .select(
        `
        id,
        status,
        status_entered_at,
        customers ( id, first_name, last_name, email, phone )
      `,
      )
      .eq("status", rule.application_status);

    if (appsErr) {
      console.error(appsErr);
      errors += 1;
      continue;
    }

    const list = (apps ?? []) as unknown as AppWithCustomer[];

    for (const app of list) {
      if (!delayElapsed(app.status_entered_at, rule.delay_minutes)) {
        skipped += 1;
        continue;
      }

      const customer = singleCustomer(app.customers);
      if (!customer) {
        skipped += 1;
        continue;
      }

      const ctx: TemplateContext = {
        first_name: customer.first_name ?? "",
        last_name: customer.last_name ?? "",
        status: app.status,
      };

      if (rule.channel === "sms") {
        const rawPhone = customer.phone?.trim() ?? "";
        if (!rawPhone) {
          skipped += 1;
          continue;
        }
        const e164 = toE164Us(rawPhone);
        if (!e164) {
          skipped += 1;
          continue;
        }

        const { data: fireRow, error: fireErr } = await admin
          .from("automation_rule_fires")
          .insert({
            application_id: app.id,
            rule_id: rule.id,
            status_entered_at_snapshot: app.status_entered_at,
          })
          .select("id")
          .maybeSingle();

        if (fireErr) {
          if (fireErr.code === "23505") {
            skipped += 1;
            continue;
          }
          console.error(fireErr);
          errors += 1;
          continue;
        }

        const fireId = fireRow?.id;
        if (!fireId) {
          skipped += 1;
          continue;
        }

        const body = renderTemplate(rule.body_template, ctx);

        try {
          const twilioSid = await sendTwilioSms({ toE164: e164, body });
          const { error: logErr } = await admin.from("application_sms").insert({
            application_id: app.id,
            sent_by_user_id: null,
            automation_rule_id: rule.id,
            status_entered_at_snapshot: app.status_entered_at,
            to_phone: e164,
            body,
            twilio_sid: twilioSid,
          });
          if (logErr) {
            console.error(logErr);
            await admin.from("automation_rule_fires").delete().eq("id", fireId);
            errors += 1;
            continue;
          }
          sentSms += 1;
        } catch (e) {
          console.error(e);
          await admin.from("automation_rule_fires").delete().eq("id", fireId);
          errors += 1;
        }
      } else {
        const toEmail = customer.email?.trim() ?? "";
        if (!toEmail) {
          skipped += 1;
          continue;
        }

        const subjectTpl = rule.subject_template ?? "";
        if (!subjectTpl.trim()) {
          skipped += 1;
          continue;
        }

        const { data: fireRow, error: fireErr } = await admin
          .from("automation_rule_fires")
          .insert({
            application_id: app.id,
            rule_id: rule.id,
            status_entered_at_snapshot: app.status_entered_at,
          })
          .select("id")
          .maybeSingle();

        if (fireErr) {
          if (fireErr.code === "23505") {
            skipped += 1;
            continue;
          }
          console.error(fireErr);
          errors += 1;
          continue;
        }

        const fireId = fireRow?.id;
        if (!fireId) {
          skipped += 1;
          continue;
        }

        const body = renderTemplate(rule.body_template, ctx);
        const subject = renderTemplate(subjectTpl, ctx);

        try {
          const resendId = await sendResendCustomerEmail({
            to: toEmail,
            subject,
            body,
          });
          const { error: logErr } = await admin.from("application_emails").insert({
            application_id: app.id,
            sent_by_user_id: null,
            to_email: toEmail,
            subject,
            body,
            resend_id: resendId,
            automation_rule_id: rule.id,
            status_entered_at_snapshot: app.status_entered_at,
          });
          if (logErr) {
            console.error(logErr);
            await admin.from("automation_rule_fires").delete().eq("id", fireId);
            errors += 1;
            continue;
          }
          sentEmail += 1;
        } catch (e) {
          console.error(e);
          await admin.from("automation_rule_fires").delete().eq("id", fireId);
          errors += 1;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sentSms,
    sentEmail,
    skipped,
    errors,
    rulesProcessed: activeRules.length,
  });
}
