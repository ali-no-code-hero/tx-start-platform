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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
            Texas Star Loan CRM
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in with a one-time code sent to your email or phone
          </p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-zinc-500">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
