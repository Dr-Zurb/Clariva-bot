"use client";

/**
 * `<TranscriptReplayPlaceholder>` — placeholder for the click-to-seek
 * transcript timeline (Sub-batch D · task-video-D2 · Plan 10 dep).
 *
 * The full feature renders transcript chunks alongside the recording
 * with click-to-seek into `<RecordingReplayPlayer>` (the "AI clinical
 * assist" experience). That requires Plan 10's chunked transcript-
 * replay endpoint with `timestamp_ms` per chunk — which is NOT
 * shipped at execution time (2026-05-01).
 *
 * For now we render a passive card that:
 *   1. Sets the layout slot in `<ConsultArtifactsPanel>` so the page
 *      doesn't shift when Plan 10 lands.
 *   2. Distinguishes the *interactive timeline* feature from the
 *      already-shipped Task 32 transcript-PDF download (which renders
 *      below this placeholder).
 *   3. Tells the user the feature is coming so they don't think the
 *      transcript is missing entirely (the PDF IS available).
 *
 * When Plan 10 ships:
 *   - Remove this component.
 *   - Wrap `<RecordingReplayPlayer>` + a new `<TranscriptReplaySidebar>`
 *     in a 2-column layout inside `<ConsultArtifactsPanel>` so chunk
 *     clicks can seek the player via a shared ref/context.
 *   - The Task 32 PDF download stays as a separate "export" affordance
 *     beside the live timeline (different intent: take-home vs in-app
 *     review).
 */
export default function TranscriptReplayPlaceholder() {
  return (
    <section
      aria-labelledby="transcript-timeline-heading"
      className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4"
    >
      <h3
        id="transcript-timeline-heading"
        className="text-sm font-semibold text-gray-700"
      >
        Transcript timeline (click to seek)
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        An interactive transcript that scrolls with the recording and lets you
        click any line to jump to that moment. Available once AI clinical
        assist (Plan 10) ships its chunked transcript replay endpoint.
      </p>
      <p className="mt-2 text-[11px] text-gray-500">
        In the meantime, the full transcript is available via the PDF download
        below.
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">
        Coming soon
      </p>
    </section>
  );
}
