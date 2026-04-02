"use client";

import { sendCustomerSmsAction } from "@/app/actions/sms";
import { formatPhoneUs, toStoredUsPhone } from "@/lib/phone-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function SmsComposer({
  applicationId,
  defaultTo,
}: {
  applicationId: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(() => formatPhoneUs(defaultTo) ?? defaultTo);
  const [body, setBody] = useState("");

  function send() {
    startTransition(async () => {
      try {
        await sendCustomerSmsAction({
          applicationId,
          toPhone: to.trim(),
          body: body.trim(),
        });
        toast.success("Text sent");
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
        <Label>To (phone)</Label>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(512) 767-3628"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => {
            const next = toStoredUsPhone(to);
            if (next !== null) setTo(next);
            else if (!to.trim()) setTo("");
          }}
          className="bg-background"
        />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="bg-background"
        />
      </div>
      <Button type="button" onClick={() => void send()} disabled={pending || !to || !body.trim()}>
        {pending ? "Sending…" : "Send via Twilio"}
      </Button>
    </div>
  );
}
