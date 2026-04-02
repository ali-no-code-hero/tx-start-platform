"use client";

import { inviteStaffUser } from "@/app/actions/admin";
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
import type { UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function InviteStaffForm({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [loc, setLoc] = useState<string>("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await inviteStaffUser({
          email: email.trim(),
          first_name: first.trim(),
          last_name: last.trim(),
          role,
          location_id: role === "admin" ? null : loc || null,
        });
        toast.success("Invitation sent");
        setEmail("");
        setFirst("");
        setLast("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invite failed");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-lg border border-border bg-card p-4 space-y-4 max-w-xl"
    >
      <h2 className="font-medium">Invite user</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label>First name</Label>
          <Input value={first} onChange={(e) => setFirst(e.target.value)} className="bg-background" />
        </div>
        <div className="space-y-2">
          <Label>Last name</Label>
          <Input value={last} onChange={(e) => setLast(e.target.value)} className="bg-background" />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {role === "staff" && (
          <div className="space-y-2">
            <Label>Location</Label>
            <Select
              value={loc || "__none__"}
              onValueChange={(v) => setLoc(!v || v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  );
}
