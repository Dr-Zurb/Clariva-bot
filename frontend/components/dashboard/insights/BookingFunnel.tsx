"use client";

/**
 * Booking funnel + review SLA widget (insights-v1 · ins-03).
 *
 * Consumes the shared Insights range (`useInsightsRange`) — do not hardcode
 * a per-widget window. Aggregate-only; never renders patient / payment rows.
 *
 * INS-D6: compact CSS bar list (no new chart dependency).
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookingFunnelQuery } from "@/hooks/queries/useBookingFunnelQuery";
import type { BookingFunnelOverview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useInsightsRange } from "./InsightsRangeControl";
import { formatDurationSeconds } from "./PracticeHealthOverview";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous stage (null for the first stage). */
  conversionFromPrev: number | null;
}

/** Build ordered funnel stages + step-to-step conversion rates (0..1). */
export function buildFunnelStages(
  funnel: BookingFunnelOverview["funnel"],
): FunnelStage[] {
  const stages: Array<{ key: string; label: string; count: number }> = [
    { key: "slotsSelected", label: "Slots selected", count: funnel.slotsSelected },
    { key: "slotsConsumed", label: "Slots consumed", count: funnel.slotsConsumed },
    {
      key: "paymentsCaptured",
      label: "Payments captured",
      count: funnel.paymentsCaptured,
    },
    {
      key: "appointmentsConfirmed",
      label: "Appointments confirmed",
      count: funnel.appointmentsConfirmed,
    },
  ];

  return stages.map((stage, i) => {
    if (i === 0) {
      return { ...stage, conversionFromPrev: null };
    }
    const prev = stages[i - 1]!.count;
    return {
      ...stage,
      conversionFromPrev: prev > 0 ? stage.count / prev : null,
    };
  });
}

/** Format a 0..1 conversion as a percentage, or `—` when undefined. */
export function formatConversion(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}%`;
}

interface BookingFunnelProps {
  token: string;
}

export function BookingFunnel({ token }: BookingFunnelProps): JSX.Element {
  const { range } = useInsightsRange();
  const query = useBookingFunnelQuery(token, {
    from: range.from,
    to: range.to,
  });

  const data = query.data;
  const isLoading = (query.isLoading || query.isFetching) && !data;

  const stages = useMemo(
    () => (data ? buildFunnelStages(data.funnel) : []),
    [data],
  );

  const maxCount = useMemo(
    () => stages.reduce((m, s) => Math.max(m, s.count), 0),
    [stages],
  );

  const isEmpty = Boolean(
    data &&
      data.funnel.slotsSelected === 0 &&
      data.funnel.slotsConsumed === 0 &&
      data.funnel.paymentsCaptured === 0 &&
      data.funnel.appointmentsConfirmed === 0,
  );

  const medianResolution = data
    ? formatDurationSeconds(data.review.medianResolutionSeconds)
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Booking funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-5/6" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : isEmpty ? (
            <p
              className="py-6 text-sm text-muted-foreground"
              data-testid="funnel-empty-state"
            >
              No booking activity in the last {range.days} days
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Booking funnel stages">
              {stages.map((stage) => {
                const widthPct =
                  maxCount > 0
                    ? Math.max(4, Math.round((stage.count / maxCount) * 100))
                    : 0;
                return (
                  <li key={stage.key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {stage.label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {stage.count}
                        </span>
                        {stage.conversionFromPrev != null ? (
                          <span className="ml-2 text-xs">
                            ← {formatConversion(stage.conversionFromPrev)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full bg-primary transition-[width]",
                        )}
                        style={{ width: `${widthPct}%` }}
                        data-testid={`funnel-bar-${stage.key}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            Review backlog / SLA
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ) : (
            <dl className="space-y-4" aria-label="Booking review SLA">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pending
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.review.pending ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Median resolution
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {medianResolution ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  SLA breached
                </dt>
                <dd
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    (data?.review.breachedSla ?? 0) > 0 && "text-destructive",
                  )}
                >
                  {data?.review.breachedSla ?? "—"}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
