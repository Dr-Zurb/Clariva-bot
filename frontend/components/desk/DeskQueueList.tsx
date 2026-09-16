"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { DeskCancelDialog } from "@/components/desk/DeskCancelDialog";
import { DeskHisabCard } from "@/components/desk/DeskHisabCard";
import { DeskLabUploadDialog } from "@/components/desk/DeskLabUploadDialog";
import { DeskLeftDialog } from "@/components/desk/DeskLeftDialog";
import { DeskMoveDialog } from "@/components/desk/DeskMoveDialog";
import { DeskPrepPanel } from "@/components/desk/DeskPrepPanel";
import { DeskQueueSearch } from "@/components/desk/DeskQueueSearch";
import { OpdSessionDatePicker } from "@/components/opd/shared/OpdSessionDatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeskTodayQuery } from "@/hooks/queries/useDeskTodayQuery";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";
import { deskErrorMessage } from "@/lib/desk/api";
import {
  deskPrepActionLabel,
  deskShowsLabsPending,
  hasAnyDeskPrepCapability,
  hasDeskCapability,
} from "@/lib/desk/capabilities";
import {
  deskVisitYmd,
  formatDeskAmountMinor,
  formatDeskDate,
  formatDeskTime,
} from "@/lib/desk/format";
import {
  formatDeskLabLoopBadge,
  formatDeskLabOrderLabels,
} from "@/lib/desk/lab-fulfillment";
import {
  DESK_PREP_LABELS,
  DESK_PREP_LETTERS,
  DESK_PREP_SLOTS,
  deskPrepAriaLabel,
  type DeskPrepFill,
  type DeskPrepState,
  type DeskTodayRow,
} from "@/lib/desk/prep";
import {
  deskLastPaidMethod,
  deskPaidMethodLabels,
  deskPaymentLabel,
  visitPaymentById,
  type DeskPaymentMethod,
  type DeskPaymentStatus,
} from "@/lib/desk/payment";
import { formatDeskGuardian } from "@/lib/desk/guardian";
import { formatDeskPhone } from "@/lib/desk/phone";
import {
  DESK_LABS_GRID,
  DESK_LABS_HEADER,
  DESK_QUEUE_GRID,
  DESK_QUEUE_HEADER,
  canDeskCancelVisit,
  canDeskLeaveVisit,
  canDeskMoveVisit,
  canDeskOpenLabUpload,
  canDeskOpenVisitPrep,
  deskLabWaitingBarClass,
  deskLabWaitingTone,
  deskOpdNumber,
  deskOriginLabel,
  deskQueueBarClass,
  deskQueueBucket,
  deskStatusLabel,
  formatDeskAgeSex,
  formatDeskDaysPending,
  formatDeskOpdNumber,
  matchesDeskQueueSearch,
  type DeskQueueFilter,
  type DeskQueueMode,
} from "@/lib/desk/queue";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

const CHIPS: Array<{ id: DeskQueueFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "arrived", label: "Arrived" },
  { id: "seen", label: "Seen" },
];

export function DeskQueueModeChips({
  filter,
  labsPendingMode,
  showLabsPending,
  showQueueChips = true,
  counts,
  labsPendingCount,
  onSelect,
}: {
  filter: DeskQueueFilter;
  labsPendingMode: boolean;
  showLabsPending: boolean;
  showQueueChips?: boolean;
  counts: Record<DeskQueueFilter, number>;
  labsPendingCount: number;
  onSelect: (mode: DeskQueueMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter the list"
      className="flex items-center gap-1.5 overflow-x-auto py-1"
    >
      {showQueueChips
        ? CHIPS.map((chip) => {
        const isActive = !labsPendingMode && filter === chip.id;
        const count = counts[chip.id];
        const muted = count === 0 && chip.id !== "all";
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(chip.id)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition-colors lg:h-auto lg:px-3 lg:py-1 lg:text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary text-primary-foreground shadow"
                : muted
                  ? "border border-input bg-card text-muted-foreground/50"
                  : "border border-input bg-card text-foreground hover:bg-accent"
            )}
          >
            <span>{chip.label}</span>
            <span className="tabular-nums opacity-80">{count}</span>
          </button>
        );
      })
        : null}
      {showLabsPending ? (
        <button
          type="button"
          role="tab"
          aria-selected={labsPendingMode}
          data-testid="desk-labs-pending-chip"
          onClick={() => onSelect("labs_pending")}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition-colors lg:h-auto lg:px-3 lg:py-1 lg:text-xs",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            labsPendingMode
              ? "bg-primary text-primary-foreground shadow"
              : labsPendingCount === 0
                ? "border border-input bg-card text-muted-foreground/50"
                : "border border-input bg-card text-foreground hover:bg-accent"
          )}
        >
          <span>Labs pending</span>
          <span className="tabular-nums opacity-80">{labsPendingCount}</span>
        </button>
      ) : null}
    </div>
  );
}

export function LabsOnlyVisitList({
  visible,
  timezone,
  prepLabel,
  token,
}: {
  visible: DeskTodayRow[];
  timezone: string;
  prepLabel: string;
  token: string;
}) {
  const [uploadRow, setUploadRow] = useState<DeskTodayRow | null>(null);

  function openUpload(row: DeskTodayRow) {
    if (!canDeskOpenLabUpload(row)) return;
    setUploadRow(row);
  }

  return (
    <>
      <div
        className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block"
        role="table"
        aria-label="Pending labs"
      >
        <div
          className="sticky top-0 z-10 grid border-b border-border/50 bg-muted/60 backdrop-blur"
          style={{ gridTemplateColumns: DESK_LABS_GRID }}
          role="row"
        >
          {DESK_LABS_HEADER.map((col) => (
            <div
              key={col.key}
              role="columnheader"
              className="min-w-0 truncate px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {col.srOnly ? (
                <span className="sr-only">{col.label}</span>
              ) : (
                col.label
              )}
            </div>
          ))}
        </div>
        {visible.map((row) => {
          const labels = formatDeskLabOrderLabels(row.labOrders ?? []);
          const phone = row.patient_phone
            ? formatDeskPhone(row.patient_phone)
            : "—";
          const waiting = row.daysPending ?? 0;
          const uploaded = Boolean(row.reportUploaded);
          const reportBadge = formatDeskLabLoopBadge(
            row.labOrders ?? [],
            waiting,
            formatDeskDaysPending
          );
          const canUpload = canDeskOpenLabUpload(row);
          return (
            <div key={row.id}>
              <div
                role="row"
                className={cn(
                  "grid items-stretch border-b border-border/30 text-sm leading-snug last:border-b-0 hover:bg-muted/40",
                  canUpload && "cursor-pointer"
                )}
                style={{ gridTemplateColumns: DESK_LABS_GRID }}
                onClick={() => openUpload(row)}
              >
                <div
                  className={cn(
                    "self-stretch",
                    uploaded ? "bg-green-500" : deskLabWaitingBarClass(waiting)
                  )}
                  aria-hidden
                />
                <div
                  role="cell"
                  className="flex items-center px-2 py-2 text-[13px] font-semibold tabular-nums tracking-tight"
                >
                  {formatDeskDate(row.appointment_date, timezone)}
                </div>
                <div
                  role="cell"
                  className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                >
                  {row.patient_mrn ?? "—"}
                </div>
                <div
                  role="cell"
                  className="flex min-w-0 items-center px-2 py-2 font-medium"
                >
                  <span className="truncate">{row.patient_name}</span>
                </div>
                <div
                  role="cell"
                  className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                >
                  {formatDeskAgeSex(row.patient_age, row.patient_sex)}
                </div>
                <div
                  role="cell"
                  className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                >
                  {phone}
                </div>
                <div
                  role="cell"
                  className="flex min-w-0 items-center px-2 py-2 text-xs text-muted-foreground"
                >
                  <span className="whitespace-normal break-words">
                    {labels || "—"}
                  </span>
                </div>
                <div
                  role="cell"
                  className="flex items-center px-2 py-2"
                >
                  <Badge
                    variant={uploaded ? "success" : deskLabWaitingTone(waiting)}
                    className="max-w-full truncate tabular-nums"
                  >
                    {reportBadge}
                  </Badge>
                </div>
                <div
                  role="cell"
                  className="flex items-center justify-end px-1 py-2"
                >
                  {canUpload ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        openUpload(row);
                      }}
                    >
                      {prepLabel}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ul
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:hidden"
        aria-label="Pending labs"
      >
        {visible.map((row) => {
          const labels = formatDeskLabOrderLabels(row.labOrders ?? []);
          const phone = row.patient_phone
            ? formatDeskPhone(row.patient_phone)
            : "";
          const waiting = row.daysPending ?? 0;
          const uploaded = Boolean(row.reportUploaded);
          const reportBadge = formatDeskLabLoopBadge(
            row.labOrders ?? [],
            waiting,
            formatDeskDaysPending
          );
          const canUpload = canDeskOpenLabUpload(row);
          return (
            <li key={row.id}>
              <div
                className={cn("flex items-stretch", canUpload && "cursor-pointer")}
                onClick={() => openUpload(row)}
              >
                <span
                  className={cn(
                    "w-1 shrink-0",
                    uploaded ? "bg-green-500" : deskLabWaitingBarClass(waiting)
                  )}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.patient_name}
                    </p>
                    <LabsPendingMeta
                      labels={labels}
                      daysPending={row.daysPending}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDeskDate(row.appointment_date, timezone)}
                      </span>
                      {row.patient_mrn ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {row.patient_mrn}
                        </span>
                      ) : null}
                      {phone ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {phone}
                        </span>
                      ) : null}
                      <Badge
                        variant={uploaded ? "success" : deskLabWaitingTone(waiting)}
                        className="tabular-nums"
                      >
                        {reportBadge}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canUpload ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          openUpload(row);
                        }}
                      >
                        {prepLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <DeskLabUploadDialog
        open={uploadRow !== null}
        onOpenChange={(next) => {
          if (!next) setUploadRow(null);
        }}
        token={token}
        appointmentId={uploadRow?.id ?? ""}
        patientName={uploadRow?.patient_name ?? ""}
        visitDate={
          uploadRow
            ? formatDeskDate(uploadRow.appointment_date, timezone)
            : ""
        }
        mrn={uploadRow?.patient_mrn}
      />
    </>
  );
}

function LabsPendingMeta({
  labels,
  daysPending,
}: {
  labels: string;
  daysPending?: number;
}) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <span>{labels || "No tests on this visit yet."}</span>
      {daysPending != null ? (
        <span className="tabular-nums">{formatDeskDaysPending(daysPending)}</span>
      ) : null}
    </p>
  );
}

function paymentBadgeVariant(
  status: DeskPaymentStatus | undefined
): "success" | "secondary" | "outline" {
  if (status === "paid") return "success";
  if (status === "no_charge") return "secondary";
  if (status === "returned") return "outline";
  return "outline";
}

function statusDotClass(
  bucket: Exclude<DeskQueueFilter, "all">,
  noShow: boolean
): string {
  if (noShow) return "bg-destructive";
  if (bucket === "seen") return "bg-green-500";
  if (bucket === "arrived") return "bg-primary";
  return "bg-muted-foreground/50";
}

function StatusCell({
  bucket,
  noShow,
  label,
}: {
  bucket: Exclude<DeskQueueFilter, "all">;
  noShow: boolean;
  label: string;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full",
          statusDotClass(bucket, noShow)
        )}
      />
      <span className="truncate text-xs">{label}</span>
    </>
  );
}

export function DeskQueueList({
  token: initialToken,
  density = "full",
}: {
  token: string;
  density?: "compact" | "full";
}) {
  const { token } = useSessionAccessToken(initialToken);
  const queryClient = useQueryClient();
  const browse = density === "full";
  const [filter, setFilter] = useState<DeskQueueFilter>("all");
  const [labsPendingMode, setLabsPendingMode] = useState(false);
  const [query, setQuery] = useState("");
  const [browseDate, setBrowseDate] = useState("");
  const [labDay, setLabDay] = useState("");
  const [prepAppointmentId, setPrepAppointmentId] = useState<string | null>(
    null
  );
  const {
    doctorId,
    today,
    timezone,
    rows,
    counts,
    labsPendingCount,
    error,
    loading,
    refreshing,
    hisab,
    canBill,
    capabilities,
    labsOnly,
    refetch,
    cancelMutation,
    leaveMutation,
  } = useDeskTodayQuery(token, browse ? browseDate || undefined : undefined, {
    labsPendingMode,
  });
  const canRegister = hasDeskCapability(capabilities, "front_desk");
  const canPrep = hasAnyDeskPrepCapability(capabilities);
  const showLabsPending = deskShowsLabsPending(capabilities) && !labsOnly;
  const prepLabel = labsOnly
    ? "Upload reports"
    : deskPrepActionLabel(capabilities);
  const labPickerValue = labDay || today || "";

  function selectMode(mode: DeskQueueMode) {
    if (mode === "labs_pending") {
      setLabsPendingMode(true);
      return;
    }
    setLabsPendingMode(false);
    setFilter(mode);
  }

  function togglePrep(id: string) {
    setPrepAppointmentId((current) => (current === id ? null : id));
  }

  useEffect(() => {
    if (browse && today && !browseDate && !labsOnly) setBrowseDate(today);
  }, [browse, today, browseDate, labsOnly]);

  useEffect(() => {
    if (labsOnly && today && !labDay) setLabDay(today);
  }, [labsOnly, today, labDay]);

  useEffect(() => {
    if (labsOnly) setLabsPendingMode(true);
    else if (!showLabsPending && labsPendingMode) setLabsPendingMode(false);
  }, [labsOnly, showLabsPending, labsPendingMode]);

  const visible = rows.filter((row) => {
    if (!labsOnly && !labsPendingMode && filter !== "all" && deskQueueBucket(row) !== filter)
      return false;
    if (labsOnly) {
      if (!labDay || deskVisitYmd(row.appointment_date, timezone) !== labDay)
        return false;
    }
    if (browse && !matchesDeskQueueSearch(row, query)) return false;
    return true;
  });

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        {labsOnly ? "Loading labs…" : "Loading today…"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {labsOnly && labPickerValue ? (
            <OpdSessionDatePicker
              value={labPickerValue}
              onChange={setLabDay}
            />
          ) : null}
          {browse && browseDate && !labsPendingMode && !labsOnly ? (
            <OpdSessionDatePicker value={browseDate} onChange={setBrowseDate} />
          ) : null}
          {browse ? (
            <DeskQueueSearch value={query} onChange={setQuery} />
          ) : null}
          {!labsOnly ? (
            <DeskQueueModeChips
              filter={filter}
              labsPendingMode={labsPendingMode && showLabsPending}
              showLabsPending={showLabsPending}
              counts={counts}
              labsPendingCount={labsPendingCount}
              onSelect={selectMode}
            />
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={refreshing}
          onClick={refetch}
        >
          <RefreshCcw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {browse && canBill && !labsPendingMode ? (
        <DeskHisabCard hisab={hisab} />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center shadow-sm"
        >
          <p className="text-base font-medium text-foreground">
            {labsOnly
              ? query.trim()
                ? "No one matches this search"
                : "No lab orders on this day"
              : labsPendingMode
              ? rows.length === 0
                ? "No labs pending"
                : "No one matches this search"
              : rows.length === 0
                ? "No one on this day's list"
                : query.trim()
                  ? "No one matches this search"
                  : "No one in this filter"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {labsOnly
              ? query.trim()
                ? "Try a name or phone."
                : "Pick another visit day. Uploaded reports stay on the list."
              : labsPendingMode
              ? rows.length === 0
                ? "Attested orders without a clinic result drop off this list."
                : "Try a name or phone."
              : rows.length === 0
                ? canRegister
                  ? "Register a walk-in from Check-in, or pick another date."
                  : "No visits on this date yet."
                : query.trim()
                  ? "Try a name, phone, or token."
                  : canRegister
                    ? "Try All, or check someone in from Check-in."
                    : "Try All."}
          </p>
        </div>
      ) : labsOnly ? (
        <LabsOnlyVisitList
          visible={visible}
          timezone={timezone}
          prepLabel={prepLabel}
          token={token}
        />
      ) : (
        <>
          <div
            className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block"
            role="table"
            aria-label="Today's patients"
          >
            <div
              className="sticky top-0 z-10 grid border-b border-border/50 bg-muted/60 backdrop-blur"
              style={{ gridTemplateColumns: DESK_QUEUE_GRID }}
              role="row"
            >
              {DESK_QUEUE_HEADER.map((col) => (
                <div
                  key={col.key}
                  role="columnheader"
                  className="min-w-0 truncate px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {col.srOnly ? (
                    <span className="sr-only">{col.label}</span>
                  ) : (
                    col.label
                  )}
                </div>
              ))}
            </div>
            {visible.map((row) => {
              const bucket = deskQueueBucket(row);
              const noShow = row.status === "no_show";
              const phone = row.patient_phone
                ? formatDeskPhone(row.patient_phone)
                : "—";
              const relative = formatDeskGuardian(
                row.patient_guardian_name,
                row.patient_guardian_relation,
                row.patient_sex
              );
              const prepOpen = prepAppointmentId === row.id;
              const pendingLabels = formatDeskLabOrderLabels(row.labOrders ?? []);
              return (
                <div key={row.id}>
                <div
                  role="row"
                  className="grid items-stretch border-b border-border/30 text-sm leading-snug last:border-b-0 hover:bg-muted/40"
                  style={{ gridTemplateColumns: DESK_QUEUE_GRID }}
                >
                  <div
                    className={cn("self-stretch", deskQueueBarClass(bucket))}
                    aria-hidden
                  />
                  <div
                    role="cell"
                    className="flex items-center justify-end px-2 py-2 tabular-nums text-xs text-muted-foreground"
                  >
                    {formatDeskOpdNumber(deskOpdNumber(row, rows))}
                  </div>
                  <div
                    role="cell"
                    className="flex items-center px-2 py-2 text-[13px] font-semibold tabular-nums tracking-tight"
                  >
                    {labsPendingMode
                      ? formatDeskDate(row.appointment_date, timezone)
                      : formatDeskTime(row.appointment_date, timezone)}
                  </div>
                  <div
                    role="cell"
                    className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                  >
                    {row.patient_mrn ?? "—"}
                  </div>
                  <div
                    role="cell"
                    className="flex min-w-0 items-center px-2 py-2 font-medium"
                  >
                    <div className="min-w-0">
                      <span className="truncate">{row.patient_name}</span>
                      {labsPendingMode ? (
                        <LabsPendingMeta
                          labels={pendingLabels}
                          daysPending={row.daysPending}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div
                    role="cell"
                    className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                  >
                    {formatDeskAgeSex(row.patient_age, row.patient_sex)}
                  </div>
                  <div
                    role="cell"
                    className="flex min-w-0 items-center px-2 py-2 text-xs text-muted-foreground"
                  >
                    <span className="truncate">{relative || "—"}</span>
                  </div>
                  <div
                    role="cell"
                    className="flex items-center px-2 py-2 tabular-nums text-xs text-muted-foreground"
                  >
                    {phone}
                  </div>
                  <div
                    role="cell"
                    className="flex items-center px-2 py-2 text-xs text-muted-foreground"
                  >
                    {deskOriginLabel(row.booking_origin)}
                  </div>
                  <div
                    role="cell"
                    className="flex items-center gap-1.5 px-2 py-2"
                  >
                    <StatusCell
                      bucket={bucket}
                      noShow={noShow}
                      label={deskStatusLabel(row)}
                    />
                  </div>
                  <div role="cell" className="flex items-center px-2 py-2">
                    <DeskPrepDots prep={row.deskPrep} />
                  </div>
                  <div
                    role="cell"
                    className="flex min-w-0 items-center gap-1 px-2 py-2"
                  >
                    {canBill && !labsPendingMode ? (
                      <HisabCell
                        status={visitPaymentById(hisab?.visits, row.id)?.status}
                        collectedMinor={
                          visitPaymentById(hisab?.visits, row.id)?.collectedMinor
                        }
                        currency={hisab?.currency ?? "INR"}
                        methods={visitPaymentById(hisab?.visits, row.id)?.methods}
                      />
                    ) : null}
                  </div>
                  <div
                    role="cell"
                    className="flex items-center justify-end px-1 py-2"
                  >
                    {canPrep && canDeskOpenVisitPrep(row) ? (
                      <Button
                        type="button"
                        variant={prepOpen ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 px-2"
                        aria-expanded={prepOpen}
                        onClick={() => togglePrep(row.id)}
                      >
                        {prepLabel}
                      </Button>
                    ) : null}
                    {canRegister &&
                    !labsPendingMode &&
                    canDeskMoveVisit(row) &&
                    doctorId &&
                    today ? (
                      <DeskMoveDialog
                        token={token}
                        doctorId={doctorId}
                        timezone={timezone}
                        today={today}
                        appointmentId={row.id}
                        onMoved={() => {
                          void queryClient.invalidateQueries({
                            queryKey: queryKeys.desk.all,
                          });
                        }}
                      />
                    ) : null}
                    {canRegister && !labsPendingMode && canDeskCancelVisit(row) ? (
                      <DeskCancelDialog
                        busy={
                          cancelMutation.isPending &&
                          cancelMutation.variables === row.id
                        }
                        error={
                          cancelMutation.variables === row.id &&
                          cancelMutation.error
                            ? deskErrorMessage(
                                cancelMutation.error,
                                "Could not cancel"
                              )
                            : null
                        }
                        onConfirm={() => cancelMutation.mutateAsync(row.id)}
                      />
                    ) : null}
                    {canRegister && !labsPendingMode && canDeskLeaveVisit(row) ? (
                      <DeskLeftDialog
                        paid={
                          visitPaymentById(hisab?.visits, row.id)?.status ===
                          "paid"
                        }
                        collectedMinor={
                          visitPaymentById(hisab?.visits, row.id)
                            ?.collectedMinor ?? 0
                        }
                        currency={hisab?.currency ?? "INR"}
                        defaultReturnMethod={deskLastPaidMethod(
                          visitPaymentById(hisab?.visits, row.id)?.methods
                        )}
                        busy={
                          leaveMutation.isPending &&
                          leaveMutation.variables?.id === row.id
                        }
                        error={
                          leaveMutation.variables?.id === row.id &&
                          leaveMutation.error
                            ? deskErrorMessage(
                                leaveMutation.error,
                                "Could not mark left"
                              )
                            : null
                        }
                        onConfirm={(returnMethod) =>
                          leaveMutation.mutateAsync({
                            id: row.id,
                            returnMethod,
                          })
                        }
                      />
                    ) : null}
                  </div>
                </div>
                {prepOpen ? (
                  <div
                    className="border-b border-border/30 bg-muted/20 px-4 py-3"
                    data-testid="desk-today-prep"
                  >
                    <DeskPrepPanel
                      token={token}
                      appointmentId={row.id}
                      capabilities={capabilities}
                    />
                  </div>
                ) : null}
                </div>
              );
            })}
          </div>

          <ul
            className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:hidden"
            aria-label="Today's patients"
          >
            {visible.map((row) => {
              const bucket = deskQueueBucket(row);
              const phone = row.patient_phone
                ? formatDeskPhone(row.patient_phone)
                : "";
              const tokenNo = deskOpdNumber(row, rows);
              const relative = formatDeskGuardian(
                row.patient_guardian_name,
                row.patient_guardian_relation,
                row.patient_sex
              );
              const prepOpen = prepAppointmentId === row.id;
              const pendingLabels = formatDeskLabOrderLabels(row.labOrders ?? []);
              return (
                <li key={row.id}>
                  <div className="flex items-stretch">
                  <span
                    className={cn("w-1 shrink-0", deskQueueBarClass(bucket))}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3",
                      density === "full" ? "px-4 py-3.5" : "px-3 py-3"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {row.patient_name}
                      </p>
                      {relative ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {relative}
                        </p>
                      ) : null}
                      {labsPendingMode ? (
                        <LabsPendingMeta
                          labels={pendingLabels}
                          daysPending={row.daysPending}
                        />
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {labsPendingMode
                            ? formatDeskDate(row.appointment_date, timezone)
                            : formatDeskTime(row.appointment_date, timezone)}
                        </span>
                        {phone ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {phone}
                          </span>
                        ) : null}
                        {row.patient_mrn ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {row.patient_mrn}
                          </span>
                        ) : null}
                        {tokenNo != null ? (
                          <Badge variant="info">Token {tokenNo}</Badge>
                        ) : null}
                        {row.booking_origin === "walk_in" ? (
                          <Badge variant="secondary">Walk-in</Badge>
                        ) : null}
                        {row.status === "no_show" ? (
                          <Badge variant="destructive">No-show</Badge>
                        ) : null}
                        {canBill && !labsPendingMode ? (
                          <HisabCell
                            status={
                              visitPaymentById(hisab?.visits, row.id)?.status
                            }
                            collectedMinor={
                              visitPaymentById(hisab?.visits, row.id)
                                ?.collectedMinor
                            }
                            currency={hisab?.currency ?? "INR"}
                            methods={
                              visitPaymentById(hisab?.visits, row.id)?.methods
                            }
                          />
                        ) : null}
                        <DeskPrepDots prep={row.deskPrep} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusCell
                        bucket={bucket}
                        noShow={row.status === "no_show"}
                        label={deskStatusLabel(row)}
                      />
                      {canPrep && canDeskOpenVisitPrep(row) ? (
                        <Button
                          type="button"
                          variant={prepOpen ? "secondary" : "ghost"}
                          size="sm"
                          className="h-8 px-2"
                          aria-expanded={prepOpen}
                          onClick={() => togglePrep(row.id)}
                        >
                          {prepLabel}
                        </Button>
                      ) : null}
                      {canRegister &&
                    !labsPendingMode &&
                    canDeskMoveVisit(row) &&
                    doctorId &&
                    today ? (
                        <DeskMoveDialog
                          token={token}
                          doctorId={doctorId}
                          timezone={timezone}
                          today={today}
                          appointmentId={row.id}
                          onMoved={() => {
                            void queryClient.invalidateQueries({
                              queryKey: queryKeys.desk.all,
                            });
                          }}
                        />
                      ) : null}
                      {canRegister && !labsPendingMode && canDeskCancelVisit(row) ? (
                        <DeskCancelDialog
                          busy={
                            cancelMutation.isPending &&
                            cancelMutation.variables === row.id
                          }
                          error={
                            cancelMutation.variables === row.id &&
                            cancelMutation.error
                              ? deskErrorMessage(
                                  cancelMutation.error,
                                  "Could not cancel"
                                )
                              : null
                          }
                          onConfirm={() => cancelMutation.mutateAsync(row.id)}
                        />
                      ) : null}
                      {canRegister && !labsPendingMode && canDeskLeaveVisit(row) ? (
                        <DeskLeftDialog
                          paid={
                            visitPaymentById(hisab?.visits, row.id)?.status ===
                            "paid"
                          }
                          collectedMinor={
                            visitPaymentById(hisab?.visits, row.id)
                              ?.collectedMinor ?? 0
                          }
                          currency={hisab?.currency ?? "INR"}
                          defaultReturnMethod={deskLastPaidMethod(
                            visitPaymentById(hisab?.visits, row.id)?.methods
                          )}
                          busy={
                            leaveMutation.isPending &&
                            leaveMutation.variables?.id === row.id
                          }
                          error={
                            leaveMutation.variables?.id === row.id &&
                            leaveMutation.error
                              ? deskErrorMessage(
                                  leaveMutation.error,
                                  "Could not mark left"
                                )
                              : null
                          }
                          onConfirm={(returnMethod) =>
                            leaveMutation.mutateAsync({
                              id: row.id,
                              returnMethod,
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                  </div>
                  {prepOpen ? (
                    <div
                      className="border-t border-border/60 bg-muted/20 px-4 py-3"
                      data-testid="desk-today-prep"
                    >
                      <DeskPrepPanel
                        token={token}
                        appointmentId={row.id}
                        capabilities={capabilities}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function prepDotClass(fill: DeskPrepFill): string {
  if (fill === "filled") return "bg-primary text-primary-foreground";
  if (fill === "empty") {
    return "border border-border bg-background text-muted-foreground";
  }
  return "border border-dashed border-muted-foreground/35 bg-transparent text-muted-foreground/55";
}

function DeskPrepDots({ prep }: { prep: DeskPrepState }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="inline-flex items-center gap-0.5"
        role="group"
        aria-label={deskPrepAriaLabel(prep)}
      >
        {DESK_PREP_SLOTS.map((slot) => (
          <Tooltip key={slot}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex h-4 w-4 shrink-0 cursor-default items-center justify-center rounded-full text-[9px] font-semibold leading-none",
                  prepDotClass(prep[slot])
                )}
              >
                {DESK_PREP_LETTERS[slot]}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{DESK_PREP_LABELS[slot]}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

function HisabCell({
  status,
  collectedMinor,
  currency,
  methods,
}: {
  status: DeskPaymentStatus | undefined;
  collectedMinor: number | undefined;
  currency: string;
  methods: DeskPaymentMethod[] | undefined;
}) {
  const method = deskPaidMethodLabels(methods);
  let label = deskPaymentLabel(status);
  if (status === "paid" && collectedMinor) {
    const amount = formatDeskAmountMinor(collectedMinor, currency);
    label = method ? `${amount} · ${method}` : amount;
  }
  return (
    <Badge
      variant={paymentBadgeVariant(status)}
      className="max-w-full truncate"
    >
      {label}
    </Badge>
  );
}
