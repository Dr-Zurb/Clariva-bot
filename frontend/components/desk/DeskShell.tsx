"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardPlus,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

import { DeskHeaderStatus } from "@/components/desk/DeskHeaderStatus";
import { DeskTabBar } from "@/components/desk/DeskTabBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLogout } from "@/hooks/useLogout";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "clariva.desk.sidebar.collapsed";

const NAV = [
  { href: "/desk", label: "Check-in", icon: ClipboardPlus, exact: true },
  { href: "/desk/today", label: "Today", icon: CalendarDays, exact: true },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "FD";
}

const navLinkChrome = cn(
  "relative flex items-center rounded-md py-2 text-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
);

/**
 * Front-desk shell — lg+ sidebar like the doctor app; phones/tablets use
 * a bottom tab bar. Brand lives in the header, never the rail.
 */
export function DeskShell({
  children,
  actorKind,
  profileName,
  profileEmail,
  token,
}: {
  children: React.ReactNode;
  actorKind: "receptionist" | "doctor";
  profileName: string;
  profileEmail?: string | null;
  token: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const handleLogout = useLogout();
  const role = actorKind === "doctor" ? "Doctor" : "Receptionist";

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === "true");
    } catch {
      // localStorage unavailable
    }
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function renderNavItem({
    href,
    label,
    icon: Icon,
    exact,
  }: {
    href: string;
    label: string;
    icon: React.ComponentType<LucideProps>;
    exact: boolean;
  }) {
    const isActive = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

    const linkEl = (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          navLinkChrome,
          collapsed ? "justify-center px-2" : "px-3",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground hover:bg-muted/50"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} strokeWidth={2} />
        {!collapsed && label}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={href}>
          <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return <span key={href}>{linkEl}</span>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header
          className={cn(
            "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border px-4",
            "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          )}
        >
          <div className="flex items-center gap-2">
            <Link
              href="/desk"
              className="flex select-none items-center gap-2"
              aria-label="Halo Aid Front desk home"
            >
              <Image
                src="/brand/halo-logomark.svg"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0"
                priority
                aria-hidden
              />
              <span className="hidden text-base font-semibold text-foreground sm:inline">
                Halo Aid
              </span>
            </Link>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              Front desk
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            {token ? <DeskHeaderStatus token={token} /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open profile menu">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {initials(profileName)}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{profileName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profileEmail?.trim() || role}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/desk/account"
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <UserRound className="h-4 w-4" />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleLogout()}
                  className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "relative z-50 hidden flex-col border-r border-border bg-background lg:flex",
              "flex-shrink-0 transition-[width] duration-200 ease-in-out",
              collapsed ? "w-14" : "w-56"
            )}
          >
            {!collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    aria-label="Collapse sidebar"
                    className={cn(
                      "absolute right-2 top-2 z-10 flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors",
                      "hover:bg-muted/50 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                  >
                    <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            ) : null}

            <nav
              className={cn(
                "flex flex-1 flex-col gap-0.5 p-3",
                collapsed ? "pt-3" : "pt-10"
              )}
              aria-label="Front desk navigation"
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleCollapse}
                      aria-label="Expand sidebar"
                      className={cn(
                        navLinkChrome,
                        "w-full justify-center px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              ) : null}

              {NAV.map(renderNavItem)}

              {actorKind === "doctor" ? (
                collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/dashboard"
                        className={cn(
                          navLinkChrome,
                          "justify-center px-2 text-foreground hover:bg-muted/50"
                        )}
                      >
                        <Stethoscope className="h-4 w-4 shrink-0" strokeWidth={2} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Doctor app</TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    href="/dashboard"
                    className={cn(navLinkChrome, "px-3 text-foreground hover:bg-muted/50")}
                  >
                    <Stethoscope className="mr-2 h-4 w-4 shrink-0" strokeWidth={2} />
                    Doctor app
                  </Link>
                )
              ) : null}
            </nav>
          </aside>

          <main
            id="desk-main"
            tabIndex={-1}
            className={cn(
              "flex min-h-0 flex-1 flex-col p-4 lg:p-6",
              pathname === "/desk" ? "lg:overflow-hidden" : "overflow-auto"
            )}
          >
            {children}
          </main>
        </div>

        {token ? <DeskTabBar token={token} /> : null}
      </div>
    </TooltipProvider>
  );
}
