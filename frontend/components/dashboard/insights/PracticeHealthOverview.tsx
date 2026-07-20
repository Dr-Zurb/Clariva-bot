"use client";

/**
 * Practice-health overview (insights-v1 · ins-02).
 *
 * Page shell for Insights: shared 7/30/90 range control, Tier-1 KPI tiles,
 * and a modality volume breakdown. Later tiers (`ins-03`…`05`) mount as
 * siblings under the same `InsightsRangeProvider` and call `useInsightsRange()`.
 *
 * INS-D6: uses the repo's existing `recharts` dep (no new chart library).
 * INS-D2: aggregate-only — never renders patient names / phones.
 */

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePracticeHealthQuery } from "@/hooks/queries/usePracticeHealthQuery";
import type { PracticeHealthOverview as PracticeHealthData } from "@/lib/api";
import { BookingFunnel } from "./BookingFunnel";
import { ClinicalMix } from "./ClinicalMix";
import {
  InsightsRangeControl,
  InsightsRangeProvider,
  useInsightsRange,
} from "./InsightsRangeControl";
import { TelehealthQuality } from "./TelehealthQuality";

// ---------------------------------------------------------------------------
// Formatting helpers (pure; exported for tests)
// ---------------------------------------------------------------------------

const MODALITY_LABELS: Record<string, string> = {
  in_clinic: "In clinic",
  video: "Video",
  voice: "Voice",
  text: "Text",
  unknown: "Unknown",
};

const MODALITY_COLORS = [
  "hsl(var(--chart-1, 221 83% 53%))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 49%))",
  "hsl(var(--chart-5, 27 87% 67%))",
];

/** Format minor-unit money with the given ISO currency code. */
export function formatRevenueMinor(
  amountMinor: number,
  currency: string,
): string {
  const code = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    // Unknown currency code — fall back to a plain minor/100 + code.
    return `${(amountMinor / 100).toLocaleString()} ${code}`;
  }
}

/** Format a rate in 0..1 as a percentage string (e.g. `12.5%`). */
export function formatRatePercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
}

/**
 * Format duration seconds as `m:ss` under an hour, else `Xh Ym`.
 * Returns `null` when there is no timed sample (caller renders `—`).
 */
export function formatDurationSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return s > 0 ? `${h}h ${m}m` : `${h}h ${m}m`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function modalityLabel(key: string): string {
  return MODALITY_LABELS[key] ?? key.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Tile (mirrors KpiStrip's KpiCard language — DO NOT import from KpiStrip)
// ---------------------------------------------------------------------------

interface InsightKpiCardProps {
  label: string;
  value: string | number | null;
  isLoading: boolean;
  hint?: string;
}

function InsightKpiCard({
  label,
  value,
  isLoading,
  hint,
}: InsightKpiCardProps): JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-1.5 h-8 flex items-center">
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <span className="text-2xl font-semibold font-tabular tabular-nums leading-none">
              {value ?? "—"}
            </span>
          )}
        </div>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Volume by modality (recharts horizontal bars — INS-D6 reuse)
// ---------------------------------------------------------------------------

interface VolumeByModalityProps {
  byModality: Record<string, number>;
  isLoading: boolean;
}

function VolumeByModality({
  byModality,
  isLoading,
}: VolumeByModalityProps): JSX.Element {
  const rows = useMemo(() => {
    return Object.entries(byModality)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({
        key,
        label: modalityLabel(key),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [byModality]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Volume by modality
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No appointments in this range.
          </p>
        ) : (
          <div className="h-48 w-full" data-testid="volume-by-modality-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={72}
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  formatter={(value: number) => [value, "Appointments"]}
                  contentStyle={{
                    borderRadius: 6,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {rows.map((row, i) => (
                    <Cell
                      key={row.key}
                      fill={MODALITY_COLORS[i % MODALITY_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inner body (needs InsightsRangeProvider)
// ---------------------------------------------------------------------------

function PracticeHealthOverviewBody({
  token,
}: {
  token: string;
}): JSX.Element {
  const { range } = useInsightsRange();
  const query = usePracticeHealthQuery(token, {
    from: range.from,
    to: range.to,
  });

  const data: PracticeHealthData | undefined = query.data;
  const isLoading = query.isLoading || query.isFetching;

  const tiles = useMemo(() => {
    if (!data) {
      return {
        consultsCompleted: null as number | null,
        noShowRate: null as string | null,
        revenue: null as string | null,
        medianDuration: null as string | null,
        revenueHint: undefined as string | undefined,
      };
    }
    const completed = data.volume.byStatus.completed ?? 0;
    const duration = formatDurationSeconds(data.consult.medianDurationSeconds);
    return {
      consultsCompleted: completed,
      noShowRate: formatRatePercent(data.noShowRate),
      revenue: formatRevenueMinor(data.revenueCapturedMinor, data.currency),
      medianDuration: duration,
      revenueHint: data.mixedCurrency
        ? "Dominant currency only (mixed currencies in range)"
        : undefined,
    };
  }, [data]);

  const isEmpty = Boolean(data && data.volume.total === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Practice health over the last {range.days} days
          </p>
        </div>
        <InsightsRangeControl />
      </div>

      {isEmpty ? (
        <p
          className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="insights-empty-state"
        >
          No activity in the last {range.days} days
        </p>
      ) : null}

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Practice health summary"
      >
        <InsightKpiCard
          label="Consults completed"
          value={tiles.consultsCompleted}
          isLoading={isLoading && !data}
        />
        <InsightKpiCard
          label="No-show rate"
          value={tiles.noShowRate}
          isLoading={isLoading && !data}
        />
        <InsightKpiCard
          label="Revenue captured"
          value={tiles.revenue}
          isLoading={isLoading && !data}
          hint={tiles.revenueHint}
        />
        <InsightKpiCard
          label="Median consult duration"
          value={tiles.medianDuration}
          isLoading={isLoading && !data}
        />
      </div>

      <VolumeByModality
        byModality={data?.volume.byModality ?? {}}
        isLoading={isLoading && !data}
      />

      <BookingFunnel token={token} />

      <ClinicalMix token={token} />

      <TelehealthQuality token={token} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public entry — wraps the body in the shared range provider
// ---------------------------------------------------------------------------

export interface PracticeHealthOverviewProps {
  token: string;
}

export function PracticeHealthOverview({
  token,
}: PracticeHealthOverviewProps): JSX.Element {
  return (
    <InsightsRangeProvider>
      <PracticeHealthOverviewBody token={token} />
    </InsightsRangeProvider>
  );
}
