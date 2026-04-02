"use server";

import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const statusTuple = APPLICATION_STATUSES as unknown as [ApplicationStatus, ...ApplicationStatus[]];

const automationRuleSchema = z
  .object({
    name: z.string().min(1),
    channel: z.enum(["sms", "email"]),
    application_status: z.enum(statusTuple),
    delay_minutes: z.number().int().min(0),
    body_template: z.string().min(1),
    subject_template: z.string().optional().nullable(),
    is_active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "email") {
      if (!data.subject_template?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Subject is required for email rules",
          path: ["subject_template"],
        });
      }
    } else if (data.subject_template?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Subject must be empty for SMS rules",
        path: ["subject_template"],
      });
    }
  });

export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;

async function requireAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") throw new Error("Forbidden");
  return profile;
}

export async function createAutomationRule(input: AutomationRuleInput) {
  await requireAdmin();
  const parsed = automationRuleSchema.parse(input);
  const admin = createAdminClient();

  const row = {
    name: parsed.name.trim(),
    channel: parsed.channel,
    application_status: parsed.application_status,
    delay_minutes: parsed.delay_minutes,
    body_template: parsed.body_template,
    subject_template:
      parsed.channel === "email" ? parsed.subject_template!.trim() : null,
    is_active: parsed.is_active,
  };

  const { error } = await admin.from("automation_rules").insert(row);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/automation-rules");
}

export async function updateAutomationRule(
  id: string,
  input: AutomationRuleInput,
) {
  await requireAdmin();
  const parsed = automationRuleSchema.parse(input);
  const admin = createAdminClient();

  const row = {
    name: parsed.name.trim(),
    channel: parsed.channel,
    application_status: parsed.application_status,
    delay_minutes: parsed.delay_minutes,
    body_template: parsed.body_template,
    subject_template:
      parsed.channel === "email" ? parsed.subject_template!.trim() : null,
    is_active: parsed.is_active,
  };

  const { error } = await admin.from("automation_rules").update(row).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/automation-rules");
}

export async function deleteAutomationRule(id: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("automation_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/automation-rules");
}
