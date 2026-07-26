/**
 * Admin verification list.
 *
 * Query: ?status=… &q=… &submitted=today|7d|30d|custom &from=… &to=…
 */

import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { VerificationsListClient } from "@/components/admin/verifications/VerificationsListClient";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminAuth } from "@/lib/auth/server-user";
import type { AdminVerificationListStatus } from "@/lib/api";

export const metadata = { title: "Verifications · Admin" };

const ALLOWED: AdminVerificationListStatus[] = [
  "pending_review",
  "changes_requested",
  "verified",
  "rejected",
];

function parseStatus(raw: string | string[] | undefined): AdminVerificationListStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (ALLOWED as string[]).includes(value)) {
    return value as AdminVerificationListStatus;
  }
  return "pending_review";
}

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ status?: string | string[]; q?: string | string[] }>
    | { status?: string | string[]; q?: string | string[] };
}) {
  const { token } = await requireAdminAuth();
  const params = await Promise.resolve(searchParams);
  const status = parseStatus(params.status);

  return (
    <div>
      <AdminPageHeader
        title="Verifications"
        description="Click a name for the profile · Cert / ID to preview · Approve when details match."
      />
      <Suspense
        fallback={
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <VerificationsListClient token={token} status={status} />
      </Suspense>
    </div>
  );
}
