"use client";

import { inviteCustomerPortalUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function InviteCustomerPortalCard({
  applicationId,
  customerId,
  defaultEmail,
  defaultFirstName,
  defaultLastName,
  hasPortalAccount,
}: {
  applicationId: string;
  customerId: string;
  defaultEmail: string;
  defaultFirstName: string;
  defaultLastName: string;
  hasPortalAccount: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail);
  const [first, setFirst] = useState(defaultFirstName);
  const [last, setLast] = useState(defaultLastName);

  if (hasPortalAccount) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer portal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This customer has a linked portal login. They can sign in to view their applications
            and messages from your team.
          </p>
        </CardContent>
      </Card>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await inviteCustomerPortalUser({
          applicationId,
          customerId,
          email: email.trim(),
          first_name: first.trim(),
          last_name: last.trim(),
        });
        toast.success("Invitation sent — customer completes signup from email");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invite failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite to customer portal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sends a Supabase invite. When they complete signup, their account is linked to this
            customer record so they only see their own applications.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="portal-email">Email</Label>
              <Input
                id="portal-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-first">First name</Label>
              <Input
                id="portal-first"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-last">Last name</Label>
              <Input
                id="portal-last"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send portal invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
