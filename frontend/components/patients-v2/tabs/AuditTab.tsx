"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";

export interface AuditTabProps {
  patientId: string;
  token: string;
}

/**
 * Per-patient audit API is not wired in Phase 1 (pr-12).
 * Surfaces a graceful placeholder until a filtered endpoint ships.
 */
export function AuditTab({ patientId, token }: AuditTabProps) {
  void token;

  useTabOpenedTelemetry("audit", patientId);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        Audit log coming soon — per-patient filtering is planned for Phase 2. Use the
        global audit page to review clinic-wide activity in the meantime.
      </p>
      <Link
        href="/dashboard/audit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        Open global audit
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
