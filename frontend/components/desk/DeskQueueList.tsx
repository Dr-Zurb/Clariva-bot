"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { DeskCancelDialog } from "@/components/desk/DeskCancelDialog";
import { DeskHisabCard } from "@/components/desk/DeskHisabCard";
import { DeskLeftDialog } from "@/components/desk/DeskLeftDialog";
import { DeskMoveDialog } from "@/components/desk/DeskMoveDialog";
import { DeskQueueSearch } from "@/components/desk/DeskQueueSearch";
import { OpdSessionDatePicker } from "@/components/opd/shared/OpdSessionDatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeskTodayQuery } from "@/hooks/queries/useDeskTodayQuery";
import { deskErrorMessage } from "@/lib/desk/api";
import { formatDeskAmountMinor, formatDeskTime } from "@/lib/desk/format";
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
  DESK_QUEUE_GRID,
  DESK_QUEUE_HEADER,
  canDeskCancelVisit,
  canDeskLeaveVisit,
  canDeskMoveVisit,
  deskOpdNumber,
  deskOriginLabel,
  deskQueueBarClass,
  deskQueueBucket,
  deskStatusLabel,
  formatDeskAgeSex,
  formatDeskOpdNumber,
  matchesDeskQueueSearch,
  type DeskQueueFilter,
} from "@/lib/desk/queue";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

const CHIPS: Array<{ id: DeskQueueFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "arrived", label: "Arrived" },
  { id: "seen", label: "Seen" },
];

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
  token,
  density = "full",
}: {
  token: string;
  density?: "compact" | "full";
}) {
  const queryClient = useQueryClient();
  const browse = density === "full";
  const [filter, setFilter] = useState<DeskQueueFilter>("all");
  const [query, setQuery] = useState("");
  const [browseDate, setBrowseDate] = useState("");
  const {
    doctorId,
    today,
    timezone,
    rows,
    counts,
    error,
    loading,
    refreshing,
    hisab,
    refetch,
    cancelMutation,
    leaveMutation,
  } = useDeskTodayQuery(token, browse ? browseDate || undefined : undefined);

  useEffect(() => {
    if (browse && today && !browseDate) setBrowseDate(today);
  }, [browse, today, browseDate]);

  const visible = rows.filter((row) => {
    if (filter !== "all" && deskQueueBucket(row) !== filter) return false;
    if (browse && !matchesDeskQueueSearch(row, query)) return false;
    return true;
  });

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading today…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {browse && browseDate ? (
            <OpdSessionDatePicker value={browseDate} onChange={setBrowseDate} />
          ) : null}
          {browse ? (
            <DeskQueueSearch value={query} onChange={setQuery} />
          ) : null}
          <div
            role="tablist"
            aria-label="Filter today's list"
            className="flex items-center gap-1.5 overflow-x-auto py-1"
          >
            {CHIPS.map((chip) => {
              const isActive = filter === chip.id;
              const count = counts[chip.id];
              const muted = count === 0 && chip.id !== "all";
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilter(chip.id)}
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
            })}
          </div>
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
      {browse ? <DeskHisabCard hisab={hisab} /> : null}
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
            {rows.length === 0
              ? "No one on this day's list"
              : query.trim()
                ? "No one matches this search"
                : "No one in this filter"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0
              ? "Register a walk-in from Check-in, or pick another date."
              : query.trim()
                ? "Try a name, phone, or token."
                : "Try All, or check someone in from Check-in."}
          </p>
        </div>
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
              return (
                <div
                  key={row.id}
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
                    {formatDeskTime(row.appointment_date, timezone)}
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
                  <div
                    role="cell"
                    className="flex min-w-0 items-center gap-1 px-2 py-2"
                  >
                    <HisabCell
                      status={visitPaymentById(hisab?.visits, row.id)?.status}
                      collectedMinor={
                        visitPaymentById(hisab?.visits, row.id)?.collectedMinor
                      }
                      currency={hisab?.currency ?? "INR"}
                      methods={visitPaymentById(hisab?.visits, row.id)?.methods}
                    />
                  </div>
                  <div
                    role="cell"
                    className="flex items-center justify-end px-1 py-2"
                  >
                    {canDeskMoveVisit(row) && doctorId && today ? (
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
                    {canDeskCancelVisit(row) ? (
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
                    {canDeskLeaveVisit(row) ? (
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
              return (
                <li key={row.id} className="flex items-stretch">
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
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDeskTime(row.appointment_date, timezone)}
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
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusCell
                        bucket={bucket}
                        noShow={row.status === "no_show"}
                        label={deskStatusLabel(row)}
                      />
                      {canDeskMoveVisit(row) && doctorId && today ? (
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
                      {canDeskCancelVisit(row) ? (
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
                      {canDeskLeaveVisit(row) ? (
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
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
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
