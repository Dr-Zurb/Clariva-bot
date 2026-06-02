"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Check, CheckCircle2, HelpCircle, RefreshCw, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewCard } from "@/components/service-reviews/ReviewCard";
import { ReviewDetailSheet } from "@/components/service-reviews/ReviewDetailSheet";
import { ReviewToolbar } from "@/components/service-reviews/ReviewToolbar";
import { useActionToasts } from "@/components/service-reviews/ActionToast";
import { ConfidenceBadge } from "@/components/service-reviews/ConfidenceBadge";
import {
  QueuedAgeLabel,
  SlaCountdown,
  useTickInterval,
} from "@/components/service-reviews/SlaCountdown";
import type {
  ServiceStaffReviewListItem,
  ServiceStaffReviewListQueryStatus,
} from "@/types/service-staff-review";
import type { DoctorSettings } from "@/types/doctor-settings";
import type { ServiceCatalogV1 } from "@/lib/service-catalog-schema";
import {
  getServiceStaffReviews,
  postCancelServiceStaffReview,
  postConfirmServiceStaffReview,
  postReassignServiceStaffReview,
} from "@/lib/api";
import {
  formatCandidateSummary,
  matchExplanationSummary,
  matchReasonChipMeta,
  parseCandidateLabels,
  parseMatchReasonCodes,
} from "@/lib/staff-review-match-explain";
import { formatDateTime } from "@/lib/format-date";
import { formatTimeUntil } from "@/lib/relative-time";
import { scheduleCommit, type DeferredCommit } from "@/lib/service-reviews/deferred-commit";
import { runBulkConfirm } from "@/lib/service-reviews/bulk-confirm";
import { useReviewKeyboard } from "@/lib/service-reviews/useReviewKeyboard";
import { findNewPendingRows } from "@/lib/service-reviews/pending-new-rows";
import {
  quickResolveButtonResolutions,
  resolveQuickResolveAction,
} from "@/lib/service-reviews/quick-resolve";
import {
  filterReviews,
  REVIEW_DENSITY_STORAGE_KEY,
  sortReviews,
  type ConfidenceFilter,
  type ReviewDensity,
  type SortMode,
} from "@/lib/service-reviews/filter-sort";
import { useReviewsPolling } from "@/lib/service-reviews/useReviewsPolling";
import { cn } from "@/lib/utils";

const UNDO_MS = 5000;

const CONFIRM_OK_MESSAGE =
  "Saved. We messaged the patient on Instagram with a link to pick a time and finish booking (opens your booking page).";

const OK_REASSIGN_MESSAGE =
  "Saved. We messaged the patient on Instagram with a link to pick a time and finish booking.";

const TEXTAREA_CLASS =
  "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const MODALITY_NONE = "__none__";

function countDueWithin1h(rows: ServiceStaffReviewListItem[], nowMs: number): number {
  return rows.filter(
    (r) => r.sla_deadline_at && formatTimeUntil(r.sla_deadline_at, nowMs).urgency !== "later"
  ).length;
}

function labelForServiceKey(
  catalog: ServiceCatalogV1 | null | undefined,
  key: string
): string | null {
  if (!catalog?.services?.length) return null;
  const k = key.trim().toLowerCase();
  const s = catalog.services.find((x) => x.service_key === k);
  return s?.label ?? null;
}

function formatResolvedAt(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return formatDateTime(iso, { dateStyle: "short", timeStyle: "short" });
}

function rowStatusLabel(status: ServiceStaffReviewListItem["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "reassigned":
      return "Reassigned";
    case "cancelled_by_staff":
      return "Cancelled (staff)";
    case "cancelled_timeout":
      return "Cancelled (timeout)";
    default:
      return status;
  }
}

const INBOX_TABS: { id: ServiceStaffReviewListQueryStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "reassigned", label: "Reassigned" },
  { id: "cancelled", label: "Cancelled" },
];

export interface ServiceReviewsInboxProps {
  initialReviews: ServiceStaffReviewListItem[];
  settings: DoctorSettings | null;
  token: string;
}

type DialogState =
  | null
  | { mode: "reassign"; review: ServiceStaffReviewListItem }
  | { mode: "cancel"; review: ServiceStaffReviewListItem };

/**
 * ARM-07: doctor inbox for pending AI service-match reviews (confirm / reassign / cancel).
 * PHI is shown only in-session; avoid console logging patient or reason text.
 */
export function ServiceReviewsInbox({
  initialReviews,
  settings,
  token,
}: ServiceReviewsInboxProps) {
  const catalog = settings?.service_offerings_json ?? null;
  const [activeTab, setActiveTab] = useState<ServiceStaffReviewListQueryStatus>("pending");
  const [reviews, setReviews] = useState(initialReviews);
  /** Which tab the current `reviews` rows belong to (last applied successful fetch only). */
  const [dataTab, setDataTab] = useState<ServiceStaffReviewListQueryStatus>("pending");
  /** Monotonic id so out-of-order HTTP responses cannot overwrite the UI after a newer tab load starts. */
  const loadGenRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailReview, setDetailReview] = useState<ServiceStaffReviewListItem | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("urgent");
  const [density, setDensity] = useState<ReviewDensity>("comfortable");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  /** Deferred Confirm/Cancel commits keyed by review id (brr-06 pauses refresh while non-empty). */
  const pendingCommits = useRef(new Map<string, DeferredCommit>());
  const [pendingCommitCount, setPendingCommitCount] = useState(0);
  const { show: showToast, dismiss: dismissToast, error: showToastError, portal: toastPortal } =
    useActionToasts();

  const addPendingCommit = useCallback((id: string, commit: DeferredCommit) => {
    pendingCommits.current.set(id, commit);
    setPendingCommitCount((count) => count + 1);
  }, []);

  const removePendingCommit = useCallback((id: string) => {
    if (pendingCommits.current.has(id)) {
      pendingCommits.current.delete(id);
      setPendingCommitCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const pollingPaused = dialog !== null || pendingCommitCount > 0;
  const polling = useReviewsPolling({
    token,
    tab: activeTab,
    paused: pollingPaused,
  });

  const isPendingTab = activeTab === "pending";
  /** Avoid empty state + wrong columns while the list for the selected tab is still in flight. */
  const dataStale = refreshing && activeTab !== dataTab;
  const pendingCount = dataTab === "pending" ? reviews.length : 0;
  const tickNow = useTickInterval();
  const dueWithin1hCount = useMemo(
    () => (dataTab === "pending" ? countDueWithin1h(reviews, tickNow) : null),
    [reviews, dataTab, tickNow]
  );

  const resolveServiceLabel = useCallback(
    (key: string) => labelForServiceKey(catalog, key),
    [catalog]
  );

  const displayReviews = useMemo(() => {
    const filtered = filterReviews(reviews, {
      query: filterQuery,
      confidence: confidenceFilter,
      labelForKey: resolveServiceLabel,
    });
    return dataTab === "pending"
      ? sortReviews(filtered, sortMode, tickNow)
      : filtered;
  }, [
    reviews,
    dataTab,
    filterQuery,
    confidenceFilter,
    sortMode,
    tickNow,
    resolveServiceLabel,
  ]);

  const noFilterMatches = reviews.length > 0 && displayReviews.length === 0;

  const selectableVisible = useMemo(
    () => displayReviews.filter((r) => r.status === "pending"),
    [displayReviews]
  );

  const allVisibleSelected =
    selectableVisible.length > 0 &&
    selectableVisible.every((r) => selectedIds.has(r.id));

  const someVisibleSelected =
    selectableVisible.some((r) => selectedIds.has(r.id)) && !allVisibleSelected;

  const focusedReview = displayReviews[focusedIndex] ?? null;

  const toggleRowSelected = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of selectableVisible) next.delete(r.id);
      } else {
        for (const r of selectableVisible) next.add(r.id);
      }
      return next;
    });
  }, [allVisibleSelected, selectableVisible]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setFilterQuery("");
    setConfidenceFilter("all");
    setSortMode("urgent");
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(REVIEW_DENSITY_STORAGE_KEY);
      if (stored === "compact" || stored === "comfortable") {
        setDensity(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(REVIEW_DENSITY_STORAGE_KEY, density);
    } catch {
      // ignore storage errors
    }
  }, [density]);

  useEffect(() => {
    setFocusedIndex((index) => {
      if (displayReviews.length === 0) return 0;
      return Math.min(index, displayReviews.length - 1);
    });
  }, [displayReviews]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(displayReviews.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of Array.from(prev)) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [displayReviews]);

  useEffect(() => {
    const review = displayReviews[focusedIndex];
    if (!review) return;
    document
      .querySelector(`[data-review-focus-id="${review.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, displayReviews]);

  const cellPad = density === "compact" ? "px-4 py-1.5" : "px-4 py-3";
  const headPad = density === "compact" ? "px-4 py-2" : "px-4 py-3";

  const excludedCommitIds = useMemo(() => {
    void pendingCommitCount;
    return new Set(pendingCommits.current.keys());
  }, [pendingCommitCount]);

  const newPendingRows = useMemo(() => {
    if (!isPendingTab || !polling.rows || dataTab !== "pending" || pollingPaused) return [];
    return findNewPendingRows(polling.rows, reviews, excludedCommitIds);
  }, [polling.rows, reviews, isPendingTab, dataTab, pollingPaused, excludedCommitIds]);

  const mergeIncomingSnapshot = useCallback(() => {
    if (polling.rows) {
      setReviews(polling.rows);
      setDataTab(activeTab);
    }
  }, [polling.rows, activeTab]);

  useEffect(() => {
    if (pollingPaused || !polling.rows || activeTab === "pending") return;
    if (dataTab !== activeTab) return;
    setReviews(polling.rows);
  }, [polling.rows, pollingPaused, activeTab, dataTab]);

  const loadTab = useCallback(
    async (tab: ServiceStaffReviewListQueryStatus) => {
      const gen = ++loadGenRef.current;
      setRefreshing(true);
      try {
        const res = await getServiceStaffReviews(token, tab);
        if (gen !== loadGenRef.current) return;
        const rows = res.data.reviews;
        setReviews(rows);
        setDataTab(tab);
      } finally {
        if (gen === loadGenRef.current) {
          setRefreshing(false);
        }
      }
    },
    [token]
  );

  const refresh = useCallback(async () => {
    await loadTab(activeTab);
  }, [loadTab, activeTab]);

  const flushPendingCommits = useCallback(() => {
    const commits = Array.from(pendingCommits.current.values());
    for (const commit of commits) {
      commit.fire();
    }
  }, []);

  useEffect(() => {
    return () => {
      flushPendingCommits();
    };
  }, [flushPendingCommits]);

  const restoreRow = useCallback((r: ServiceStaffReviewListItem) => {
    setReviews((rows) => {
      if (rows.some((x) => x.id === r.id)) return rows;
      return [...rows, r];
    });
  }, []);

  const getErrorStatus = (e: unknown): number | undefined =>
    e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;

  const fireReal = useCallback(
    async (
      r: ServiceStaffReviewListItem,
      kind: "confirm" | "cancel",
      payload: { note?: string } | undefined,
      okMessage: string
    ) => {
      removePendingCommit(r.id);
      dismissToast(r.id);
      try {
        if (kind === "confirm") {
          await postConfirmServiceStaffReview(token, r.id, {});
        } else {
          await postCancelServiceStaffReview(token, r.id, payload ?? {});
        }
        setBanner({ kind: "ok", text: okMessage });
        await loadTab(activeTab);
      } catch (e) {
        if (getErrorStatus(e) === 409) {
          setBanner({
            kind: "err",
            text: "This request was already resolved. The list has been refreshed.",
          });
          await loadTab(activeTab);
        } else {
          restoreRow(r);
          showToastError("Couldn't save. Restored.");
        }
      }
    },
    [token, activeTab, loadTab, restoreRow, dismissToast, showToastError, removePendingCommit]
  );

  const scheduleConfirmDeferred = useCallback(
    (r: ServiceStaffReviewListItem): DeferredCommit => {
      setBanner(null);
      setReviews((rows) => rows.filter((x) => x.id !== r.id));
      const commit = scheduleCommit(
        () => void fireReal(r, "confirm", {}, CONFIRM_OK_MESSAGE),
        UNDO_MS
      );
      addPendingCommit(r.id, commit);
      return commit;
    },
    [fireReal, addPendingCommit]
  );

  const onConfirm = useCallback(
    (r: ServiceStaffReviewListItem) => {
      const commit = scheduleConfirmDeferred(r);
      setSelectedIds((prev) => {
        if (!prev.has(r.id)) return prev;
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
      showToast({
        id: r.id,
        text: "Booking link queued",
        undo: () => {
          commit.cancel();
          removePendingCommit(r.id);
          restoreRow(r);
        },
        durationMs: UNDO_MS,
      });
    },
    [scheduleConfirmDeferred, showToast, removePendingCommit, restoreRow]
  );

  const confirmBulkSelected = useCallback(() => {
    const snapshots = selectableVisible.filter((r) => selectedIds.has(r.id));
    if (snapshots.length === 0) return;

    setBanner(null);
    const idSet = new Set(snapshots.map((r) => r.id));
    setReviews((rows) => rows.filter((x) => !idSet.has(x.id)));

    const batchId = `bulk-${Date.now()}`;
    const batch = runBulkConfirm(snapshots.map((r) => r.id), (id) => {
      const r = snapshots.find((row) => row.id === id);
      if (!r) {
        return { fire: () => undefined, cancel: () => undefined };
      }
      const commit = scheduleCommit(
        () => void fireReal(r, "confirm", {}, CONFIRM_OK_MESSAGE),
        UNDO_MS
      );
      addPendingCommit(r.id, commit);
      return commit;
    });

    clearSelection();
    showToast({
      id: batchId,
      text: `${batch.count} confirmed · Undo`,
      undo: () => {
        batch.cancelAll();
        for (const r of snapshots) {
          removePendingCommit(r.id);
          restoreRow(r);
        }
      },
      durationMs: UNDO_MS,
    });
  }, [
    selectableVisible,
    selectedIds,
    fireReal,
    addPendingCommit,
    clearSelection,
    showToast,
    removePendingCommit,
    restoreRow,
  ]);

  const moveFocusedRow = useCallback(
    (delta: number) => {
      if (displayReviews.length === 0) return;
      setFocusedIndex((index) => {
        const next = index + delta;
        if (next < 0) return 0;
        if (next >= displayReviews.length) return displayReviews.length - 1;
        return next;
      });
    },
    [displayReviews.length]
  );

  const keyboardShortcutsEnabled =
    dialog === null && detailReview === null && displayReviews.length > 0;

  useReviewKeyboard({
    enabled: keyboardShortcutsEnabled,
    count: displayReviews.length,
    onMove: moveFocusedRow,
    onConfirm: () => {
      if (focusedReview?.status === "pending") onConfirm(focusedReview);
    },
    onReassign: () => {
      if (focusedReview?.status === "pending") {
        setDialog({ mode: "reassign", review: focusedReview });
      }
    },
    onCancel: () => {
      if (focusedReview?.status === "pending") {
        setDialog({ mode: "cancel", review: focusedReview });
      }
    },
    onOpenDetail: () => {
      if (focusedReview) setDetailReview(focusedReview);
    },
    onFocusFilter: () => {
      filterInputRef.current?.focus();
    },
    onToggleHelp: () => {
      setKeyboardHelpOpen((open) => !open);
    },
  });

  const runImmediateReassign = useCallback(
    async (
      r: ServiceStaffReviewListItem,
      payload: Parameters<typeof postReassignServiceStaffReview>[2]
    ) => {
      setBanner(null);
      setBusyId(r.id);
      setReviews((rows) => rows.filter((x) => x.id !== r.id));
      try {
        await postReassignServiceStaffReview(token, r.id, payload);
        setBanner({ kind: "ok", text: OK_REASSIGN_MESSAGE });
        await loadTab(activeTab);
      } catch (e) {
        if (getErrorStatus(e) === 409) {
          setBanner({
            kind: "err",
            text: "This request was already resolved. The list has been refreshed.",
          });
          await loadTab(activeTab);
        } else {
          restoreRow(r);
          showToastError("Couldn't save. Restored.");
        }
      } finally {
        setBusyId(null);
      }
    },
    [token, activeTab, loadTab, restoreRow, showToastError]
  );

  const startDeferred = useCallback(
    (
      r: ServiceStaffReviewListItem,
      kind: "confirm" | "cancel",
      payload: { note?: string } | undefined,
      okMessage: string
    ) => {
      setBanner(null);
      setReviews((rows) => rows.filter((x) => x.id !== r.id));
      const commit = scheduleCommit(
        () => void fireReal(r, kind, payload, okMessage),
        UNDO_MS
      );
      addPendingCommit(r.id, commit);
      showToast({
        id: r.id,
        text: kind === "confirm" ? "Booking link queued" : "Cancelled",
        undo: () => {
          commit.cancel();
          removePendingCommit(r.id);
          restoreRow(r);
        },
        durationMs: UNDO_MS,
      });
    },
    [fireReal, restoreRow, showToast, addPendingCommit, removePendingCommit]
  );

  const selectTab = (tab: ServiceStaffReviewListQueryStatus) => {
    flushPendingCommits();
    clearSelection();
    setActiveTab(tab);
    void loadTab(tab);
  };

  const quickResolve = useCallback(
    (r: ServiceStaffReviewListItem, resolutionKey: string) => {
      const action = resolveQuickResolveAction(
        r.proposed_catalog_service_key,
        resolutionKey,
        catalog
      );
      if (!action) return;
      if (action.kind === "confirm") {
        onConfirm(r);
        return;
      }
      void runImmediateReassign(r, {
        catalogServiceKey: action.catalogServiceKey,
        catalogServiceId: action.catalogServiceId,
      });
    },
    [catalog, runImmediateReassign, onConfirm]
  );

  return (
    <div className="space-y-4">
      {toastPortal}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Service match reviews</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirm AI-suggested visit types from Instagram bookings; once confirmed, patients get a
              booking link in the same chat.
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">Pending</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {dataTab === "pending" ? pendingCount : "—"}
              </dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">Due &lt; 1h</dt>
              <dd
                id="booking-review-due-within-1h-count"
                className="font-medium tabular-nums text-foreground"
              >
                {dueWithin1hCount ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={keyboardHelpOpen} onOpenChange={setKeyboardHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5"
                aria-label="Keyboard shortcuts"
              >
                <HelpCircle aria-hidden="true" />
                Shortcuts
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72" data-testid="review-keyboard-help">
              <p className="text-sm font-semibold text-foreground">Keyboard shortcuts</p>
              <dl className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Move focus</dt>
                  <dd className="font-mono text-foreground">j / k</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Confirm</dt>
                  <dd className="font-mono text-foreground">c</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Reassign / Cancel</dt>
                  <dd className="font-mono text-foreground">r / x</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Open detail</dt>
                  <dd className="font-mono text-foreground">Enter</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Focus search</dt>
                  <dd className="font-mono text-foreground">/</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Toggle this help</dt>
                  <dd className="font-mono text-foreground">?</dd>
                </div>
              </dl>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
            disabled={refreshing || polling.isFetching}
          >
            <RefreshCw className={refreshing || polling.isFetching ? "animate-spin" : undefined} />
            {refreshing || polling.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => selectTab(v as ServiceStaffReviewListQueryStatus)}
      >
        <TabsList aria-label="Review status">
          {INBOX_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              {t.id === "pending" && pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2 tabular-nums">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {banner && (
        <Alert variant={banner.kind === "ok" ? "default" : "destructive"} role="status">
          {banner.kind === "ok" ? <CheckCircle2 /> : <AlertTriangle />}
          <AlertDescription>{banner.text}</AlertDescription>
        </Alert>
      )}

      {newPendingRows.length > 0 && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={mergeIncomingSnapshot}>
            <RefreshCw aria-hidden="true" />
            {newPendingRows.length} new
          </Button>
        </div>
      )}

      {reviews.length > 0 && (
        <ReviewToolbar
          query={filterQuery}
          onQueryChange={setFilterQuery}
          confidence={confidenceFilter}
          onConfidenceChange={setConfidenceFilter}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          density={density}
          onDensityChange={setDensity}
          showSort={isPendingTab}
          searchInputRef={filterInputRef}
        />
      )}

      {isPendingTab && selectedIds.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2"
          data-testid="review-bulk-bar"
        >
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <Button type="button" size="sm" onClick={confirmBulkSelected}>
            Confirm selected
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {dataStale ? (
        <div
          className="overflow-hidden rounded-lg border shadow-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading reviews"
        >
          <div className="space-y-0 divide-y">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>
              {activeTab === "pending"
                ? "No pending reviews"
                : `No ${INBOX_TABS.find((x) => x.id === activeTab)?.label.toLowerCase() ?? "matching"} reviews`}
            </CardTitle>
            <CardDescription>
              {activeTab === "pending"
                ? "When the bot is unsure about a visit type, requests appear here. Tune matcher hints in your catalog to reduce low-confidence matches."
                : "Resolved requests stay here for your records. Switch tabs to see other outcomes."}
            </CardDescription>
          </CardHeader>
          {activeTab === "pending" && (
            <CardFooter className="justify-center">
              <Button asChild variant="link">
                <Link href="/dashboard/settings/practice-setup/services-catalog">
                  Open services catalog
                </Link>
              </Button>
            </CardFooter>
          )}
        </Card>
      ) : noFilterMatches ? (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>No reviews match your filters</CardTitle>
            <CardDescription>
              Try a different search term or confidence level. Your queue still has{" "}
              {reviews.length} review{reviews.length === 1 ? "" : "s"} in this tab.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <div
            className={cn(
              "space-y-3 transition-opacity duration-150 lg:hidden",
              refreshing && !dataStale && "opacity-75"
            )}
            data-testid="review-mobile-list"
            aria-busy={refreshing}
            aria-label="Service match reviews"
          >
            {displayReviews.map((r, index) => (
              <ReviewCard
                key={r.id}
                review={r}
                catalog={catalog}
                disabled={busyId === r.id}
                focused={focusedIndex === index}
                selected={selectedIds.has(r.id)}
                showSelection={isPendingTab}
                onSelectedChange={(selected) => toggleRowSelected(r.id, selected)}
                onConfirm={onConfirm}
                onReassign={(rv) => setDialog({ mode: "reassign", review: rv })}
                onCancel={(rv) => setDialog({ mode: "cancel", review: rv })}
                onOpenDetail={setDetailReview}
              />
            ))}
          </div>
          <div
            className={cn(
              "hidden overflow-x-auto rounded-lg border shadow-sm transition-opacity duration-150 lg:block",
              refreshing && !dataStale && "opacity-75"
            )}
            data-testid="review-desktop-table"
          >
          <table
            className="min-w-full divide-y divide-border text-left text-sm"
            aria-busy={refreshing}
            aria-label="Service match reviews"
          >
            <caption className="sr-only">
              {isPendingTab
                ? sortMode === "urgent"
                  ? "Pending reviews (soonest deadline first)"
                  : `Pending reviews sorted by ${sortMode}`
                : "Resolved reviews sorted by resolved time"}
            </caption>
            <thead className="bg-muted/50">
              <tr>
                {isPendingTab && (
                  <th scope="col" className={cn(headPad, "w-10 font-medium text-muted-foreground")}>
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={toggleSelectAllVisible}
                      aria-label="Select all visible reviews"
                    />
                  </th>
                )}
                {!isPendingTab && (
                  <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                    Outcome
                  </th>
                )}
                <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                  Patient
                </th>
                <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                  Reason (preview)
                </th>
                <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                  AI proposal
                </th>
                {!isPendingTab && (
                  <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                    Final visit type
                  </th>
                )}
                <th
                  scope="col"
                  className={cn("min-w-[14rem]", headPad, "font-medium text-muted-foreground")}
                >
                  Match (AI signals)
                </th>
                <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                  {isPendingTab ? "Queued" : "Resolved"}
                </th>
                {isPendingTab && (
                  <th scope="col" className={cn(headPad, "font-medium text-muted-foreground")}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {displayReviews.map((r, index) => {
                const propLabel = labelForServiceKey(catalog, r.proposed_catalog_service_key);
                const finalKey = r.final_catalog_service_key?.trim();
                const finalLabel = finalKey ? labelForServiceKey(catalog, finalKey) : null;
                const patientLabel =
                  r.patient_display_name?.trim() ||
                  (r.patient_id ? `Patient ${r.patient_id.slice(0, 8)}…` : "—");
                const disabled = busyId === r.id;
                const reasonCodes = parseMatchReasonCodes(r.match_reason_codes);
                const candidates = parseCandidateLabels(r.candidate_labels);
                const matchSummary = matchExplanationSummary(reasonCodes, r.match_confidence);
                const candidateLine = formatCandidateSummary(candidates);
                return (
                  <Fragment key={r.id}>
                  <tr
                    data-review-focus-id={r.id}
                    aria-selected={focusedIndex === index}
                    className={cn(
                      "cursor-pointer",
                      focusedIndex === index && "bg-accent/30 ring-2 ring-inset ring-ring"
                    )}
                    onClick={() => setDetailReview(r)}
                  >
                    {isPendingTab && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        {r.status === "pending" && (
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={(checked) =>
                              toggleRowSelected(r.id, checked === true)
                            }
                            aria-label={`Select review for ${patientLabel}`}
                          />
                        )}
                      </td>
                    )}
                    {!isPendingTab && (
                      <td className={cn(cellPad, "text-foreground")}>
                        <span className="text-xs font-medium text-muted-foreground">
                          {rowStatusLabel(r.status)}
                        </span>
                      </td>
                    )}
                    <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                      {r.patient_id ? (
                        <Button asChild variant="link" className="h-auto p-0 font-medium">
                          <Link href={`/dashboard/patients-v2/${r.patient_id}`}>{patientLabel}</Link>
                        </Button>
                      ) : (
                        <span className="text-foreground">{patientLabel}</span>
                      )}
                    </td>
                    <td className={cn("max-w-[14rem]", cellPad, "text-foreground")}>
                      {r.reason_for_visit_preview ?? "—"}
                    </td>
                    <td className={cn(cellPad, "text-foreground")}>
                      <span className="font-medium">{propLabel ?? r.proposed_catalog_service_key}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({r.proposed_catalog_service_key})
                      </span>
                      {isPendingTab &&
                        r.assist_hint &&
                        r.assist_hint.top_resolutions.length > 0 && (
                          <>
                            <p className="mt-2 max-w-[18rem] rounded-md border border-info/20 bg-info/10 px-2 py-1.5 text-[11px] leading-snug text-foreground">
                              <span className="font-semibold text-info">Assist: </span>
                              Similar cases were resolved as{" "}
                              {r.assist_hint.top_resolutions.slice(0, 3).map((h, i) => (
                                <Fragment key={h.final_catalog_service_key}>
                                  {i > 0 ? "; " : null}
                                  <strong>{h.label ?? h.final_catalog_service_key}</strong> (
                                  {h.count}×)
                                </Fragment>
                              ))}
                              {r.assist_hint.total_resolutions > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {r.assist_hint.total_resolutions} total
                                </span>
                              )}
                              . You still choose Confirm / Reassign / Cancel.
                            </p>
                            {(() => {
                              const quickButtons = quickResolveButtonResolutions(
                                r.assist_hint,
                                r.proposed_catalog_service_key,
                                catalog
                              );
                              if (quickButtons.length === 0) return null;
                              return (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {quickButtons.map((h) => (
                                    <Button
                                      key={h.final_catalog_service_key}
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={disabled}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        quickResolve(r, h.final_catalog_service_key);
                                      }}
                                    >
                                      Resolve as {h.label ?? h.final_catalog_service_key} ·{" "}
                                      {h.count}×
                                    </Button>
                                  ))}
                                </div>
                              );
                            })()}
                          </>
                        )}
                    </td>
                    {!isPendingTab && (
                      <td className={cn(cellPad, "text-foreground")}>
                        {finalKey ? (
                          <>
                            <span className="font-medium">{finalLabel ?? finalKey}</span>
                            <span className="ml-2 text-xs text-muted-foreground">({finalKey})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className={cn("max-w-[17rem]", cellPad, "align-top text-foreground")}>
                      <ConfidenceBadge confidence={r.match_confidence} />
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{matchSummary}</p>
                      {reasonCodes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1" role="list" aria-label="Match reason codes">
                          {reasonCodes.map((code) => {
                            const m = matchReasonChipMeta(code);
                            return (
                              <Badge
                                key={code}
                                variant="outline"
                                role="listitem"
                                title={m.detail}
                                className="max-w-full cursor-help px-1.5 py-0.5 text-[10px] font-medium"
                              >
                                {m.label}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      {candidateLine && (
                        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                          <span className="font-medium text-foreground">Alternatives: </span>
                          {candidateLine}
                        </p>
                      )}
                    </td>
                    <td className={cn(cellPad, "text-foreground")}>
                      {isPendingTab ? (
                        r.sla_deadline_at ? (
                          <SlaCountdown deadlineIso={r.sla_deadline_at} />
                        ) : (
                          <QueuedAgeLabel createdAtIso={r.created_at} />
                        )
                      ) : (
                        formatResolvedAt(r.resolved_at)
                      )}
                    </td>
                    {isPendingTab && (
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={disabled} onClick={() => onConfirm(r)}>
                            <Check />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => setDialog({ mode: "reassign", review: r })}
                          >
                            <ArrowLeftRight />
                            Reassign
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={disabled}
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDialog({ mode: "cancel", review: r })}
                          >
                            <X />
                            Cancel
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {detailReview && (
        <ReviewDetailSheet
          review={detailReview}
          catalog={catalog}
          onClose={() => setDetailReview(null)}
        />
      )}

      {dialog?.mode === "reassign" && (
        <ReassignDialog
          key={dialog.review.id}
          catalog={catalog}
          review={dialog.review}
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => {
            const review = dialog.review;
            setDialog(null);
            await runImmediateReassign(review, payload);
          }}
        />
      )}

      {dialog?.mode === "cancel" && (
        <CancelDialog
          review={dialog.review}
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            startDeferred(
              dialog.review,
              "cancel",
              { note },
              "Saved. No booking link was sent. The patient can keep chatting in Instagram if they need help."
            );
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Client-side sanitizer for the patient reason preview before it becomes suggested
 * matcher-hint content. Kept in sync with `sanitizeReasonForHintContent` on the backend
 * (which runs defensively again before persisting).
 */
function sanitizeReasonForHintSuggestion(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "");
  s = s.replace(/\d{6,}/g, "");
  s = s.toLowerCase();
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[.,;:!?\-]+$/g, "").trim();
  if (s.length > 200) s = s.slice(0, 200).trim();
  return s;
}

function ReassignDialog({
  catalog,
  review,
  onClose,
  onSubmit,
}: {
  catalog: ServiceCatalogV1 | null;
  review: ServiceStaffReviewListItem;
  onClose: () => void;
  onSubmit: (body: {
    catalogServiceKey: string;
    catalogServiceId?: string;
    consultationModality?: "text" | "voice" | "video";
    correctServiceHintAppend?: {
      keywords?: string;
      include_when?: string;
      exclude_when?: string;
    };
    wrongServiceHintAppend?: {
      keywords?: string;
      include_when?: string;
      exclude_when?: string;
    };
  }) => Promise<void>;
}) {
  const MATCHER_TX_MAX = 800;
  const services = catalog?.services ?? [];
  const want = review.proposed_catalog_service_key.trim().toLowerCase();
  const defaultKey =
    services.find((s) => s.service_key === want)?.service_key ?? services[0]?.service_key ?? "";
  const [serviceKey, setServiceKey] = useState(defaultKey);
  const [modality, setModality] = useState<"" | "text" | "voice" | "video">(
    review.proposed_consultation_modality ?? ""
  );

  // Task 03 / Plan 01: reassign is a teaching moment. Pre-fill hint suggestions from
  // the sanitized reason-for-visit preview so doctors can one-tap Accept (or Edit/Skip)
  // to improve future matching.
  const suggestionSeed = sanitizeReasonForHintSuggestion(review.reason_for_visit_preview);
  const wrongOffering = services.find((s) => s.service_key === want);
  const wrongServiceLabel = wrongOffering?.label ?? review.proposed_catalog_service_key;

  const [skipTeaching, setSkipTeaching] = useState(false);
  const [correctIncludeWhen, setCorrectIncludeWhen] = useState(suggestionSeed);
  const [wrongExcludeWhen, setWrongExcludeWhen] = useState(suggestionSeed);
  const [saving, setSaving] = useState(false);

  const selectedOffering = services.find((s) => s.service_key === serviceKey.trim().toLowerCase());
  const selectedIsSameAsProposed =
    Boolean(selectedOffering) && selectedOffering!.service_key.trim().toLowerCase() === want;

  // Reset edits when the doctor switches which service they are reassigning to, so
  // suggestion text stays relevant to the *current* pick.
  useEffect(() => {
    setCorrectIncludeWhen(suggestionSeed);
    setWrongExcludeWhen(suggestionSeed);
  }, [serviceKey, suggestionSeed]);

  const submit = async () => {
    const key = serviceKey.trim().toLowerCase();
    if (!selectedOffering) return;
    setSaving(true);
    try {
      // Build append patches. Omit entirely when Skip is on, when the doctor cleared
      // the text, or (for the wrong-service patch) when the chosen service equals the
      // originally-proposed one (nothing was actually mis-routed to teach against).
      let correctServiceHintAppend:
        | { keywords?: string; include_when?: string; exclude_when?: string }
        | undefined;
      let wrongServiceHintAppend:
        | { keywords?: string; include_when?: string; exclude_when?: string }
        | undefined;

      if (!skipTeaching) {
        const inc = correctIncludeWhen.trim();
        if (inc) correctServiceHintAppend = { include_when: inc };

        if (!selectedIsSameAsProposed) {
          const exc = wrongExcludeWhen.trim();
          if (exc) wrongServiceHintAppend = { exclude_when: exc };
        }
      }

      await onSubmit({
        catalogServiceKey: key,
        catalogServiceId: selectedOffering.service_id,
        consultationModality: modality || undefined,
        correctServiceHintAppend,
        wrongServiceHintAppend,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassign service</DialogTitle>
          <DialogDescription>
            Choose a visit type from your catalog. The patient will be able to book with the new
            selection.
          </DialogDescription>
        </DialogHeader>
        {services.length === 0 ? (
          <p className="text-sm text-destructive">
            No catalog loaded. Add services in Practice setup first.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reassign-service">Catalog service</Label>
              <Select value={serviceKey} onValueChange={setServiceKey}>
                <SelectTrigger id="reassign-service">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.service_id} value={s.service_key}>
                      {s.label} ({s.service_key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-modality">Consultation modality (optional)</Label>
              <Select
                value={modality || MODALITY_NONE}
                onValueChange={(v) =>
                  setModality(v === MODALITY_NONE ? "" : (v as typeof modality))
                }
              >
                <SelectTrigger id="reassign-modality">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MODALITY_NONE}>—</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {suggestionSeed ? (
              <div className="rounded-md border bg-muted/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Suggested learning</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Save what you picked so the AI routes this kind of complaint correctly next
                      time. Edit the text or skip if the suggestions don&apos;t fit.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Checkbox
                      id="reassign-skip-teaching"
                      checked={skipTeaching}
                      onCheckedChange={(checked) => setSkipTeaching(checked === true)}
                    />
                    <Label htmlFor="reassign-skip-teaching" className="text-xs font-normal">
                      Skip teaching
                    </Label>
                  </div>
                </div>
                <p className="mt-2 text-xs text-warning">
                  Plain language only. Do not include patient names, identifiers, or other PHI.
                </p>
                <div
                  className={cn(
                    "mt-3 space-y-3",
                    skipTeaching && "pointer-events-none opacity-50"
                  )}
                >
                  <div>
                    <Label htmlFor="reassign-teach-correct" className="text-xs">
                      Book {selectedOffering?.label ?? serviceKey} when… (
                      {correctIncludeWhen.length}/{MATCHER_TX_MAX})
                    </Label>
                    <textarea
                      id="reassign-teach-correct"
                      rows={2}
                      maxLength={MATCHER_TX_MAX}
                      className={cn(TEXTAREA_CLASS, "mt-1 bg-background")}
                      value={correctIncludeWhen}
                      onChange={(e) => setCorrectIncludeWhen(e.target.value)}
                      placeholder="Appended to this service's Include-when hint."
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Appended to{" "}
                      <span className="font-medium">{selectedOffering?.label ?? serviceKey}</span> —
                      Include-when.
                    </p>
                  </div>
                  {!selectedIsSameAsProposed && (
                    <div>
                      <Label htmlFor="reassign-teach-wrong" className="text-xs">
                        Not {wrongServiceLabel} when… ({wrongExcludeWhen.length}/{MATCHER_TX_MAX})
                      </Label>
                      <textarea
                        id="reassign-teach-wrong"
                        rows={2}
                        maxLength={MATCHER_TX_MAX}
                        className={cn(TEXTAREA_CLASS, "mt-1 bg-background")}
                        value={wrongExcludeWhen}
                        onChange={(e) => setWrongExcludeWhen(e.target.value)}
                        placeholder="Appended to the originally-proposed service's Exclude-when hint."
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Appended to <span className="font-medium">{wrongServiceLabel}</span> —
                        Exclude-when.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                No reason text available to suggest a learning update — just reassigning the
                service will still train the learning log.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={saving || services.length === 0 || !selectedOffering}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save reassignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  review: _review,
  onClose,
  onSubmit,
}: {
  review: ServiceStaffReviewListItem;
  onClose: () => void;
  onSubmit: (note?: string) => Promise<void>;
}) {
  void _review;
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(note.trim() || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel review</DialogTitle>
          <DialogDescription>
            The patient will not get a finalized visit type from this proposal. They can continue the
            conversation in Instagram.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-note">Internal note (optional)</Label>
          <textarea
            id="cancel-note"
            rows={2}
            className={TEXTAREA_CLASS}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For your team only"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button type="button" variant="destructive" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Cancel request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
