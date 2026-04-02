"use client";

import { updateCustomerFields } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function CustomerEditForm({
  customer,
}: {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [first, setFirst] = useState(customer.first_name);
  const [last, setLast] = useState(customer.last_name);
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone ?? "");

  function save() {
    startTransition(async () => {
      try {
        await updateCustomerFields({
          customerId: customer.id,
          first_name: first,
          last_name: last,
          email,
          phone,
        });
        toast.success("Customer updated");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>First name</Label>
        <Input value={first} onChange={(e) => setFirst(e.target.value)} className="bg-background" />
      </div>
      <div className="space-y-2">
        <Label>Last name</Label>
        <Input value={last} onChange={(e) => setLast(e.target.value)} className="bg-background" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-background"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-background" />
      </div>
      <div className="sm:col-span-2">
        <Button type="button" onClick={() => void save()} disabled={pending}>
          {pending ? "Saving…" : "Save customer"}
        </Button>
      </div>
    </div>
  );
}
