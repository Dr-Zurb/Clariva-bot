"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

import CallPostCallSummary from "@/components/consultation/CallPostCallSummary";
import ConsultArtifactsPanel from "@/components/consultation/ConsultArtifactsPanel";
import type { Appointment } from "@/types/appointment";
import { useNextAppointmentRoute } from "@/hooks/useNextAppointmentRoute";
import { EndOfDayCard } from "./EndOfDayCard";
import { NextPatientCountdown } from "./NextPatientCountdown";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface EndedCardProps {
  appointment: Appointment;
  /** Doctor JWT forwarded to post-call summary + artifacts panel APIs. */
  token: string;
  /**
   * pf-11: how the countdown was triggered.
   *   'auto'   = fired by Send Rx → auto wrap-up flow.
   *   'manual' = doctor pressed "Done with patient".
   * Forwarded to NextPatientCountdown for informational context.
   */
  triggeredAt?: "auto" | "manual";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Center-pane card for the `ended` cockpit state.
 *
 * Renders three Plan-07 surfaces in vertical order:
 *
 *   1. `<CallPostCallSummary>` — structured "what just happened" card.
 *   2. `<ConsultArtifactsPanel>` — audio replay + upcoming transcript /
 *      chat-export slots.
 *   3. "View conversation" link — deep-link to the full chat-history page.
 *
 * All three surfaces are gated on `consultation_session` existence.
 * When the appointment was marked `completed` without ever creating a
 * session row (edge case: in-clinic walk-in), a short empty-state is
 * shown instead of three broken API calls.
 *
 * The three Plan-07 JSDoc blocks below are carried verbatim from
 * `ConsultationCockpit.tsx` (cockpit-2 placed them there as a
 * placeholder; cockpit-3 moves them here, next to the surfaces they
 * document — per task spec §Acceptance criteria "Preserve the three
 * Plan-07 / video-D1 JSDoc blocks verbatim").
 */
export default function EndedCard({
  appointment,
  token,
  triggeredAt,
}: EndedCardProps) {
  const sessionId = appointment.consultation_session?.id ?? null;

  // pf-11: once the doctor explicitly cancels the countdown we stop
  // mounting <NextPatientCountdown> so the primary content is fully
  // interactive again.
  const [countdownDismissed, setCountdownDismissed] = useState(false);

  // pf-18: resolve whether there is a next patient before rendering any
  // content, so the EndOfDayCard swap happens on first paint (no flicker).
  const { next: nextRoute, isLoading: routeLoading } = useNextAppointmentRoute(
    { currentAppointmentId: appointment.id, token },
  );

  if (!sessionId) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This appointment was completed with no recorded session.
        </p>
      </div>
    );
  }

  // pf-18: when the pipeline has resolved and there is no next patient, swap
  // the post-consult content for the end-of-day summary card.  Guard on
  // !routeLoading so we never flip prematurely while the pipeline is still
  // fetching (avoids a brief flash of EndOfDayCard on the first render tick).
  if (!routeLoading && nextRoute === null) {
    return <EndOfDayCard token={token} />;
  }

  return (
    // pf-11: `relative` positions the countdown overlay (absolute inset-0)
    // correctly over the primary content below.
    <div className="relative space-y-6">
      {/*
       * Sub-batch D · task-video-D1 — durable post-call summary.
       *
       * For ended consults of any modality (text/voice/video), surface
       * the structured summary at the top of the post-consult section
       * so the doctor sees "what just happened" at a glance before
       * the more detailed artifacts panel + chat-history link below.
       *
       * Modality-aware: video sessions show the snapshots count;
       * voice sessions hide it. Recording status pill degrades
       * gracefully when Plan 07 hasn't shipped on this deployment.
       */}
      <CallPostCallSummary
        sessionId={sessionId}
        bearerJwt={token}
        mountContext="history-detail"
      />

      {/*
       * Plan 07 · Task 29 — once the consult ends, surface the artifact
       * panel so the doctor can replay the audio and (later) read the
       * transcript / chat export. Voice is the v1 modality with audio;
       * we render for any ended session that has a session row, and
       * the panel itself handles the "no recording / patient declined
       * consent" empty state via `getReplayStatus`.
       */}
      <ConsultArtifactsPanel
        sessionId={sessionId}
        token={token}
        callerRole="doctor"
        callerLabel="Doctor view"
      />

      {/*
       * Plan 07 · Task 31 — "View conversation" link.
       *
       * Renders only when a `consultation_sessions` row exists for the
       * appointment (per task spec Notes #10: the session row is the
       * authoritative "there was a chat to view" check post-Plan-06).
       * In-clinic appointments never have a session row so the link is
       * hidden naturally — no extra modality gate needed.
       *
       * No status filter beyond "row exists" — Decision 1 sub-decision
       * LOCKED gives indefinite read access; even a `cancelled` /
       * `no_show` session has at least the system banners worth
       * surfacing if any chat happened before the status flip.
       *
       * Visual neighbor of `<ConsultArtifactsPanel>` — both surfaces
       * are post-consult artifacts; clustering them at the bottom of
       * the page mirrors the doctor's mental "what happened during
       * this consult?" workflow.
       */}
      <Link
        href={`/dashboard/appointments/${appointment.id}/chat-history`}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        View conversation
      </Link>

      {/*
       * pf-11 — NextPatientCountdown overlay.
       *
       * Positioned absolutely (inset-0 z-10) so it sits on top of the
       * primary content above. The component's own bg-background/95 dims
       * the content behind it while the countdown is active.
       *
       * Returns null when:
       *   - doctor_settings.patient_flow_advance !== 'countdown'
       *   - useNextAppointmentRoute().next === null (EndOfDayCard branch — pf-18)
       *   - doctor cancelled (manages its own state + sessionStorage flag)
       */}
      {!countdownDismissed && (
        <NextPatientCountdown
          currentAppointmentId={appointment.id}
          triggeredAt={triggeredAt}
          token={token}
          onCancel={() => setCountdownDismissed(true)}
          onDone={() => setCountdownDismissed(true)}
        />
      )}
    </div>
  );
}
