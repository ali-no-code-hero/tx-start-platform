"use client";

import { updateApplicationFields } from "@/app/actions/applications";
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
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function ApplicationEditForm({
  applicationId,
  status,
  loan_amount_approved,
  locationId,
  locations,
  isAdmin,
}: {
  applicationId: string;
  status: ApplicationStatus;
  loan_amount_approved: number | null;
  locationId: string | null;
  locations: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [st, setSt] = useState<ApplicationStatus>(status);
  const [approved, setApproved] = useState(
    loan_amount_approved != null ? String(loan_amount_approved) : "",
  );
  const [loc, setLoc] = useState<string>(locationId ?? "");

  function save() {
    startTransition(async () => {
      try {
        await updateApplicationFields({
          applicationId,
          status: st,
          loan_amount_approved:
            approved.trim() === "" ? null : Number.parseFloat(approved),
          location_id: isAdmin ? (loc === "" ? null : loc) : undefined,
        });
        toast.success("Application updated");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={st} onValueChange={(v) => setSt(v as ApplicationStatus)}>
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
          <Label>Approved amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={approved}
            onChange={(e) => setApproved(e.target.value)}
            placeholder="e.g. 800"
            className="bg-background"
          />
        </div>
      </div>
      {isAdmin && (
        <div className="space-y-2">
          <Label>Location</Label>
          <Select
            value={loc || "__none__"}
            onValueChange={(v) => setLoc(!v || v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Assign location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="button" onClick={() => void save()} disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
