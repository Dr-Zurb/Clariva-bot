"use client";

/**
 * useMediaQuery — minimal SSR-safe matchMedia hook.
 *
 * Used by EHR Sub-batch A / T1.4 (chart rail desktop vs mobile layout
 * detection). Kept tiny intentionally — if a project-wide need
 * materializes, swap this for a shared hook + add a named export there.
 *
 * Server-render returns the `serverDefault` (default: `false`) so we
 * don't get a hydration mismatch warning. The first client effect
 * tick reconciles to the real value.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string, serverDefault = false): boolean {
  const [matches, setMatches] = useState<boolean>(serverDefault);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const apply = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches);
    apply(mql);
    // Older Safari uses addListener / removeListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
    mql.addListener(apply);
    return () => mql.removeListener(apply);
  }, [query]);

  return matches;
}
