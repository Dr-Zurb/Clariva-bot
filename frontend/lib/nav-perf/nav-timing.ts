"use client";

/**
 * PHI-free dashboard navigation timing (np-01 / R-MEASURE).
 *
 * Captures click → route first-contentful-paint and API request counts per
 * navigation. Sink: `console.debug` with a `[nav-perf]` prefix — swap the body
 * of `logNavPerfEvent` when a production analytics SDK ships.
 *
 * No request/response semantics are changed; this module only observes.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** North-star targets from plan-navigation-performance.md (np-01 budget). */
export const NAV_PERF_BUDGET = {
  /** Authenticated trivial GET floor after Phase 1. */
  authRequestFloorMs: 100,
  /** Route skeleton / shell acknowledgement after Phase 3. */
  skeletonAckMs: 100,
  /** Re-nav to a recently-seen page should feel instant (Phase 2 cache). */
  cachedReNavMs: 50,
} as const;

export type DailyDriverSurfaceId =
  | "today"
  | "opd"
  | "patients-list"
  | "patient-detail";

export interface DailyDriverSurface {
  id: DailyDriverSurfaceId;
  label: string;
  path: string;
}

/** Four daily-driver surfaces measured in np-01. */
export const DAILY_DRIVER_SURFACES: readonly DailyDriverSurface[] = [
  { id: "today", label: "Today", path: "/dashboard" },
  { id: "opd", label: "OPD", path: "/dashboard/opd-today" },
  {
    id: "patients-list",
    label: "Patients list",
    path: "/dashboard/patients-v2",
  },
  {
    id: "patient-detail",
    label: "Patient detail",
    path: "/dashboard/patients-v2/[id]",
  },
] as const;

export type NavPerfPayload = Record<string, string | number | boolean>;

export interface NavPerfMeasurement {
  fromPath: string;
  toPath: string;
  clickToFcpMs: number;
  apiRequestCount: number;
  buildMode: "dev" | "prod";
  surfaceId: DailyDriverSurfaceId | null;
  capturedAt: string;
}

export function logNavPerfEvent(
  event: string,
  payload: NavPerfPayload,
): void {
  try {
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[nav-perf]", event, payload);
    }
  } catch {
    /* instrumentation must never break the UI */
  }
}

/** Map a pathname to a daily-driver surface id, if any. */
export function surfaceIdForPath(pathname: string): DailyDriverSurfaceId | null {
  if (pathname === "/dashboard") return "today";
  if (pathname === "/dashboard/opd-today") return "opd";
  if (pathname === "/dashboard/patients-v2") return "patients-list";
  if (
    pathname.startsWith("/dashboard/patients-v2/") &&
    pathname !== "/dashboard/patients-v2/"
  ) {
    return "patient-detail";
  }
  return null;
}

/** p-th percentile (0–100) of a sorted numeric array; null when empty. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return Math.round(sorted[lower]!);
  const weight = rank - lower;
  return Math.round(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}

function buildMode(): "dev" | "prod" {
  return process.env.NODE_ENV === "development" ? "dev" : "prod";
}

function isApiResource(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.startsWith("/api/v1/");
  } catch {
    return url.includes("/api/v1/");
  }
}

function countApiRequestsSince(sinceStartTime: number): number {
  if (typeof performance === "undefined") return 0;
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  return entries.filter(
    (entry) => entry.startTime >= sinceStartTime && isApiResource(entry.name),
  ).length;
}

interface PendingNavClick {
  fromPath: string;
  toPath: string;
  clickStartTime: number;
}

let pendingClick: PendingNavClick | null = null;
const measurements: NavPerfMeasurement[] = [];

declare global {
  interface Window {
    /** Programmatic readout for baseline capture scripts (np-01). */
    __navPerf?: {
      measurements: NavPerfMeasurement[];
      getLastMeasurement: () => NavPerfMeasurement | null;
      clearMeasurements: () => void;
      markNavClick: (fromPath: string, toPath: string) => void;
      markRouteFcp: (pathname: string) => void;
    };
  }
}

function publishWindowApi(): void {
  if (typeof window === "undefined") return;
  window.__navPerf = {
    measurements,
    getLastMeasurement: () => measurements.at(-1) ?? null,
    clearMeasurements: () => {
      measurements.length = 0;
    },
    markNavClick,
    markRouteFcp,
  };
}

/** Record a sidebar (or other in-app) navigation click. */
export function markNavClick(fromPath: string, toPath: string): void {
  if (typeof performance === "undefined") return;
  pendingClick = {
    fromPath,
    toPath,
    clickStartTime: performance.now(),
  };
}

/** Record route FCP after pathname settles (double rAF). */
export function markRouteFcp(pathname: string): void {
  if (!pendingClick) return;
  if (typeof performance === "undefined") return;

  const target = pendingClick.toPath.split("?")[0] ?? pendingClick.toPath;
  const current = pathname.split("?")[0] ?? pathname;
  if (target !== current && !current.startsWith(`${target}/`)) return;

  const clickToFcpMs = Math.round(performance.now() - pendingClick.clickStartTime);
  const apiRequestCount = countApiRequestsSince(pendingClick.clickStartTime);

  const record: NavPerfMeasurement = {
    fromPath: pendingClick.fromPath,
    toPath: pathname,
    clickToFcpMs,
    apiRequestCount,
    buildMode: buildMode(),
    surfaceId: surfaceIdForPath(pathname),
    capturedAt: new Date().toISOString(),
  };

  logNavPerfEvent("nav.route_fcp", {
    from: record.fromPath,
    to: record.toPath,
    click_to_fcp_ms: record.clickToFcpMs,
    api_request_count: record.apiRequestCount,
    build_mode: record.buildMode,
    surface_id: record.surfaceId ?? "other",
  });

  publishMeasurement(record);
  pendingClick = null;
}

function publishMeasurement(record: NavPerfMeasurement): void {
  measurements.push(record);
  publishWindowApi();
}

/**
 * Client tracker: sidebar link clicks + pathname FCP (double rAF).
 * Mount once at the dashboard shell boundary.
 */
export function NavPerfTracker(): null {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const skipInitialPath = useRef(true);

  useEffect(() => {
    publishWindowApi();
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/dashboard")) return;
      if (!anchor.closest("nav")) return;
      markNavClick(pathnameRef.current, href);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (skipInitialPath.current) {
      skipInitialPath.current = false;
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markRouteFcp(pathname);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
