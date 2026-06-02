"use client";

/**
 * useOpdSnapshot (task-ui-C3, np-05)
 *
 * Doctor settings (once) + live OPD queue session (polled every 30 s).
 * Queue data shares `queryKeys.opd.queueSession` with useDashboardCounts.
 */

import { useCallback, useMemo } from "react";
import { todayLocalIso } from "@/lib/dates";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";
import { useDoctorSettingsQuery } from "@/hooks/queries/useDoctorSettingsQuery";
import { useOpdQueueSessionQuery } from "@/hooks/queries/useOpdQueueSessionQuery";

const STRIP_MAX = 5;

const OPD_ACTIVE_STATUSES = new Set(["waiting", "called", "in_consultation"]);
const OPD_DONE_STATUSES = new Set(["completed"]);
const OPD_MISSED_STATUSES = new Set(["missed", "skipped", "cancelled"]);

export interface OpdSnapshotState {
  isOpdEnabled: boolean | null;
  active: DoctorQueueSessionRow[];
  done: DoctorQueueSessionRow[];
  missed: DoctorQueueSessionRow[];
  totalActive: number;
  totalInConsult: number;
  totalDone: number;
  totalMissed: number;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
  lastUpdatedAt: number | null;
  /** @deprecated use `active` */
  entries: DoctorQueueSessionRow[];
}

export function useOpdSnapshot(token: string, dateOverride?: string): OpdSnapshotState {
  const date = dateOverride ?? todayLocalIso();

  const settingsQuery = useDoctorSettingsQuery(token);
  const queueQuery = useOpdQueueSessionQuery(token, date);

  const snapshot = useMemo(() => {
    const all = (queueQuery.data?.data.entries ?? []) as DoctorQueueSessionRow[];

    const activeAll = all.filter((entry) => OPD_ACTIVE_STATUSES.has(entry.queueStatus));
    const doneAll = all.filter((entry) => OPD_DONE_STATUSES.has(entry.queueStatus));
    const missedAll = all.filter((entry) => OPD_MISSED_STATUSES.has(entry.queueStatus));
    const inConsultCount = activeAll.filter(
      (entry) => entry.queueStatus === "in_consultation",
    ).length;

    return {
      active: activeAll.slice(0, STRIP_MAX),
      done: doneAll,
      missed: missedAll,
      totalActive: activeAll.length,
      totalInConsult: inConsultCount,
      totalDone: doneAll.length,
      totalMissed: missedAll.length,
    };
  }, [queueQuery.data]);

  const isOpdEnabled = settingsQuery.data
    ? settingsQuery.data.data.settings.opd_mode === "queue"
    : settingsQuery.isPending
      ? null
      : null;

  const isLoading =
    Boolean(token) &&
    (settingsQuery.isLoading || (queueQuery.isLoading && !queueQuery.data));

  const retry = useCallback(() => {
    void settingsQuery.refetch();
    void queueQuery.refetch();
  }, [queueQuery, settingsQuery]);

  const lastUpdatedAt =
    queueQuery.dataUpdatedAt > 0 ? queueQuery.dataUpdatedAt : null;

  return {
    isOpdEnabled,
    ...snapshot,
    isLoading,
    error: (queueQuery.error ?? settingsQuery.error ?? null) as Error | null,
    retry,
    lastUpdatedAt,
    entries: snapshot.active,
  };
}
