"use client";

/**
 * Mid-consult leave guard for the appointment cockpit.
 *
 * When active (live / wrap_up):
 * - Same-origin link clicks (header ← back, queue-rail patient tabs, sidebar)
 *   hold navigation and notify the shell (`onLeaveIntent`) so the Done
 *   preview can open with Stay / Leave — resume later.
 * - Browser Back/Forward is intercepted via a guard history entry.
 * - Tab close / refresh: native beforeunload only.
 *
 * Finish / send live on the preview. This guard only owns stay, resume
 * later, and continuing the pending navigation after a successful wrap-up.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  clearConsultSteppedAway,
  markConsultSteppedAway,
} from "@/lib/cockpit/consult-stepped-away";

export type CockpitLeaveExit = {
  stay: () => void;
  resumeLater: () => void;
  continueAfterFinish: () => void;
};

export type CockpitLeaveGuardProps = {
  appointmentId: string;
  /** True while the doctor should be prompted before leaving. */
  active: boolean;
  /** Non-null while a leave is held — shell opens the Done preview. */
  onLeaveIntent?: (exit: CockpitLeaveExit | null) => void;
};

const GUARD_KEY = "__cockpitLeave" as const;

function isGuardState(state: unknown): boolean {
  return typeof state === "object" && state !== null && GUARD_KEY in state;
}

type PendingLeave = { kind: "href"; href: string } | { kind: "history" };

function navigateClient(
  router: ReturnType<typeof useRouter>,
  pathWithQueryAndHash: string
) {
  try {
    const url = new URL(pathWithQueryAndHash, window.location.origin);
    const dest = url.pathname + url.search + url.hash;
    router.push(dest || "/");
  } catch {
    router.push("/");
  }
}

function continueLeave(
  router: ReturnType<typeof useRouter>,
  pending: PendingLeave,
  ignoreNextPopRef: MutableRefObject<boolean>
) {
  if (pending.kind === "href") {
    if (isGuardState(window.history.state)) {
      ignoreNextPopRef.current = true;
      window.history.go(-1);
    }
    setTimeout(() => navigateClient(router, pending.href), 0);
    return;
  }
  ignoreNextPopRef.current = true;
  window.history.back();
}

export function CockpitLeaveGuard({
  appointmentId,
  active,
  onLeaveIntent,
}: CockpitLeaveGuardProps): null {
  const router = useRouter();
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;

  const ignoreNextPopRef = useRef(false);
  const allowNextNavRef = useRef(false);
  const pendingRef = useRef<PendingLeave | null>(null);
  pendingRef.current = pendingLeave;
  const onLeaveIntentRef = useRef(onLeaveIntent);
  onLeaveIntentRef.current = onLeaveIntent;

  useEffect(() => {
    if (!active) {
      setPendingLeave(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (isGuardState(window.history.state)) return;
    window.history.pushState({ [GUARD_KEY]: 1 }, "", window.location.href);
  }, [active]);

  useEffect(() => {
    if (active) return;
    if (!isGuardState(window.history.state)) return;
    ignoreNextPopRef.current = true;
    window.history.go(-1);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onPop = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      if (allowNextNavRef.current) {
        allowNextNavRef.current = false;
        return;
      }
      if (!activeRef.current) return;
      setPendingLeave({ kind: "history" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onClickCapture = (e: MouseEvent) => {
      if (allowNextNavRef.current) {
        allowNextNavRef.current = false;
        return;
      }
      if (e.defaultPrevented) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target === "_blank" || anchor.download) return;
      if (anchor.dataset.cockpitLeaveIgnore === "true") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const nextPath = url.pathname + url.search + url.hash;
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (nextPath === currentPath) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingLeave({ kind: "href", href: nextPath });
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [active]);

  useEffect(() => {
    if (!pendingLeave) {
      onLeaveIntentRef.current?.(null);
      return;
    }

    const stay = () => {
      setPendingLeave((prev) => {
        if (prev?.kind === "history") {
          if (!isGuardState(window.history.state)) {
            window.history.pushState(
              { [GUARD_KEY]: 1 },
              "",
              window.location.href
            );
          }
        }
        return null;
      });
    };

    const resumeLater = () => {
      const p = pendingRef.current;
      if (!p) return;
      markConsultSteppedAway(appointmentId);
      setPendingLeave(null);
      allowNextNavRef.current = true;
      continueLeave(router, p, ignoreNextPopRef);
    };

    const continueAfterFinish = () => {
      const p = pendingRef.current;
      if (!p) return;
      clearConsultSteppedAway(appointmentId);
      setPendingLeave(null);
      allowNextNavRef.current = true;
      continueLeave(router, p, ignoreNextPopRef);
    };

    onLeaveIntentRef.current?.({ stay, resumeLater, continueAfterFinish });
  }, [appointmentId, pendingLeave, router]);

  return null;
}
