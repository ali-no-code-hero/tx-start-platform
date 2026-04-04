import { AutomationRulesManager } from "@/components/automation-rules-manager";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminAutomationRulesPage() {
  const admin = createAdminClient();
  const { data: rules, error } = await admin
    .from("automation_rules")
    .select(
      "id, name, channel, application_status, delay_minutes, body_template, subject_template, is_active",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load automation rules: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-l-[3px] border-primary pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Automation rules</h1>
        <p className="text-sm text-muted-foreground">
          Send SMS (Twilio) or email (Resend) when an application stays in a status for the
          configured delay. Placeholders: {"{{first_name}}"}, {"{{last_name}}"}, {"{{status}}"}. Cron
          runs every 10 minutes; set <code className="text-xs">CRON_SECRET</code> and authorize with{" "}
          <code className="text-xs">Authorization: Bearer …</code>.
        </p>
      </div>
      <AutomationRulesManager initial={rules ?? []} />
    </div>
  );
}
