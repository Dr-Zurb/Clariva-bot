"use client";

/**
 * Insights range control (insights-v1 · ins-02 · INS-D5).
 *
 * Single source of truth for the 7 / 30 / 90-day window every Insights
 * widget consumes. Later tiers (`ins-03`…`05`) must use `useInsightsRange()`
 * (or accept the same `InsightsDateRange` prop) — do not hardcode per-widget
 * ranges.
 *
 * Shape (documented for later tiles):
 *   - `days`  — selected preset (7 | 30 | 90); default 30
 *   - `from`  — inclusive start day, local `YYYY-MM-DD`
 *   - `to`    — inclusive end day, local `YYYY-MM-DD` (today)
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { todayLocalIso } from "@/lib/dates";

export const INSIGHTS_RANGE_PRESETS = [7, 30, 90] as const;
export type InsightsRangeDays = (typeof INSIGHTS_RANGE_PRESETS)[number];
export const DEFAULT_INSIGHTS_RANGE_DAYS: InsightsRangeDays = 30;

export interface InsightsDateRange {
  days: InsightsRangeDays;
  from: string;
  to: string;
}

interface InsightsRangeContextValue {
  range: InsightsDateRange;
  setDays: (days: InsightsRangeDays) => void;
}

const InsightsRangeContext = createContext<InsightsRangeContextValue | null>(
  null,
);

/** Subtract `days` from a local `YYYY-MM-DD`, returning local `YYYY-MM-DD`. */
export function localYmdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Build an inclusive `{ from, to, days }` window ending today (local). */
export function insightsRangeFromDays(days: InsightsRangeDays): InsightsDateRange {
  const to = todayLocalIso();
  // Inclusive window of N days → from = today − (N − 1).
  const from = localYmdMinusDays(to, days - 1);
  return { days, from, to };
}

export function InsightsRangeProvider({
  children,
  initialDays = DEFAULT_INSIGHTS_RANGE_DAYS,
}: {
  children: ReactNode;
  initialDays?: InsightsRangeDays;
}): JSX.Element {
  const [days, setDaysState] = useState<InsightsRangeDays>(initialDays);
  const range = useMemo(() => insightsRangeFromDays(days), [days]);
  const setDays = useCallback((next: InsightsRangeDays) => {
    setDaysState(next);
  }, []);

  const value = useMemo(() => ({ range, setDays }), [range, setDays]);

  return (
    <InsightsRangeContext.Provider value={value}>
      {children}
    </InsightsRangeContext.Provider>
  );
}

/**
 * Consume the shared Insights range. Throws outside a provider so later
 * widgets fail loudly instead of silently inventing a default.
 */
export function useInsightsRange(): InsightsRangeContextValue {
  const ctx = useContext(InsightsRangeContext);
  if (!ctx) {
    throw new Error("useInsightsRange must be used within InsightsRangeProvider");
  }
  return ctx;
}

export interface InsightsRangeControlProps {
  className?: string;
}

/**
 * Segmented 7 / 30 / 90 control. Reads/writes the shared Insights range
 * context — mount under `InsightsRangeProvider`.
 */
export function InsightsRangeControl({
  className,
}: InsightsRangeControlProps): JSX.Element {
  const { range, setDays } = useInsightsRange();

  return (
    <div
      role="tablist"
      aria-label="Insights date range"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-input bg-background p-0.5",
        className,
      )}
    >
      {INSIGHTS_RANGE_PRESETS.map((preset) => {
        const selected = range.days === preset;
        return (
          <button
            key={preset}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setDays(preset)}
            className={cn(
              "h-7 min-w-[2.75rem] rounded-[5px] px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {preset}d
          </button>
        );
      })}
    </div>
  );
}
