import { LoginForm } from "./login-form";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const profile = await getProfile();
    if (profile) redirect("/applications");
    redirect("/account/unauthorized");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-navy-deep via-brand-navy to-[oklch(0.18_0.09_28)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full bg-brand-gold/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 size-80 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl border border-white/15 bg-card/95 p-8 shadow-2xl shadow-black/25 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-primary">
            Texas Star
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-card-foreground">
            Loan CRM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with a one-time code sent to your email or phone
          </p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
