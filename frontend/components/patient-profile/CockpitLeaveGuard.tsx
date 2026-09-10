"use client";

/**
 * Mid-consult leave guard for the appointment cockpit.
 *
 * When active (live / wrap_up), every same-origin leave — header ←,
 * queue-rail tabs, sidebar, browser Back — is leave-and-resume-later:
 * flush the draft, mark Incomplete, navigate. A prescription is issued
 * only when Done marks it done.
 *
 * Tab close / refresh: native beforeunload plus the Incomplete marker.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MutableRefObject } from "react";
import { markConsultSteppedAway } from "@/lib/cockpit/consult-stepped-away";

export type CockpitLeaveGuardProps = {
  appointmentId: string;
  /** True while leaving a live / wrap-up consult should resume later. */
  active: boolean;
  /** Persist the in-progress draft before the route changes. */
  beforeLeave?: () => void | Promise<void>;
};

const GUARD_KEY = "__cockpitLeave" as const;
/** Don't stall header Back / prev / next if draft flush hangs. */
const FLUSH_BUDGET_MS = 1500;

function isGuardState(state: unknown): boolean {
  return typeof state === "object" && state !== null && GUARD_KEY in state;
}

/** Drop the dummy guard entry in place. `history.go(-1)` races with `router.push`. */
function stripDummyGuard(): void {
  if (!isGuardState(window.history.state)) return;
  const current = window.history.state;
  const rest =
    current && typeof current === "object"
      ? Object.fromEntries(
          Object.entries(current as Record<string, unknown>).filter(
            ([key]) => key !== GUARD_KEY
          )
        )
      : null;
  window.history.replaceState(
    rest && Object.keys(rest).length > 0 ? rest : null,
    "",
    window.location.href
  );
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
    stripDummyGuard();
    navigateClient(router, pending.href);
    return;
  }
  ignoreNextPopRef.current = true;
  window.history.back();
}

function flushWithBudget(
  flush: (() => void | Promise<void>) | undefined
): Promise<void> {
  const work = Promise.resolve(flush?.()).catch(() => undefined);
  const budget = new Promise<void>((resolve) => {
    window.setTimeout(resolve, FLUSH_BUDGET_MS);
  });
  return Promise.race([work, budget]);
}

export function CockpitLeaveGuard({
  appointmentId,
  active,
  beforeLeave,
}: CockpitLeaveGuardProps): null {
  const router = useRouter();

  const activeRef = useRef(active);
  activeRef.current = active;

  const ignoreNextPopRef = useRef(false);
  const leavingRef = useRef(false);
  const beforeLeaveRef = useRef(beforeLeave);
  beforeLeaveRef.current = beforeLeave;
  const appointmentIdRef = useRef(appointmentId);
  appointmentIdRef.current = appointmentId;
  const routerRef = useRef(router);
  routerRef.current = router;

  const beginLeaveRef = useRef<(pending: PendingLeave) => void>(() => {});
  beginLeaveRef.current = (pending: PendingLeave) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    void flushWithBudget(beforeLeaveRef.current).then(() => {
      markConsultSteppedAway(appointmentIdRef.current);
      continueLeave(routerRef.current, pending, ignoreNextPopRef);
      leavingRef.current = false;
    });
  };

  useEffect(() => {
    if (!active) return;
    if (isGuardState(window.history.state)) return;
    window.history.pushState({ [GUARD_KEY]: 1 }, "", window.location.href);
  }, [active]);

  useEffect(() => {
    if (active) return;
    if (!isGuardState(window.history.state)) return;
    // history.go(-1) races with post-finish router.push (AdvanceToNextPatient)
    // and pops back to this visit — toast says Next, URL never changes.
    stripDummyGuard();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      markConsultSteppedAway(appointmentIdRef.current);
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
      if (!activeRef.current) return;
      beginLeaveRef.current({ kind: "history" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onClickCapture = (e: MouseEvent) => {
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
      beginLeaveRef.current({ kind: "href", href: nextPath });
    };
    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [active]);

  return null;
}
