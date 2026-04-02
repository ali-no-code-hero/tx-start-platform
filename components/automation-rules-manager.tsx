"use client";

import {
  createAutomationRule,
  deleteAutomationRule,
  updateAutomationRule,
  type AutomationRuleInput,
} from "@/app/actions/automation-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export type AutomationRuleRow = {
  id: string;
  name: string;
  channel: "sms" | "email";
  application_status: ApplicationStatus;
  delay_minutes: number;
  body_template: string;
  subject_template: string | null;
  is_active: boolean;
};

const emptyForm: AutomationRuleInput = {
  name: "",
  channel: "sms",
  application_status: "Pending",
  delay_minutes: 60,
  body_template: "",
  subject_template: null,
  is_active: true,
};

export function AutomationRulesManager({ initial }: { initial: AutomationRuleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<AutomationRuleInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      saveEdit();
      return;
    }
    startTransition(async () => {
      try {
        await createAutomationRule(form);
        toast.success("Rule created");
        setForm(emptyForm);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function startEdit(row: AutomationRuleRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      channel: row.channel,
      application_status: row.application_status,
      delay_minutes: row.delay_minutes,
      body_template: row.body_template,
      subject_template: row.subject_template,
      is_active: row.is_active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function saveEdit() {
    if (!editingId) return;
    const id = editingId;
    startTransition(async () => {
      try {
        await updateAutomationRule(id, form);
        toast.success("Rule updated");
        cancelEdit();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this automation rule?")) return;
    startTransition(async () => {
      try {
        await deleteAutomationRule(id);
        toast.success("Deleted");
        if (editingId === id) cancelEdit();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          {editingId ? "Edit rule" : "New rule"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-background"
              placeholder="e.g. Pending 48h reminder"
            />
          </div>
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select
              value={form.channel}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  channel: v as "sms" | "email",
                  subject_template: v === "sms" ? null : f.subject_template ?? "",
                }))
              }
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS (Twilio)</SelectItem>
                <SelectItem value="email">Email (Resend)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>When status is</Label>
            <Select
              value={form.application_status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, application_status: v as ApplicationStatus }))
              }
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Delay (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={form.delay_minutes}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  delay_minutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="bg-background"
            />
          </div>
        </div>
        {form.channel === "email" && (
          <div className="space-y-2">
            <Label>Subject template</Label>
            <Input
              value={form.subject_template ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, subject_template: e.target.value }))
              }
              className="bg-background"
              placeholder="Hi {{first_name}} — update on your application"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>Body template</Label>
          <Textarea
            rows={4}
            value={form.body_template}
            onChange={(e) => setForm((f) => ({ ...f, body_template: e.target.value }))}
            className="bg-background"
            placeholder="Use {{first_name}}, {{last_name}}, {{status}}"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="size-4 rounded border"
          />
          <Label htmlFor="is_active" className="font-normal">
            Active
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          {editingId ? (
            <>
              <Button type="button" onClick={() => void saveEdit()} disabled={pending}>
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={pending}>
              Add rule
            </Button>
          )}
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delay (min)</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[220px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.channel}</TableCell>
                <TableCell>{r.application_status}</TableCell>
                <TableCell>{r.delay_minutes}</TableCell>
                <TableCell>{r.is_active ? "Yes" : "No"}</TableCell>
                <TableCell className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => startEdit(r)}
                    disabled={pending}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => remove(r.id)}
                    disabled={pending}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
