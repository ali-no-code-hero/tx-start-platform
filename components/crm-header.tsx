"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CrmHeaderProps = {
  role: UserRole;
  email: string;
};

export function CrmHeader({ role, email }: CrmHeaderProps) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-white/10 bg-brand-navy shadow-md shadow-black/15">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <span className="hidden shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold/95 sm:inline">
            Texas Star
          </span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
            <Link
              href="/applications"
              className="text-white underline decoration-brand-gold decoration-2 underline-offset-4 hover:text-brand-gold"
            >
              Applications
            </Link>
            {role === "admin" && (
              <>
                <Link
                  href="/admin/users"
                  className="text-white/75 transition-colors hover:text-brand-gold"
                >
                  Users
                </Link>
                <Link
                  href="/admin/locations"
                  className="text-white/75 transition-colors hover:text-brand-gold"
                >
                  Locations
                </Link>
                <Link
                  href="/admin/analytics"
                  className="text-white/75 transition-colors hover:text-brand-gold"
                >
                  Analytics
                </Link>
                <Link
                  href="/admin/automation-rules"
                  className="text-white/75 transition-colors hover:text-brand-gold"
                >
                  Automation
                </Link>
                <Link
                  href="/admin/import"
                  className="text-white/75 transition-colors hover:text-brand-gold"
                >
                  Import
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden truncate text-xs text-white/60 sm:inline max-w-[200px]">
            {email}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-white/35 bg-white/5 text-white hover:bg-white/15 hover:text-white"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
