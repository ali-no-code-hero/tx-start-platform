"use client";

import { updateUserProfile } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Row = {
  id: string;
  email: string;
  role: UserRole;
  location_id: string | null;
  first_name: string | null;
  last_name: string | null;
  locations: { name: string } | null;
};

export function UsersTable({
  rows,
  locations,
}: {
  rows: Row[];
  locations: { id: string; name: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                {r.first_name ?? ""} {r.last_name ?? ""}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.email}</TableCell>
              <TableCell>{r.role}</TableCell>
              <TableCell>{r.locations?.name ?? "—"}</TableCell>
              <TableCell>
                <EditUserDialog user={r} locations={locations} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditUserDialog({ user, locations }: { user: Row; locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(user.role);
  const [loc, setLoc] = useState<string>(user.location_id ?? "");
  const [first, setFirst] = useState(user.first_name ?? "");
  const [last, setLast] = useState(user.last_name ?? "");

  function save() {
    startTransition(async () => {
      try {
        await updateUserProfile({
          userId: user.id,
          role,
          location_id: role === "admin" || role === "customer" ? null : loc || null,
          first_name: first || null,
          last_name: last || null,
        });
        toast.success("User updated");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-2">
            <Label>First name</Label>
            <Input value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
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
                <SelectTrigger>
                  <SelectValue placeholder="Location" />
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
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
