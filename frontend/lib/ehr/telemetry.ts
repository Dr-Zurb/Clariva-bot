/**
 * EHR telemetry — PHI-free outcome events
 * (EHR Sub-batch C / T4.21 — C.4).
 *
 * Single emit surface for the pre-send modal so V2 / future
 * analytics swaps land in ONE place. Decision §23 LOCKED 2026-05-03:
 * the payload is restricted to non-PHI fields (warning kinds,
 * counts, severity, outcome, opaque ids). The function signature
 * intentionally has NO parameter capable of carrying allergen text,
 * drug names, diagnosis text, or any free-text clinical content.
 *
 * V1 implementation: write to `console.debug` (no-op when console
 * is undefined, e.g. SSR or stripped builds). Replace the body of
 * `emit()` with the production analytics SDK call (PostHog /
 * Segment / Mixpanel / a backend ingestion endpoint) when one ships;
 * the call-sites do not need to change.
 *
 * This module deliberately does NOT depend on Supabase / fetch /
 * the API client so it can be imported from any surface (modal,
 * pure helper test, etc.) without coupling.
 *
 * @see frontend/components/consultation/PrescriptionPreSendCheck.tsx
 * @see frontend/lib/ehr/pre-send-warnings.ts
 */

import type {
  PreSendWarningKind,
} from "./pre-send-warnings";
import type { InteractionSeverity } from "@/lib/api/drug-interactions";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PreSendOutcome = "cancelled" | "edited" | "sent-anyway";

/**
 * Wire-shape of the pre-send-check telemetry event.
 *
 * Field-level PHI hygiene:
 *   - `rxId`              UUID — opaque to the analytics layer.
 *   - `appointmentId`     UUID — opaque.
 *   - `warningKinds`      enum strings — no free text.
 *   - `warningCounts`     numeric counts per kind — useful for
 *                          severity calibration without leaking content.
 *   - `highestDdiSeverity` enum string — only set when the rx had a
 *                          DDI warning; useful for "doctor sent through
 *                          a contraindicated DDI" dashboards.
 *   - `outcome`           enum string — what the doctor did.
 *   - `occurredAt`        ISO timestamp — server-side time-of-day
 *                          analysis benefits from this without leaking
 *                          patient identity.
 *
 * Explicitly OUT of the payload: `allergyText`, `drugNames`,
 * `diagnosisText`, `patientId`, `medicineCount` (could correlate
 * with patient demographics in some edge cases — keep V1 conservative;
 * count by warning kind is sufficient for severity tuning).
 */
export interface PreSendTelemetryEvent {
  /** UUID of the (already-saved) Rx draft. Null if the autosave
   *  hadn't created one yet at modal-open time, but in practice the
   *  caller flushes before send so this should be non-null. */
  rxId: string | null;
  /** UUID of the parent appointment — opaque. */
  appointmentId: string;
  warningKinds: ReadonlyArray<PreSendWarningKind>;
  warningCounts: Partial<Record<PreSendWarningKind, number>>;
  highestDdiSeverity?: InteractionSeverity;
  outcome: PreSendOutcome;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/**
 * Emit a pre-send-check outcome. Intentionally fire-and-forget — the
 * function never throws and never returns anything other than `void`,
 * so callers can place it inline in click handlers without a try /
 * catch. A telemetry failure must NEVER block the doctor's flow.
 *
 * Decision §23 LOCKED: the body of this function is the ONE place to
 * change to wire a real analytics SDK. Do not call
 * `analytics.track()` from anywhere else in the EHR codebase — funnel
 * everything through here so the PHI invariant is auditable in one
 * file.
 */
export function emitPreSendOutcome(event: PreSendTelemetryEvent): void {
  if (typeof console === "undefined") return;
  try {
    // V1: console.debug is the sink. The dev console + browser
    // devtools network panel act as the de-facto "dashboard" until a
    // production analytics SDK lands. The `[ehr:pre-send-check]`
    // prefix is grep-friendly so QA can validate PHI hygiene by
    // filtering the console for this prefix and inspecting payloads.
    // eslint-disable-next-line no-console
    console.debug("[ehr:pre-send-check]", event);
  } catch {
    // Swallow. Telemetry must never break the form.
  }
}
