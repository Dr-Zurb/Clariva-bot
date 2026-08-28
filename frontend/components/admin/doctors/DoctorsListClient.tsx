"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { DoctorFunnelBadge } from "@/components/admin/doctors/DoctorFunnelBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDoctorsQuery } from "@/hooks/queries/useAdminDoctorsQuery";
import type { AdminDoctorFunnelStatus } from "@/lib/api";

type FilterValue = AdminDoctorFunnelStatus | "all";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "onboarding", label: "Onboarding" },
  { value: "pending_review", label: "Pending" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

interface DoctorsListClientProps {
  token: string;
  status: FilterValue;
}

/**
 * admin-console-v3 · doctors directory with funnel badges.
 * Invite/resend retired in auth-v2. Never logs doctor emails.
 */
export function DoctorsListClient({ token, status }: DoctorsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterStatus = status === "all" ? undefined : status;
  const { data, isLoading, isError, refetch } = useAdminDoctorsQuery(
    token,
    filterStatus,
  );

  function setStatus(next: FilterValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("status");
    } else {
      params.set("status", next);
    }
    const qs = params.toString();
    router.replace(qs ? `/admin/doctors?${qs}` : "/admin/doctors");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            className="h-8 rounded-md px-2.5 text-xs"
            variant={status === f.value ? "default" : "ghost"}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="text-destructive">Could not load doctors.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && (data?.length ?? 0) === 0 ? (
        <p className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No doctors
          {status === "all"
            ? ""
            : ` in “${FILTERS.find((f) => f.value === status)?.label ?? status}”`}
          .
        </p>
      ) : null}

      {!isLoading && !isError && data && data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Practice
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 px-3 text-xs font-medium text-muted-foreground">
                  Created
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const canView = row.verificationStatus != null;
                return (
                  <TableRow
                    key={row.doctorId}
                    className="h-10 border-border/50 hover:bg-muted/40"
                  >
                    <TableCell className="max-w-[220px] truncate py-1.5 font-mono text-xs">
                      {row.email}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5">
                      {canView ? (
                        <Link
                          href={`/admin/verifications/${row.doctorId}`}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {row.fullName ?? "Untitled"}
                        </Link>
                      ) : (
                        <span className="font-medium">
                          {row.fullName ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="space-y-0.5">
                        <div className="truncate">{row.practiceName ?? "—"}</div>
                        {row.specialty ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {row.specialty}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5">
                      <DoctorFunnelBadge status={row.funnelStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-right">
                      {canView ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                        >
                          <Link href={`/admin/verifications/${row.doctorId}`}>
                            View
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
