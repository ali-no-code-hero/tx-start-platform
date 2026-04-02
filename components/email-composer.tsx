"use client";

import { sendCustomerEmailAction } from "@/app/actions/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function EmailComposer({
  applicationId,
  defaultTo,
}: {
  applicationId: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function send() {
    startTransition(async () => {
      try {
        await sendCustomerEmailAction({
          applicationId,
          toEmail: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
        });
        toast.success("Email sent");
        setSubject("");
        setBody("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    });
  }

  return (
    <div className="space-y-3 max-w-xl">
      <div className="space-y-2">
        <Label>To</Label>
        <Input value={to} onChange={(e) => setTo(e.target.value)} className="bg-background" />
      </div>
      <div className="space-y-2">
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-background" />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="bg-background"
        />
      </div>
      <Button type="button" onClick={() => void send()} disabled={pending || !to || !subject}>
        {pending ? "Sending…" : "Send via Resend"}
      </Button>
    </div>
  );
}
