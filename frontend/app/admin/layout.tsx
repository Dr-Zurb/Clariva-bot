/**
 * Admin console shell — gated to `app_metadata.role === 'admin'`.
 * Visual language mirrors the doctor dashboard (AdminShell).
 */

import { AdminShell } from "@/components/admin/AdminShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { requireAdminAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Admin · Halo Aid" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminAuth();

  return (
    <QueryProvider>
      <AdminShell>{children}</AdminShell>
    </QueryProvider>
  );
}
