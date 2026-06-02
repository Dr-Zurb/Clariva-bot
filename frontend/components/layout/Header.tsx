"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Video } from "lucide-react";
import { DashboardEventsBell } from "@/components/dashboard/DashboardEventsBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PracticePill } from "./PracticePill";
import { HeaderProfileMenu } from "./HeaderProfileMenu";

interface HeaderProps {
  userEmail?: string | null;
  /**
   * Plan 07 · Task 30: Supabase access token forwarded to the
   * notifications bell. Empty string suppresses the bell entirely.
   */
  token?: string;
  onMenuToggle?: () => void;
  /**
   * task-ui-B4 — invoked when the user clicks the Cmd-K search trigger.
   * Optional so the header still renders if a callsite forgets to pass
   * it (the trigger goes inert in that case rather than crashing).
   */
  onOpenSearch?: () => void;
}

/**
 * Dashboard top bar — three-zone layout.
 *
 * Left  : mobile-menu toggle (md:hidden), brand logomark + wordmark,
 *         PracticePill (practice name · specialty).
 * Center: Cmd-K search trigger — opens the global command palette
 *         (`GlobalCommandPalette`, mounted in `DashboardShell`) on click
 *         or via the `Cmd+K` / `Ctrl+K` shortcut handled at the shell.
 * Right : "Start consult" primary CTA, DashboardEventsBell, profile dropdown.
 *
 * All colours use semantic design tokens; no raw `bg-white` / `text-gray-*`.
 *
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B1-header-redesign.md
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B4-cmd-k-global-search.md
 * @see e-task-3; FRONTEND_COMPLIANCE (email for identity only)
 */
export function Header({
  userEmail,
  token,
  onMenuToggle,
  onOpenSearch,
}: HeaderProps) {
  // cs-09 — hide the global "Start consult" CTA when the doctor is already
  // inside the cockpit (/dashboard/appointments/:id). The cockpit exposes its
  // own primary action; two competing CTAs split attention.
  const pathname = usePathname();
  const isOnCockpit = pathname?.startsWith("/dashboard/appointments/") ?? false;

  // task-ui-B4 — show the platform-correct keyboard hint. macOS shows
  // ⌘K; everything else shows Ctrl K. The shortcut itself listens for
  // both metaKey AND ctrlKey on every platform (handled in the shell)
  // so this only affects the visual hint.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMac(/Mac|iPod|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-border px-4",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      )}
    >
      {/* ── Left zone ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Mobile menu toggle — hidden on md+ */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Brand logomark + wordmark */}
        <Link
          href="/dashboard"
          className="flex select-none items-center gap-2"
          aria-label="Clariva home"
        >
          <Image
            src="/brand/logomark.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
            priority
            aria-hidden="true"
          />
          <span className="hidden text-base font-semibold text-foreground sm:inline">
            Clariva
          </span>
        </Link>

        {/* Practice-context pill (hidden on <sm) */}
        {token ? (
          <PracticePill token={token} userEmail={userEmail} />
        ) : null}
      </div>

      {/* ── Center zone — md+ only ────────────────────────────────────── */}
      {/* On xl+: full Cmd-K search trigger. On md–xl: icon + popover (cpv-07).
          The shortcut itself is attached at DashboardShell so it works
          regardless of viewport. */}
      {/* On mobile: simple flex-1 spacer so right zone stays at edge. */}
      <div className="hidden flex-1 justify-center md:flex">
        {/* Expanded search — xl+ (1280px) */}
        <div
          className="hidden xl:flex"
          data-testid="header-search-expanded"
        >
          <button
            type="button"
            onClick={onOpenSearch}
            disabled={!onOpenSearch}
            className={cn(
              "flex w-72 items-center gap-2 rounded-md border border-input",
              "bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-sm",
              "transition-colors hover:bg-accent lg:w-96",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
            aria-label={isMac ? "Search (⌘K)" : "Search (Ctrl K)"}
          >
            <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="pointer-events-none rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
        </div>

        {/* Collapsed search — below xl */}
        <div className="xl:hidden" data-testid="header-search-collapsed">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!onOpenSearch}
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <Input
                type="search"
                placeholder="Search…"
                autoFocus
                onFocus={() => onOpenSearch?.()}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {/* Mobile spacer — hidden on md+ so only one flex-1 is active at a time */}
      <div className="flex-1 md:hidden" />

      {/* ── Right zone ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {/* "Start consult" primary CTA — hidden on mobile (use menu drawer)
            and suppressed on the cockpit page (cs-09) where the cockpit
            exposes its own primary action inside ReadyCard. */}
        {!isOnCockpit && (
          <Button asChild variant="default" size="sm" className="hidden sm:inline-flex">
            <Link href="/dashboard/opd-today">
              <Video className="h-4 w-4" />
              Start consult
            </Link>
          </Button>
        )}

        {/* Notifications bell — preserved; hidden when no token */}
        {token ? <DashboardEventsBell token={token} /> : null}

        {/* Profile dropdown — logout + settings + theme placeholder */}
        <HeaderProfileMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
