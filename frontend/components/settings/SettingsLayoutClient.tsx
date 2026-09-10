"use client";

import { Breadcrumb } from "@/components/layout/Breadcrumb";

/**
 * Client chrome for Settings (breadcrumb only).
 *
 * Fills the dashboard main so leaf pages can lock to the viewport.
 * Other settings pages still scroll in the content pane below the crumb.
 *
 * Do NOT put `key={pathname}` on `{children}` — that pulls Server Component
 * pages (with `server-only` / requireDashboardAuth) into the client graph and
 * fails the build. Fresh data comes from useDoctorSettingsForm / React Query.
 */
export function SettingsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <Breadcrumb />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </div>
  );
}
