"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { isCockpitAppointmentPath } from "@/lib/dashboard/cockpit-path";
import { DASHBOARD_SHELL_ID } from "@/lib/dashboard/cockpit-fullscreen";
import {
  DashboardLiveFocusProvider,
  useDashboardLiveFocus,
} from "./DashboardLiveFocusContext";
import { useDashboardCounts } from "@/hooks/useDashboardCounts";
import { useOnboardingStatusQuery } from "@/hooks/queries/useOnboardingStatusQuery";
import { useVerificationStatusQuery } from "@/hooks/queries/useVerificationStatusQuery";
import { NavPerfTracker } from "@/lib/nav-perf/nav-timing";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { cn } from "@/lib/utils";

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
  /** admin-console-v2: show Admin console link in the profile menu. */
  isAdmin?: boolean;
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
      <DashboardLiveFocusProvider>
        <DashboardShellInner {...props} />
      </DashboardLiveFocusProvider>
    </QueryProvider>
  );
}

function DashboardShellInner({
  userEmail,
  token,
  isAdmin = false,
  children,
}: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Default false (expanded) avoids SSR/hydration mismatch — real value is
  // read from localStorage in the effect below (one-frame reconcile on mount).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { liveFocus } = useDashboardLiveFocus();
  const pathname = usePathname();
  const isCockpit = isCockpitAppointmentPath(pathname);
  // Settings fills this pane and scrolls under the breadcrumb. A second
  // overflow-y-auto here stacked two scrollbars on long settings pages.
  const isSettingsPath = pathname.startsWith("/dashboard/settings");
  // Cockpit + live consult force icon-rail nav without writing localStorage.
  const effectiveSidebarCollapsed =
    liveFocus || isCockpit || sidebarCollapsed;
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

  const accessToken = token ?? "";
  const { counts } = useDashboardCounts(accessToken);
  const { data: onboarding } = useOnboardingStatusQuery(accessToken);
  const { data: verification } = useVerificationStatusQuery(accessToken);
  // GS-D5: one setup tab — hide only when setup + license are both done.
  const hideGettingStarted =
    onboarding?.complete === true && verification?.status === "verified";

  useEffect(() => {
    const html = document.documentElement;
    const { overflow: htmlOverflow } = html.style;
    const { overflow: bodyOverflow } = document.body.style;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <div
      id={DASHBOARD_SHELL_ID}
      className="flex h-dvh max-h-dvh flex-col overflow-hidden"
      data-live-focus={liveFocus ? "true" : "false"}
      data-cockpit-focus={isCockpit ? "true" : "false"}
    >
      <NavPerfTracker />
      {isCockpit ? null : (
        <Header
          userEmail={userEmail}
          token={token}
          isAdmin={isAdmin}
          onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
          onOpenSearch={handleOpenPalette}
        />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          isMobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          counts={counts}
          collapsed={effectiveSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          hideGettingStarted={hideGettingStarted}
        />
        <main
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
            isCockpit ? "p-0" : "p-4 md:p-6",
          )}
          id="dashboard-main"
          tabIndex={-1}
        >
          <div
            className={cn(
              "absolute flex min-h-0 flex-col",
              isCockpit
                ? "inset-0 overflow-hidden"
                : cn(
                    "inset-4 overflow-x-hidden md:inset-6",
                    isSettingsPath ? "overflow-hidden" : "overflow-y-auto",
                  ),
            )}
          >
            {children}
          </div>
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
