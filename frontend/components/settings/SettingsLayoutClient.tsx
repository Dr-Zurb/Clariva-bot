"use client";

import { Breadcrumb } from "@/components/layout/Breadcrumb";

/**
 * Client chrome for Settings (breadcrumb only).
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
    <div>
      <Breadcrumb />
      {children}
    </div>
  );
}
