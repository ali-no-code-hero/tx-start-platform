"use client";

import { createLocation, deleteLocation, updateLocation } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function LocationsManager({
  initial,
}: {
  initial: { id: string; name: string; created_at: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createLocation(name);
        toast.success("Location added");
        setName("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function saveRow(id: string, original: string) {
    const next = edits[id] ?? original;
    if (next === original) return;
    startTransition(async () => {
      try {
        await updateLocation(id, next);
        toast.success("Updated");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this location? Linked records may block deletion.")) return;
    startTransition(async () => {
      try {
        await deleteLocation(id);
        toast.success("Deleted");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">New location</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-64 bg-background"
          />
        </div>
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[200px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Input
                    value={edits[l.id] ?? l.name}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    className="bg-background"
                  />
                </TableCell>
                <TableCell className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => saveRow(l.id, l.name)}
                    disabled={pending}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => remove(l.id)}
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
