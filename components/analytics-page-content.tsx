"use client";

import { AnalyticsFilters } from "@/components/analytics-filters";
import type { AnalyticsUrlState } from "@/lib/analytics";
import { analyticsUrlStateKey } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

type LocationOption = { id: string; name: string };

type Props = {
  locations: LocationOption[];
  loanTypeOptions: string[];
  initial: AnalyticsUrlState;
  children: ReactNode;
};

export function AnalyticsPageContent({
  locations,
  loanTypeOptions,
  initial,
  children,
}: Props) {
  const router = useRouter();
  const [isApplying, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="relative space-y-6">
      {isApplying ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-background/85 p-8 shadow-sm backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          <Loader2
            className="h-10 w-10 animate-spin text-primary"
            aria-hidden
          />
          <p className="text-center text-sm font-medium text-foreground">
            Updating analytics…
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Applying your filters. This may take a moment.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "space-y-6 transition-opacity duration-200",
          isApplying && "pointer-events-none select-none opacity-50",
        )}
      >
        <AnalyticsFilters
          key={analyticsUrlStateKey(initial)}
          locations={locations}
          loanTypeOptions={loanTypeOptions}
          initial={initial}
          navigate={navigate}
          isApplying={isApplying}
        />

        {children}
      </div>
    </div>
  );
}
