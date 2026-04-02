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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
            No CRM access for this account
          </h1>
          <p className="text-sm text-zinc-400">
            You are signed in, but the app could not load a profile row for your auth user. In
            Supabase, <span className="text-zinc-300">public.profiles.id</span> must equal{" "}
            <span className="text-zinc-300">Authentication → Users → User UID</span> for this
            session. If you created the profile by hand, the UUIDs often do not match.
          </p>
          <p className="break-all font-mono text-xs text-zinc-500">
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
