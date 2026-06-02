"use client";

/**
 * OPD operational hub — oq-07 revision.
 *
 * Changes from baseline:
 *   - Lifts queue entry state out of DoctorQueueBoard into this component so
 *     counts can be computed once and shared with the status filter chips.
 *   - Mounts <OpdQueueStatusFilter> in the sticky stack above the table.
 *   - Passes `filter` from useOpdQueueFilters into <OpdQueueTable>.
 *   - Replaces the bespoke DoctorQueueBoard with OpdQueueTable.
 *   - Preserves slot-mode branch unchanged.
 *
 * DoctorQueueBoard is kept in the codebase for now; it will be deleted in
 * the oq-04 Composer clean-up pass once the dense-row component lands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { buildCockpitAppointmentPath, COCKPIT_DATE_PARAM } from "@/lib/cockpit/back-target";
import { isPastDate, parseOpdSessionDateParam, todayLocalIso } from "@/lib/dates";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { patchDoctorQueueEntry } from "@/lib/api";
import { useOpdSessionQuery } from "@/hooks/queries/useOpdSessionQuery";
import type {
  DoctorQueueSessionRow,
  SlotSessionCounts,
  SlotSessionRow,
} from "@/types/opd-doctor";
import type { OpdSessionPayload } from "@/types/opd-session";
import {
  OpdQueueStatusFilter,
  computeFilterCounts,
} from "./OpdQueueStatusFilter";
import { OpdQueueTable } from "./OpdQueueTable";
import { OpdQueueMobileList } from "./OpdQueueMobileList";
import { OpdQueueSearchBox } from "./OpdQueueSearchBox";
import { OpdQueueRowActions } from "./OpdQueueRowActions";
import { OpdQueueSessionToolbar } from "./OpdQueueSessionToolbar";
import { OpdSlotSessionToolbar } from "./OpdSlotSessionToolbar";
import { OpdSlotStatusFilter } from "./OpdSlotStatusFilter";
import { OpdSlotList } from "./OpdSlotList";
import { OpdSlotMobileList } from "./OpdSlotMobileList";
import { AddSlotDialog, type AddSlotDialogMode } from "./AddSlotDialog";
import { OpdQueueGroupingToggle } from "./OpdQueueGroupingToggle";
import { useOpdQueueFilters } from "@/hooks/useOpdQueueFilters";
import { useSessionOverrun } from "@/hooks/useSessionOverrun";
import { SessionOverrunTray } from "./overrun/SessionOverrunTray";
import { useOpdQueueGrouping } from "@/hooks/useOpdQueueGrouping";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOpdQueueHotkeys } from "@/hooks/useOpdQueueHotkeys";
import { matchesOpdQueueSearch } from "./shared/opdSearchMatcher";
import { trackOpdQueueEvent, trackOpdSlotEvent } from "./opdQueueTelemetry";
import {
  filterSlotSessionRows,
  flatSlotRowsForHotkeys,
} from "./shared/opdSlotSessionListModel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgoShort(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** Fallback counts before the first slot snapshot returns (sl-03). */
const EMPTY_SLOT_COUNTS: SlotSessionCounts = {
  all: 0,
  upcoming: 0,
  running_late: 0,
  in_consultation: 0,
  completed: 0,
  missed: 0,
  cancelled: 0,
  overflow: 0,
};

// Status buckets used for visibleEntries ordering (mirrors OpdQueueTable grouping).
const NO_SHOW_STATUSES_SET = new Set(["missed", "skipped", "cancelled"]);
const ACTIVE_STATUSES_SET = new Set(["waiting", "called", "in_consultation"]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OpdTodayClientProps {
  token: string;
}

export default function OpdTodayClient({ token }: OpdTodayClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sessionDate, setSessionDate] = useState(() =>
    parseOpdSessionDateParam(searchParams.get(COCKPIT_DATE_PARAM)),
  );

  // Rehydrate when ?date= changes (browser back from cockpit).
  useEffect(() => {
    setSessionDate(parseOpdSessionDateParam(searchParams.get(COCKPIT_DATE_PARAM)));
  }, [searchParams]);

  const handleChangeSessionDate = useCallback(
    (next: string) => {
      setSessionDate(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === todayLocalIso()) {
        params.delete(COCKPIT_DATE_PARAM);
      } else {
        params.set(COCKPIT_DATE_PARAM, next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [sessionPayload, setSessionPayload] = useState<OpdSessionPayload | null>(
    null
  );
  const mode = sessionPayload?.mode ?? null;
  const modeLoading = mode === null;
  const modeChangeCount = sessionPayload?.modeChangeCount ?? 0;
  const sessionDateIsPast = useMemo(
    () => isPastDate(sessionDate),
    [sessionDate]
  );

  // Queue data — lifted so we can compute counts for the filter chips.
  const [entries, setEntries] = useState<DoctorQueueSessionRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  // Wall-clock of last successful queue fetch — drives the toolbar freshness label (oq-11).
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const [slotEntries, setSlotEntries] = useState<SlotSessionRow[]>([]);
  const [slotCounts, setSlotCounts] = useState<SlotSessionCounts | null>(null);
  const [slotIsLoading, setSlotIsLoading] = useState(false);
  const [slotError, setSlotError] = useState<Error | null>(null);
  const [slotLastUpdatedAt, setSlotLastUpdatedAt] = useState<number | null>(null);
  const slotIsMountedRef = useRef(true);

  // Inline expand — single row at a time.
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Keyboard-focused row for J/K hotkeys (task-oq-13).
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);

  // Overflow open for the focused row — tracks which entry's ⋯ menu is open
  // via the S hotkey (task-oq-13).
  const [overflowOpenEntryId, setOverflowOpenEntryId] = useState<string | null>(null);

  // Search box ref — / hotkey focuses this input (task-oq-13).
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search box ref — slot branch `/` hotkey (sl-05).
  const slotSearchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard-focused slot row + overflow (J/K/S hotkeys) — sl-05.
  const [slotFocusedRowId, setSlotFocusedRowId] = useState<string | null>(null);
  const [slotOverflowOpenId, setSlotOverflowOpenId] = useState<string | null>(null);

  const [addSlotDialog, setAddSlotDialog] = useState<{
    open: boolean;
    mode: AddSlotDialogMode;
    relatedAppointmentId: string | null;
  }>({ open: false, mode: "extra-slot", relatedAppointmentId: null });

  const openAddSlotDialog = useCallback(
    (opts?: {
      mode?: AddSlotDialogMode;
      relatedAppointmentId?: string | null;
    }) => {
      setAddSlotDialog({
        open: true,
        mode: opts?.mode ?? "extra-slot",
        relatedAppointmentId: opts?.relatedAppointmentId ?? null,
      });
    },
    []
  );

  // Session overrun tray (pdm-10) — rows past session_end + 30 min for viewed date.
  const {
    rows: overrunRows,
    error: overrunError,
    refetch: refetchOverrun,
  } = useSessionOverrun(token, sessionDate);

  // Filter state — URL-backed (`?status=` / `?q=`). Shared by queue and slot
  // branches; only one mode renders at a time, so params never collide in UI.
  const { status, setStatus, q, setQ } = useOpdQueueFilters();

  // Grouping preference (Group / Token) — localStorage-backed.
  const { grouping, setGrouping } = useOpdQueueGrouping();

  // Mobile breakpoint — below lg (1024 px) → card list layout (oq-12).
  const isCompactViewport = useMediaQuery("(max-width: 1023px)");

  // -------------------------------------------------------------------------
  // Unified session fetch (mode + entries) with polling (30 s, visibility-aware)
  // -------------------------------------------------------------------------

  const modeRef = useRef<"queue" | "slot" | null>(null);
  modeRef.current = mode;

  const sessionQuery = useOpdSessionQuery(token, sessionDate);

  const applySessionPayload = useCallback((data: OpdSessionPayload) => {
    if (!slotIsMountedRef.current) return;
    setSessionPayload(data);
    const updatedAt = new Date(data.snapshotAt).getTime();
    if (data.mode === "queue") {
      setEntries(data.entries);
      setLastUpdatedAt(updatedAt);
      setQueueError(null);
    } else {
      setSlotEntries(data.entries);
      setSlotCounts(data.counts);
      setSlotLastUpdatedAt(updatedAt);
      setSlotError(null);
    }
  }, []);

  useEffect(() => {
    slotIsMountedRef.current = true;
    setSessionPayload(null);
    return () => {
      slotIsMountedRef.current = false;
    };
  }, [token, sessionDate]);

  useEffect(() => {
    if (sessionQuery.data) {
      applySessionPayload(sessionQuery.data.data);
      setQueueLoading(false);
      setSlotIsLoading(false);
    }
  }, [sessionQuery.data, applySessionPayload]);

  useEffect(() => {
    if (!sessionQuery.isError || !sessionQuery.error) return;
    console.error("[OpdTodayClient] /opd/session fetch failed:", sessionQuery.error);
    const err = sessionQuery.error;
    const msg = err instanceof Error ? err.message : "Failed to load session";
    if (modeRef.current === "queue") {
      setQueueError(msg);
    } else if (modeRef.current === "slot") {
      setSlotError(err instanceof Error ? err : new Error("Snapshot fetch failed"));
    } else {
      setSessionPayload({
        mode: "slot",
        date: sessionDate,
        snapshotAt: new Date().toISOString(),
        modeSource: "default",
        modeChangeCount: 0,
        entries: [],
        counts: EMPTY_SLOT_COUNTS,
      });
      setSlotError(err instanceof Error ? err : new Error("Snapshot fetch failed"));
    }
    setQueueLoading(false);
    setSlotIsLoading(false);
  }, [sessionQuery.isError, sessionQuery.error, sessionDate]);

  const fetchSession = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        if (modeRef.current === "queue" || modeRef.current === null) {
          setQueueLoading(true);
        }
        if (modeRef.current === "slot" || modeRef.current === null) {
          setSlotIsLoading(true);
        }
      }
      await sessionQuery.refetch();
    },
    [sessionQuery],
  );

  const slotViewedFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "slot") return;
    if (slotEntries.length === 0 && !slotCounts) return;
    if (slotViewedFiredRef.current === sessionDate) return;
    slotViewedFiredRef.current = sessionDate;
    trackOpdSlotEvent({
      event: "opd_slot.viewed",
      counts: slotCounts ?? undefined,
    });
  }, [mode, sessionDate, slotEntries.length, slotCounts]);

  useEffect(() => {
    if (mode !== "slot") {
      slotViewedFiredRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    setSlotFocusedRowId(null);
    setSlotOverflowOpenId(null);
  }, [sessionDate]);
  // Counts — computed once, passed to filter chips AND (indirectly) the table
  // -------------------------------------------------------------------------

  const counts = useMemo(() => computeFilterCounts(entries), [entries]);

  // Fire opd_queue.viewed once after the first successful queue load (PHI-free counts only).
  const viewedFiredRef = useRef(false);
  useEffect(() => {
    if (queueLoading || viewedFiredRef.current || mode !== "queue") return;
    viewedFiredRef.current = true;
    trackOpdQueueEvent({
      event: "opd_queue.viewed",
      totalActive: counts.waiting + counts.called + counts.in_consultation,
      totalDone: counts.completed,
      totalMissed: counts.no_show,
    });
  }, [queueLoading, mode, counts]);

  // Flat ordered list of all post-filter+search entries — used by J/K hotkeys.
  const visibleEntries = useMemo<DoctorQueueSessionRow[]>(() => {
    let filtered = q
      ? entries.filter((e) => matchesOpdQueueSearch(e, q))
      : entries;
    if (status !== "all") {
      filtered =
        status === "no_show"
          ? filtered.filter((e) => NO_SHOW_STATUSES_SET.has(e.queueStatus))
          : filtered.filter((e) => e.queueStatus === status);
    }
    // Mirror the table's Active → Done → Missed ordering so J/K feels natural.
    const active = filtered
      .filter((e) => ACTIVE_STATUSES_SET.has(e.queueStatus))
      .sort((a, b) => {
        const ORDER: Record<string, number> = {
          in_consultation: 0,
          called: 1,
          waiting: 2,
        };
        const oa = ORDER[a.queueStatus] ?? 99;
        const ob = ORDER[b.queueStatus] ?? 99;
        return oa !== ob ? oa - ob : a.tokenNumber - b.tokenNumber;
      });
    const done = filtered
      .filter((e) => e.queueStatus === "completed")
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    const missed = filtered
      .filter((e) => NO_SHOW_STATUSES_SET.has(e.queueStatus))
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    return [...active, ...done, ...missed];
  }, [entries, status, q]);

  const slotOrderedForHotkeys = useMemo(() => {
    const filtered = filterSlotSessionRows(slotEntries, status, q);
    return flatSlotRowsForHotkeys(filtered, status);
  }, [slotEntries, status, q]);

  const slotHotkeyQueueShim = useMemo(
    () =>
      slotOrderedForHotkeys.map((row) => {
        const shim = {
          entryId: row.appointmentId,
          appointmentId: row.appointmentId,
          tokenNumber: row.position,
          position: row.position,
          queueStatus: "completed",
          sessionDate,
          queueCreatedAt: row.scheduledAt,
          patientName: "",
          medicalRecordNumber: null as string | null,
          patientPhone: "",
          age: null as number | null,
          gender: null as string | null,
          appointmentStatus: row.appointmentStatus,
          scheduledAt: row.scheduledAt,
          reasonForVisit: row.reasonForVisit,
          serviceLabel: row.serviceLabel,
          catalogServiceKey: row.catalogServiceKey,
          consultationType: row.consultationType,
          episodeId: row.episodeId,
          opdEventType: row.opdEventType,
          patientId: row.patientId,
          patientNote: row.patientNote,
        };
        return shim as DoctorQueueSessionRow;
      }),
    [slotOrderedForHotkeys, sessionDate]
  );

  // -------------------------------------------------------------------------
  // Row interaction handlers
  // -------------------------------------------------------------------------

  /**
   * Fire-and-forget: if the row is still `waiting`, mark it as `called` so the
   * queue reflects the doctor's intent without blocking navigation.
   * Idempotent — already-called / in-consult / completed rows skip the call.
   */
  /**
   * Open a queue row. The optional `viaKeyboard` flag is set to `true` by the
   * keyboard hotkey handler (Enter key) so telemetry can distinguish input modes.
   */
  const handleOpenRow = useCallback(
    (entry: DoctorQueueSessionRow, viaKeyboard = false) => {
      trackOpdQueueEvent({
        event: "opd_queue.row_clicked",
        statusOfClickedRow: entry.queueStatus,
        viaKeyboard,
        viaSearch: q !== "",
      });
      if (entry.queueStatus === "waiting") {
        // Intentionally fire-and-forget — errors are non-fatal; poll will heal.
        void patchDoctorQueueEntry(token, entry.entryId, "called").catch(
          () => undefined
        );
      }
      router.push(
        buildCockpitAppointmentPath(entry.appointmentId, "opd-today", {
          opdDate: sessionDate,
        }),
      );
    },
    [router, token, q, sessionDate]
  );

  const handleSlotRowNavigate = useCallback(
    (row: SlotSessionRow, viaKeyboard: boolean) => {
      setSlotFocusedRowId(row.appointmentId);
      trackOpdSlotEvent({
        event: "opd_slot.row_clicked",
        kind: viaKeyboard ? "hotkey_enter" : "pointer",
        entryId: row.appointmentId,
        slotStatus: row.slotStatus,
      });
      router.push(
        buildCockpitAppointmentPath(row.appointmentId, "opd-today", {
          opdDate: sessionDate,
        }),
      );
    },
    [router, sessionDate]
  );

  const handleRetry = useCallback(() => {
    void fetchSession();
  }, [fetchSession]);

  const handleToggleExpand = useCallback((entryId: string) => {
    setExpandedEntryId((prev) => (prev === entryId ? null : entryId));
  }, []);

  // ── Hotkeys (task-oq-13) ──────────────────────────────────────────────────

  const handleCallSilently = useCallback(
    async (entry: DoctorQueueSessionRow) => {
      if (entry.queueStatus !== "waiting") return;
      await patchDoctorQueueEntry(token, entry.entryId, "called").catch(
        () => undefined
      );
      void fetchSession();
    },
    [token, fetchSession]
  );

  const handleOpenOverflow = useCallback((entry: DoctorQueueSessionRow) => {
    setOverflowOpenEntryId(entry.entryId);
  }, []);

  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  useOpdQueueHotkeys({
    enabled: mode === "queue",
    visibleEntries,
    focusedEntryId,
    setFocusedEntryId,
    onOpen: handleOpenRow,
    onCallSilently: handleCallSilently,
    onOpenOverflow: handleOpenOverflow,
    onFocusSearch: handleFocusSearch,
  });

  const handleSlotHotkeyOpen = useCallback(
    (entry: DoctorQueueSessionRow, viaKeyboard?: boolean) => {
      const row = slotOrderedForHotkeys.find(
        (r) => r.appointmentId === entry.appointmentId
      );
      if (!row) return;
      handleSlotRowNavigate(row, Boolean(viaKeyboard));
    },
    [handleSlotRowNavigate, slotOrderedForHotkeys]
  );

  useOpdQueueHotkeys({
    enabled: mode === "slot",
    visibleEntries: slotHotkeyQueueShim,
    focusedEntryId: slotFocusedRowId,
    setFocusedEntryId: setSlotFocusedRowId,
    onOpen: handleSlotHotkeyOpen,
    onCallSilently: async () => undefined,
    onOpenOverflow: (entry) => setSlotOverflowOpenId(entry.entryId),
    onFocusSearch: () => slotSearchInputRef.current?.focus(),
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Title is mode-aware once mode is known; neutral while loading so we don't
  // flash "OPD slots · today" before settling on the queue layout.
  // The previous "Practice setup → OPD mode · Appointments" sub-line was
  // removed — those are settings/page nav and belong in the global sidebar,
  // not under the day-of-work title.  The mode pill in the toolbar is the
  // only place we still show which OPD mode is active.
  const title = modeLoading
    ? "OPD Today"
    : mode === "queue"
      ? "OPD Queue · Today"
      : "OPD Slots · Today";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>

      {overrunError && (
        <Alert variant="destructive" className="mb-3 mt-4">
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Couldn&apos;t load overrun list: {overrunError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="self-start sm:self-center"
              onClick={() => void refetchOverrun()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <SessionOverrunTray
        key={sessionDate}
        token={token}
        date={sessionDate}
        rows={overrunRows}
        onResolved={() => {
          void refetchOverrun();
          void fetchSession();
        }}
      />

      <div className="mt-4">
        {modeLoading ? (
          /*
           * Mode-agnostic skeleton — keeps the header/date picker in place so
           * the next frame's flip into queue / slot mode doesn't shift the
           * page layout.  Mirrors the queue toolbar + filter shape because
           * "queue" is the more common doctor mode (slot is the legacy fallback).
           */
          <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-7 w-72 rounded-full" />
              <Skeleton className="h-8 w-64 rounded-md" />
            </div>
            <div className="flex flex-col overflow-hidden rounded-lg border border-border">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full border-t border-border" />
              ))}
            </div>
          </div>
        ) : mode === "queue" ? (
          <div className="flex flex-col gap-3">
            {/* Session toolbar — date + mode pill, broadcast delay, offer early join, freshness */}
            <OpdQueueSessionToolbar
              token={token}
              active={entries}
              lastUpdatedAt={lastUpdatedAt}
              onRefresh={handleRetry}
              onMutationSuccess={handleRetry}
              sessionDate={sessionDate}
              onChangeSessionDate={handleChangeSessionDate}
              mode="queue"
              modeChangeCount={modeChangeCount}
              isPastDate={sessionDateIsPast}
              onModeConverted={() => void fetchSession()}
            />

            {/*
             * Filter strip — sticky, below page header.
             * Layout: search on the left, [GroupingToggle][StatusFilter] on
             * the right.  The grouping toggle sits adjacent to the chips
             * because it controls how the chip-filtered list is ordered, so
             * keeping the two affordances together makes the relationship
             * scannable.
             */}
            {/*
             * Filter strip — search left, [Group chip][StatusFilter] right.
             * The "Group" chip only appears when viewing All — it has no
             * meaning on a single-status filter (already one bucket).
             * Token asc/desc is controlled by clicking the # column header.
             */}
            <div className="sticky top-14 z-20 -mx-1 bg-background/80 px-1 pb-1 pt-0.5 backdrop-blur">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <OpdQueueSearchBox value={q} onChange={setQ} inputRef={searchInputRef} />
                <div className="flex flex-wrap items-center gap-2">
                  {status === "all" && (
                    <OpdQueueGroupingToggle
                      grouping={grouping}
                      onChange={setGrouping}
                    />
                  )}
                  <OpdQueueStatusFilter
                    value={status}
                    onChange={setStatus}
                    counts={counts}
                  />
                </div>
              </div>
            </div>

            {/* Queue table / mobile card list — layout determined by viewport */}
            {isCompactViewport ? (
              <OpdQueueMobileList
                entries={entries}
                filter={status}
                q={q}
                onOpen={handleOpenRow}
                isLoading={queueLoading}
                error={queueError}
                onRetry={handleRetry}
              />
            ) : (
              <OpdQueueTable
                entries={entries}
                filter={status}
                q={q}
                grouping={grouping}
                onChangeGrouping={setGrouping}
                isLoading={queueLoading}
                error={queueError}
                onOpenRow={handleOpenRow}
                onRetry={handleRetry}
                expandedEntryId={expandedEntryId}
                onToggleExpand={handleToggleExpand}
                focusedEntryId={focusedEntryId}
                sessionDate={sessionDate}
                lastUpdatedAt={lastUpdatedAt}
                renderActions={(entry) => (
                  <OpdQueueRowActions
                    entry={entry}
                    token={token}
                    onMutationSuccess={() => void fetchSession()}
                    overflowOpen={overflowOpenEntryId === entry.entryId}
                    onOverflowOpenChange={(open) => {
                      setOverflowOpenEntryId(open ? entry.entryId : null);
                    }}
                  />
                )}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <OpdSlotSessionToolbar
              token={token}
              entries={slotEntries}
              lastUpdatedAt={slotLastUpdatedAt}
              onRefresh={() => void fetchSession()}
              onMutationSuccess={() => void fetchSession({ silent: true })}
              sessionDate={sessionDate}
              onChangeSessionDate={handleChangeSessionDate}
              mode="slot"
              modeChangeCount={modeChangeCount}
              isPastDate={sessionDateIsPast}
              onModeConverted={() => void fetchSession()}
              onClickAddSlot={() => openAddSlotDialog({ mode: "extra-slot" })}
            />

            {/* Sticky filter strip — sl-03. Mirrors queue branch stickiness. */}
            <div className="sticky top-14 z-20 -mx-1 bg-background/80 px-1 pb-1 pt-0.5 backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <OpdSlotStatusFilter
                  value={status}
                  onChange={setStatus}
                  counts={slotCounts ?? EMPTY_SLOT_COUNTS}
                />
                <div className="w-full sm:ml-auto sm:w-auto sm:max-w-xs">
                  <OpdQueueSearchBox
                    value={q}
                    onChange={setQ}
                    inputRef={slotSearchInputRef}
                    searchTelemetryChannel="slot"
                  />
                </div>
              </div>
            </div>

            {slotError && slotEntries.length > 0 && (
              <div
                role="status"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              >
                Could not refresh. Showing last update{" "}
                {timeAgoShort(slotLastUpdatedAt ?? Date.now())}.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void fetchSession()}
                >
                  Retry
                </button>
              </div>
            )}

            <div className="hidden lg:block">
              <OpdSlotList
                entries={slotEntries}
                counts={slotCounts ?? EMPTY_SLOT_COUNTS}
                statusFilter={status}
                searchQuery={q}
                token={token}
                sessionDate={sessionDate}
                isLoading={slotIsLoading}
                onMutationSuccess={() => void fetchSession({ silent: true })}
                onRowClick={(entry) => handleSlotRowNavigate(entry, false)}
                focusedRowId={slotFocusedRowId}
                onFocusChange={setSlotFocusedRowId}
                overflowOpenId={slotOverflowOpenId}
                onOverflowOpenChange={setSlotOverflowOpenId}
                onClearSearch={() => setQ("")}
                onResetStatusFilter={() => setStatus("all")}
                onOpenAddSlotDialog={openAddSlotDialog}
              />
            </div>

            <div className="lg:hidden">
              <OpdSlotMobileList
                entries={slotEntries}
                counts={slotCounts ?? EMPTY_SLOT_COUNTS}
                statusFilter={status}
                searchQuery={q}
                token={token}
                sessionDate={sessionDate}
                isLoading={slotIsLoading}
                onMutationSuccess={() => void fetchSession({ silent: true })}
                onRowClick={(entry) => handleSlotRowNavigate(entry, false)}
                focusedRowId={slotFocusedRowId}
                onFocusChange={setSlotFocusedRowId}
                overflowOpenId={slotOverflowOpenId}
                onOverflowOpenChange={setSlotOverflowOpenId}
                onClearSearch={() => setQ("")}
                onResetStatusFilter={() => setStatus("all")}
                onOpenAddSlotDialog={openAddSlotDialog}
              />
            </div>

            <AddSlotDialog
              open={addSlotDialog.open}
              onOpenChange={(open) =>
                setAddSlotDialog((prev) => ({ ...prev, open }))
              }
              mode={addSlotDialog.mode}
              sessionDate={sessionDate}
              relatedAppointmentId={addSlotDialog.relatedAppointmentId}
              slotEntries={slotEntries}
              token={token}
              onSuccess={() => void fetchSession()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
