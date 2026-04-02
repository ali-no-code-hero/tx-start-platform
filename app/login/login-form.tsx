"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toE164Us } from "@/lib/phone-format";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Channel = "email" | "phone";

function safeNext(next: string | null): string {
  const fallback = "/applications";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

function authSendErrorMessage(
  message: string,
  channel: "email" | "phone",
): string {
  const m = message.toLowerCase();
  if (!m.includes("rate limit")) return message;
  if (channel === "email") {
    return "Too many sign-in emails were sent. Wait a few minutes, then try again—or use phone if it’s enabled. In Supabase: use custom SMTP (e.g. Resend) and check Authentication → Rate Limits.";
  }
  return "Too many SMS codes were sent. Wait a few minutes, then try again—or use email if it’s enabled. Check Authentication → Rate Limits in Supabase.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<"send" | "verify">("send");
  const [email, setEmail] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [e164Sent, setE164Sent] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    toast.error(err);
    const nextQ = searchParams.get("next");
    const path = nextQ
      ? `/login?next=${encodeURIComponent(safeNext(nextQ))}`
      : "/login";
    router.replace(path, { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    setStep("send");
    setOtp("");
    setE164Sent(null);
  }, [channel]);

  async function sendCode() {
    setLoading(true);
    const supabase = createClient();
    try {
      if (channel === "email") {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
          toast.error("Enter your email address");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: {
            shouldCreateUser: false,
          },
        });
        if (error) {
          toast.error(authSendErrorMessage(error.message, "email"));
          setLoading(false);
          return;
        }
        setEmail(trimmed);
        setStep("verify");
        toast.success("Check your email for your 6-digit sign-in code.");
      } else {
        const e164 = toE164Us(phoneRaw);
        if (!e164) {
          toast.error("Enter a valid US phone number (10 digits or +1…)");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          phone: e164,
          options: { shouldCreateUser: false },
        });
        if (error) {
          toast.error(authSendErrorMessage(error.message, "phone"));
          setLoading(false);
          return;
        }
        setE164Sent(e164);
        setStep("verify");
        toast.success("Check your phone for a text message with your code.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      if (channel === "email") {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code,
          type: "email",
        });
        if (error) {
          toast.error(error.message);
          return;
        }
      } else {
        const phone = e164Sent ?? toE164Us(phoneRaw);
        if (!phone) {
          toast.error("Phone number missing — go back and send a code again.");
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          phone,
          token: code,
          type: "sms",
        });
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border border-zinc-700 p-0.5">
        <button
          type="button"
          onClick={() => setChannel("email")}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            channel === "email"
              ? "bg-zinc-800 text-zinc-50"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setChannel("phone")}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            channel === "phone"
              ? "bg-zinc-800 text-zinc-50"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Phone
        </button>
      </div>

      {step === "send" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          {channel === "email" ? (
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-200">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="border-zinc-700 bg-zinc-950 text-zinc-50"
              />
              <p className="text-xs text-zinc-500">
                Use the email on your account (same as your application or invite).
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-zinc-200">
                Mobile number
              </Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder="(903) 555-0100"
                className="border-zinc-700 bg-zinc-950 text-zinc-50"
              />
              <p className="text-xs text-zinc-500">
                Use the number on your Texas Star account. SMS is sent by Supabase Auth (configure
                Phone provider in the Supabase dashboard).
              </p>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send sign-in code"}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-zinc-200">
              6-digit code
            </Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="000000"
              className="border-zinc-700 bg-zinc-950 text-center font-mono text-lg tracking-widest text-zinc-50"
            />
            <p className="text-xs text-zinc-500">
              {channel === "email"
                ? "Enter the 6-digit code from your email."
                : "Enter the code from your text message."}
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={() => void verifyCode()}
          >
            {loading ? "Verifying…" : "Verify and sign in"}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-zinc-700 bg-transparent text-zinc-200"
              disabled={loading}
              onClick={() => void sendCode()}
            >
              Resend code
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-zinc-700 bg-transparent text-zinc-200"
              disabled={loading}
              onClick={() => setStep("send")}
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
