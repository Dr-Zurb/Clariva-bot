"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardPlus } from "lucide-react";

import { useDeskTodayQuery } from "@/hooks/queries/useDeskTodayQuery";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/desk", label: "Check-in", icon: ClipboardPlus, exact: true },
  { href: "/desk/today", label: "Today", icon: CalendarDays, exact: true, badge: "waiting" as const },
] as const;

export function DeskTabBar({ token }: { token: string }) {
  const pathname = usePathname();
  const { counts } = useDeskTodayQuery(token);
  const waiting = counts.waiting;

  return (
    <nav
      className="flex shrink-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Front desk"
    >
      {TABS.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        const showBadge = "badge" in tab && waiting > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={2} />
              {showBadge ? (
                <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground tabular-nums">
                  {waiting > 99 ? "99+" : waiting}
                </span>
              ) : null}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
