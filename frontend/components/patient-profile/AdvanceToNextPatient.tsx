"use client";

/**
 * AdvanceToNextPatient — deterministic post-finish automove (v3 cockpit).
 *
 * Mounted by `PatientProfilePage` only after a visit was finished in THIS
 * session (never when reviewing an old completed visit). Navigates to the
 * next eligible patient as soon as the day pipeline resolves.
 *
 * Deliberately independent of the pf-11 `patient_flow_advance` setting:
 * product rule is "finish = this patient is done → move to the next one",
 * except while an Rx print dialog is open (Chrome closes that preview
 * the moment this route changes).
 *
 * Status feedback is a short-lived toast in the same slot as other cockpit
 * toasts (top-right) so it never covers the Done / action dock. The
 * "No more patients in the queue" copy is reserved for the last token and
 * auto-dismisses; it is not a permanent overlay.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useNextAppointmentRoute } from "@/hooks/useNextAppointmentRoute";
import { prefetchNextConsult } from "@/lib/query/prefetch/next-consult";
import { cancelStorageKey } from "@/components/consultation/cockpit/NextPatientCountdown";
import {
  endPrintAdvanceHold,
  isPrintAdvanceHeld,
  subscribePrintAdvanceHold,
} from "@/lib/cockpit/rx-print-advance";

/** Match other cockpit toasts — top-right, above the header, not on Done. */
const TOAST_CLASS =
  "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-lg";

const EMPTY_QUEUE_TOAST_MS = 3500;
/**
 * Chrome often never reports that the system print dialog closed, so the
 * in-memory hold and the session park stay set and this toast sits forever.
 * Release both and move. Long enough for the dialog to attach; short enough
 * that a missed close signal cannot strand the queue.
 */
const PRINT_PARK_CAP_MS = 8_000;
/** Client router.push is sometimes dropped after the leave-guard history edit. */
const ADVANCE_NAV_FALLBACK_MS = 700;

export interface AdvanceToNextPatientProps {
  currentAppointmentId: string;
  token: string;
}

function isAdvanceParked(appointmentId: string): boolean {
  if (isPrintAdvanceHeld()) return true;
  try {
    return sessionStorage.getItem(cancelStorageKey(appointmentId)) === "1";
  } catch {
    return false;
  }
}

export function AdvanceToNextPatient({
  currentAppointmentId,
  token,
}: AdvanceToNextPatientProps): JSX.Element | null {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { next, isLoading, isLastInQueue } = useNextAppointmentRoute({
    currentAppointmentId,
    token,
  });
  // One-shot guard — strict-mode double effects and pipeline refetches must
  // not queue a second push.
  const firedRef = useRef(false);
  const [emptyToastGone, setEmptyToastGone] = useState(false);
  const [printParked, setPrintParked] = useState(() =>
    isAdvanceParked(currentAppointmentId)
  );

  const warmAndPush = useCallback(
    (target: { url: string; appointmentId: string; patientId: string | null }) => {
      firedRef.current = true;
      router.prefetch(target.url);
      prefetchNextConsult(queryClient, token, {
        appointmentId: target.appointmentId,
        patientId: target.patientId,
      });
      router.push(target.url);
      // If the app router drops the transition, the toast stays on this
      // visit. A full load still lands on the next patient.
      window.setTimeout(() => {
        try {
          if (window.location.pathname.includes(target.appointmentId)) return;
          window.location.assign(target.url);
        } catch {
          // jsdom has no navigation.
        }
      }, ADVANCE_NAV_FALLBACK_MS);
    },
    [queryClient, router, token]
  );

  const releasePark = useCallback(() => {
    try {
      sessionStorage.removeItem(cancelStorageKey(currentAppointmentId));
    } catch {
      // private mode / SSR
    }
    endPrintAdvanceHold();
    setPrintParked(false);
  }, [currentAppointmentId]);

  useEffect(() => {
    const syncPark = () => {
      setPrintParked(isAdvanceParked(currentAppointmentId));
    };
    syncPark();
    return subscribePrintAdvanceHold(syncPark);
  }, [currentAppointmentId]);

  useEffect(() => {
    if (!next || !printParked) return;
    const id = window.setTimeout(releasePark, PRINT_PARK_CAP_MS);
    return () => window.clearTimeout(id);
  }, [next, printParked, releasePark]);

  useEffect(() => {
    if (firedRef.current) return;
    if (!next) return;
    if (isAdvanceParked(currentAppointmentId)) return;
    firedRef.current = true;
    warmAndPush(next);
  }, [next, currentAppointmentId, printParked, warmAndPush]);

  useEffect(() => {
    if (next || isLoading || !isLastInQueue) return;
    const id = window.setTimeout(
      () => setEmptyToastGone(true),
      EMPTY_QUEUE_TOAST_MS
    );
    return () => window.clearTimeout(id);
  }, [next, isLoading, isLastInQueue]);

  if (isLoading && !next) {
    return (
      <div role="status" className={TOAST_CLASS}>
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-hidden
        />
        Finding next patient…
      </div>
    );
  }

  if (next) {
    return (
      <button
        type="button"
        role="status"
        className={`${TOAST_CLASS} pointer-events-auto`}
        onClick={() => {
          releasePark();
          warmAndPush(next);
        }}
      >
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-hidden
        />
        <span>
          Next: <span className="font-medium">{next.label}</span>
        </span>
      </button>
    );
  }

  // Only the last token in today's queue may show this copy. Any other
  // "next is null" case (stale pipeline, current visit not in the list)
  // stays silent so we never lie over the Done button.
  if (!isLastInQueue || emptyToastGone) {
    return null;
  }

  return (
    <div
      role="status"
      className={`${TOAST_CLASS} text-muted-foreground`}
    >
      No more patients in the queue
    </div>
  );
}
