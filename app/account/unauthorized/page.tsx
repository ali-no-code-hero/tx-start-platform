import { SignOutButton } from "./sign-out-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function UnauthorizedAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-navy-deep via-brand-navy to-[oklch(0.18_0.09_28)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 size-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-md space-y-6 rounded-2xl border border-white/15 bg-card/95 p-8 shadow-2xl shadow-black/25 backdrop-blur-sm">
        <div className="space-y-2 text-center">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-primary">
            Texas Star
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-card-foreground">
            No CRM access for this account
          </h1>
          <p className="text-sm text-muted-foreground">
            You are signed in, but the app could not load a profile row for your auth user. In
            Supabase, <span className="font-medium text-foreground">public.profiles.id</span> must
            equal{" "}
            <span className="font-medium text-foreground">Authentication → Users → User UID</span>{" "}
            for this session. If you created the profile by hand, the UUIDs often do not match.
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            Signed-in user id: {user.id}
          </p>
        </div>
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
