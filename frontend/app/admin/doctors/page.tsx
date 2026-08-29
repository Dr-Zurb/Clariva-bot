/**
 * Admin doctors directory.
 *
 * Funnel filter via
 * ?status=onboarding|pending_review|changes_requested|verified|rejected
 * (omit for all).
 */

import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DoctorsListClient } from "@/components/admin/doctors/DoctorsListClient";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminAuth } from "@/lib/auth/server-user";
import type { AdminDoctorFunnelStatus } from "@/lib/api";

export const metadata = { title: "Doctors · Admin" };

const ALLOWED: AdminDoctorFunnelStatus[] = [
  "onboarding",
  "pending_review",
  "changes_requested",
  "verified",
  "rejected",
];

type FilterValue = AdminDoctorFunnelStatus | "all";

function parseStatus(raw: string | string[] | undefined): FilterValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (ALLOWED as string[]).includes(value)) {
    return value as AdminDoctorFunnelStatus;
  }
  return "all";
}

export default async function AdminDoctorsPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ status?: string | string[] }>
    | { status?: string | string[] };
}) {
  const { token } = await requireAdminAuth();
  const params = await Promise.resolve(searchParams);
  const status = parseStatus(params.status);

  return (
    <div>
      <AdminPageHeader
        title="Doctors"
        description="Self-serve signups — open verification when a doctor submits credentials."
      />
      <Suspense
        fallback={
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <DoctorsListClient token={token} status={status} />
      </Suspense>
    </div>
  );
}
