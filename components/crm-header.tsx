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
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/applications" className="text-foreground hover:underline">
            Applications
          </Link>
          {role === "admin" && (
            <>
              <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
                Users
              </Link>
              <Link href="/admin/locations" className="text-muted-foreground hover:text-foreground">
                Locations
              </Link>
              <Link href="/admin/analytics" className="text-muted-foreground hover:text-foreground">
                Analytics
              </Link>
              <Link
                href="/admin/automation-rules"
                className="text-muted-foreground hover:text-foreground"
              >
                Automation
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden truncate text-xs text-muted-foreground sm:inline max-w-[200px]">
            {email}
          </span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
