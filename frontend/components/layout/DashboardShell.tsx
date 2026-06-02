"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { useDashboardCounts } from "@/hooks/useDashboardCounts";
import { DashboardPushOptInPrompt } from "@/components/dashboard/DashboardPushOptInPrompt";
import { NavPerfTracker } from "@/lib/nav-perf/nav-timing";
import { QueryProvider } from "@/components/providers/QueryProvider";

const SIDEBAR_COLLAPSED_KEY = "clariva.sidebar.collapsed";

/** Tags whose focused element should NOT trigger the Cmd-K shortcut.
 *  Doctors typing into Rx forms / chart fields shouldn't accidentally
 *  open the palette — only fire when no editable surface owns focus. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

interface DashboardShellProps {
  userEmail?: string | null;
  /**
   * Plan 07 · Task 30: optional Supabase access token. Forwarded to the
   * header so the unread-notifications bell can poll
   * `/api/v1/dashboard/events?unread=true`. Empty string suppresses the
   * bell entirely (the layout passes `""` when no session is present).
   * Also used by useDashboardCounts to poll badge counts.
   */
  token?: string;
  children: React.ReactNode;
}

/**
 * Client wrapper for dashboard shell: header, sidebar, main.
 *
 * State lifted here:
 *   - mobileMenuOpen: responsive drawer toggle
 *   - sidebarCollapsed: desktop collapse-to-icons (persisted in localStorage)
 *   - counts: live badge counts via useDashboardCounts (30 s polling)
 *
 * @see task-ui-B3; U2.8 + U2.9 in plan-ui-system-redesign.md
 */
export function DashboardShell(props: DashboardShellProps) {
  return (
    <QueryProvider>
      <DashboardShellInner {...props} />
    </QueryProvider>
  );
}

function DashboardShellInner({ userEmail, token, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Default false (expanded) avoids SSR/hydration mismatch — real value is
  // read from localStorage in the effect below (one-frame reconcile on mount).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // task-ui-B4 — Cmd-K palette open state. Lifted here so the header
  // search trigger and the global keyboard listener can both flip it.
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) setSidebarCollapsed(stored === "true");
    } catch {
      // localStorage unavailable (private browsing, sandboxed iframe, etc.).
    }
  }, []);

  const handleToggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Ignore write failures.
      }
      return next;
    });
  };

  // task-ui-B4 — global Cmd+K / Ctrl+K listener. Listen on both shortcuts
  // on every platform (the spec notes that platform detection is only for
  // the visual hint, not the keybinding). Ignore the event when an
  // editable element owns focus — doctors typing into the Rx form should
  // not have their `K` swallowed.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcutKey =
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey);
      if (!isShortcutKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setPaletteOpen((prev) => !prev);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleOpenPalette = useCallback(() => setPaletteOpen(true), []);

  const { counts } = useDashboardCounts(token ?? "");

  return (
    <div className="flex min-h-screen flex-col">
      <NavPerfTracker />
      <Header
        userEmail={userEmail}
        token={token}
        onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
        onOpenSearch={handleOpenPalette}
      />
      <div className="flex flex-1">
        <Sidebar
          isMobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          counts={counts}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <main
          className="flex-1 overflow-auto p-4 md:p-6"
          id="dashboard-main"
          tabIndex={-1}
        >
          {token ? <DashboardPushOptInPrompt accessToken={token} /> : null}
          {children}
        </main>
      </div>
      {/* task-ui-B4 — Cmd-K palette mounted at the shell level so it
          floats above all dashboard pages. The keyboard listener above
          and the header search trigger both flip `paletteOpen`. */}
      <GlobalCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        token={token ?? ""}
      />
    </div>
  );
}
