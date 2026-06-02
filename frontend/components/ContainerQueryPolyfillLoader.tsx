"use client";

/**
 * Loads container-query-polyfill only when the browser lacks native support.
 * No-op in Chrome 105+, Safari 16+, Firefox 110+ (~9KB gzipped when loaded).
 */
import { useEffect } from "react";

export function ContainerQueryPolyfillLoader() {
  useEffect(() => {
    const supports =
      typeof document !== "undefined" &&
      "container" in document.documentElement.style;
    if (!supports) {
      void import("container-query-polyfill");
    }
  }, []);

  return null;
}
