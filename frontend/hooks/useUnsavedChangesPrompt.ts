"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE =
  "You have unsaved changes on Services catalog. Leave without saving? You can use Save first to keep them.";

/**
 * Warn when leaving the page with unsaved edits:
 * - Browser tab close / refresh / external navigation: native beforeunload dialog
 * - Same-site links (e.g. dashboard nav): confirm + block navigation if cancelled
 *
 * Note: SPA history (browser Back) is not fully interceptable in the App Router; link clicks and refresh/close are covered.
 */
export function useUnsavedChangesPrompt(isDirty: boolean, message: string = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target === "_blank" || anchor.download) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [isDirty, message]);
}
