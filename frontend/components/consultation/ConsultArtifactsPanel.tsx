"use client";

/**
 * `<ConsultArtifactsPanel>` — single home for everything the doctor or
 * patient can review AFTER a consult ends (Plan 07 · Task 29).
 *
 * v1 mounts only the audio section (`<RecordingReplayPlayer>`); the
 * transcript and chat-export slots are scaffolded as "Coming soon" so
 * the layout doesn't shift when Tasks 32 / 39 land. This keeps the
 * mounting contract on `/dashboard/appointments/[id]` stable across
 * those follow-up tasks.
 *
 * Why a panel and not a list of cards: putting all post-consult
 * artifacts in one component lets us keep the audit-context flag
 * (`callerRole`) in one place and means the patient-facing
 * `/c/replay/[sessionId]` route can render the SAME panel — just with
 * `callerRole='patient'`.
 */

import RecordingReplayPlayer from "./RecordingReplayPlayer";
import TranscriptDownloadButton from "./TranscriptDownloadButton";

export interface ConsultArtifactsPanelProps {
  sessionId: string;
  /** Bearer token (doctor JWT or patient scoped JWT). */
  token: string;
  /** Drives copy + watermark identity downstream. */
  callerRole: "doctor" | "patient";
  /** Display label for the watermark (e.g. doctor's name). Optional. */
  callerLabel?: string;
  className?: string;
}

export default function ConsultArtifactsPanel(
  props: ConsultArtifactsPanelProps,
): JSX.Element {
  const { sessionId, token, callerRole, callerLabel, className } = props;

  return (
    <section
      aria-labelledby={`artifacts-${sessionId}-heading`}
      className={[
        "flex flex-col gap-4",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header>
        <h2
          id={`artifacts-${sessionId}-heading`}
          className="text-lg font-semibold text-gray-900"
        >
          Consult artifacts
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Recording, transcript, and chat history for this consult.
        </p>
      </header>

      <RecordingReplayPlayer
        sessionId={sessionId}
        token={token}
        callerRole={callerRole}
        callerLabel={callerLabel}
      />

      {/* Task 32 — transcript PDF download. The AI-summary slot will
          land here in a follow-up; for v1 we surface just the transcript. */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Transcript
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          A PDF containing the full chat, voice transcript, and attachments
          from this consult. Every download is audited.
        </p>
        <div className="mt-3">
          <TranscriptDownloadButton
            sessionId={sessionId}
            token={token}
            callerRole={callerRole}
          />
        </div>
      </section>

      {/* Task 39 swap point — chat-export card (PDF / .txt of the
          companion text channel). */}
      <PlaceholderCard
        title="Chat history"
        body="The full text-chat history from this consult will be available for download here once Task 39 ships."
      />
    </section>
  );
}

function PlaceholderCard(props: { title: string; body: string }): JSX.Element {
  return (
    <section className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
      <h3 className="text-sm font-semibold text-gray-700">{props.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{props.body}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">
        Coming soon
      </p>
    </section>
  );
}
