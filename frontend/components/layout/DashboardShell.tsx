"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  userEmail?: string | null;
  /**
   * Plan 07 · Task 30: optional Supabase access token. Forwarded to the
   * header so the unread-notifications bell can poll
   * `/api/v1/dashboard/events?unread=true`. Empty string suppresses the
   * bell entirely (the layout passes `""` when no session is present).
   */
  token?: string;
  children: React.ReactNode;
}

/**
 * Client wrapper for dashboard shell: header, sidebar, main.
 * Holds mobile menu state for responsive collapsible sidebar.
 * @see e-task-3; FRONTEND_ARCHITECTURE (layout)
 */
export function DashboardShell({ userEmail, token, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        userEmail={userEmail}
        token={token}
        onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
      />
      <div className="flex flex-1">
        <Sidebar
          isMobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
        <main
          className="flex-1 overflow-auto p-4 md:p-6"
          id="dashboard-main"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
