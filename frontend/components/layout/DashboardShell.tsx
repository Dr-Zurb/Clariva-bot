"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface DashboardShellProps {
  userEmail?: string | null;
  children: React.ReactNode;
}

/**
 * Client wrapper for dashboard shell: header, sidebar, main.
 * Holds mobile menu state for responsive collapsible sidebar.
 * @see e-task-3; FRONTEND_ARCHITECTURE (layout)
 */
export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        userEmail={userEmail}
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
