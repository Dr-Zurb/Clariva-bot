/**
 * Cockpit state machine — the single source of truth for what the
 * appointment-detail "cockpit" pane shows at any given moment.
 *
 * Background (Cockpit redesign batch · Lane α · cockpit-1):
 *   The cockpit center pane needs to render exactly one of six states:
 *     `ready` | `lobby` | `live` | `wrap_up` | `ended` | `terminal`
 *
 *   Today the same derivation is open-coded in three places:
 *     1. `AppointmentDetailWorkArea.tsx` — `hasSession / sessionEnded /
 *        sessionLive / consultationStarted` flags + tab-visibility +
 *        modality-aware CTA derivation.
 *     2. `ConsultationLauncher.tsx` — `canStartConsultation` (lines
 *        153-157) + the text-rehydrate predicate
 *        `existingTextSessionId` (lines 276-283).
 *     3. The page header CTA derivation.
 *
 *   All three compute slightly different views of the same truth.
 *   This module centralises that derivation as a pure function so
 *   downstream cockpit-2 / cockpit-5 / cockpit-6 / cockpit-8 tasks
 *   read from one place.
 *
 * This module has **no React, Next, or UI-lib imports** — it is a
 * pure helper, trivially memoisable, fully unit-testable, and safe
 * to import from anywhere in the bundle.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Mirrors `AppointmentStatus` from `@/types/appointment`. Defined here so
 * this module stays DL-2 clean (`lib/patient-profile` must not import medical
 * domain types — only `PatientProfilePage.tsx` may bridge).
 */
export type CockpitAppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/**
 * Mirrors `ConsultationModality` from `@/types/appointment` (DL-2 duplicate).
 */
export type CockpitConsultationModality =
  | "text"
  | "voice"
  | "video"
  | "in_clinic";

/**
 * Mirrors `ConsultationSessionSummary` from `@/types/appointment` (DL-2 duplicate).
 */
export interface CockpitSessionSummary {
  id: string;
  modality: "text" | "voice" | "video";
  status: "scheduled" | "live" | "ended" | "no_show" | "cancelled";
  provider: string;
  provider_session_id: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
}

/**
 * The six mutually-exclusive cockpit pane states. Every
 * `(appointmentStatus, session)` pair resolves to exactly one of these.
 *
 *   - `ready`    — confirmed/pending appointment, no live session yet.
 *                  Doctor has not started the consult.
 *   - `lobby`    — session row exists with `status='live'`, but the
 *                  consultation has not been "joined" (video/voice has
 *                  no Twilio room SID yet). Pre-call surface.
 *   - `live`     — session active and joined. The consultation room
 *                  is mounted; doctor and (potentially) patient are in.
 *   - `wrap_up`  — session has ended but the appointment is not yet
 *                  `completed`. Discriminator: session.status='ended'
 *                  while appointment.status is still pending/confirmed.
 *                  The doctor must explicitly mark the visit done (via
 *                  the WrapUpDialog) to advance to `ended`. The Rx
 *                  workspace remains editable and sendable.
 *   - `ended`    — appointment was marked `completed` (with or without
 *                  a session). Read-only Rx; post-call summary surface.
 *   - `terminal` — appointment was `cancelled` / `no_show`, or its
 *                  session was. No actionable surface — Rx pane hides.
 */
export type CockpitState =
  | "ready"
  | "lobby"
  | "live"
  | "wrap_up" // session ended, appointment not yet completed
  | "ended"
  | "terminal";

/**
 * Cockpit layout template ids. Mirrors the factory ids in
 * `templates.tsx` — kept here so the dispatcher stays React-free.
 */
export type CockpitTemplate =
  | "telemed-video"
  | "telemed-voice"
  | "telemed-text"
  | "review";

/** Doctor's global template pin; `null` means auto-select per state + modality. */
export type CockpitTemplateOverride = CockpitTemplate | null;

/**
 * Inputs for {@link deriveCockpitState}. Intentionally narrow: only the
 * `appointment.status` field plus the (optional) enriched
 * `consultation_session` summary attached by the appointment-service
 * enrichment layer (Task 35).
 */
export interface CockpitStateInput {
  appointmentStatus: CockpitAppointmentStatus;
  session: CockpitSessionSummary | null | undefined;
}

/**
 * Discriminator for the primary cockpit CTA. Consumers (cockpit header,
 * post-call rail) translate this into the actual button handler.
 */
export type CockpitPrimaryAction =
  | "start"
  | "resend"
  | "end"
  | "wrap-up"
  | "reschedule";

export interface CockpitPrimaryCta {
  /** Visible button label. */
  label: string;
  /** Stable identifier consumed by the button click handler. */
  action: CockpitPrimaryAction;
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * Derive the cockpit pane state from the appointment + (optional)
 * consultation-session summary.
 *
 * The function is **pure** (no side-effects, no hooks) and **total** —
 * every `(appointmentStatus, session)` combination resolves to exactly
 * one {@link CockpitState}.
 *
 * Truth table (locked by the cockpit-1 design pass — the test suite
 * encodes every row verbatim):
 *
 *   | appointment.status     | session?.status       | extra signal                                  | → state    |
 *   |------------------------|-----------------------|-----------------------------------------------|------------|
 *   | pending / confirmed    | absent / null         | n/a                                           | ready      |
 *   | pending / confirmed    | live                  | provider_session_id absent (video/voice)      | lobby      |
 *   | pending / confirmed    | live                  | provider_session_id present                   | live       |
 *   | pending / confirmed    | live                  | text modality (always treated as joined)      | live       |
 *   | pending / confirmed    | scheduled             | n/a                                           | ready      |
 *   | pending / confirmed    | ended                 | n/a                                           | wrap_up    |
 *   | pending / confirmed    | cancelled / no_show   | n/a                                           | terminal   |
 *   | completed              | absent / null         | n/a                                           | ended      |
 *   | completed              | ended                 | n/a                                           | ended      |
 *   | completed              | live                  | n/a (defensive — brief flip window)           | live       |
 *   | completed              | scheduled / closed    | n/a (appointment trumps)                      | ended      |
 *   | cancelled              | any                   | n/a                                           | terminal   |
 *   | no_show                | any                   | n/a                                           | terminal   |
 *
 * Why the lobby ↔ live split:
 *   - For video/voice, `provider_session_id` is the Twilio room SID
 *     (replacing the legacy `consultation_room_sid` column dropped in
 *     Task 35). Its presence means the room exists and the doctor can
 *     join; its absence on a `live` session means we are in the brief
 *     "session row created but Twilio room not yet provisioned" window.
 *   - For text consultations, there is no Twilio room and
 *     `provider_session_id` is always `null`. The matching legacy
 *     predicate in `ConsultationLauncher.tsx:276-283` keys off
 *     `session.id` + `session.modality === 'text'`, treating any non-
 *     terminal text session as joined. We mirror that: a text session
 *     with `status='live'` is `live`, never `lobby`.
 *
 * Why `terminal` exists:
 *   `cancelled` / `no_show` should hide the Rx pane entirely;
 *   rendering an editable Rx form for a cancelled appointment is a
 *   footgun. `terminal` makes the gate explicit.
 */
export function deriveCockpitState(input: CockpitStateInput): CockpitState {
  const { appointmentStatus, session } = input;

  // 1. Hard terminals — the appointment status trumps any session signal.
  //    Rationale: a cancelled visit should never offer a "Resume" /
  //    "Send Rx" affordance, even if a stale session row lingers.
  if (appointmentStatus === "cancelled" || appointmentStatus === "no_show") {
    return "terminal";
  }

  // 2. Completed appointment branch.
  //    The visit is wrapped up; the cockpit shows the post-call /
  //    summary surface. We defer to the session signal only for the
  //    one row the design pass flagged as defensive: `completed × live`
  //    can occur briefly while the status flip is in flight, and the
  //    session is the more granular truth in that window.
  if (appointmentStatus === "completed") {
    if (!session) return "ended";
    if (session.status === "live") return "live";
    return "ended";
  }

  // 3. Active branch — pending / confirmed appointment.
  if (!session) return "ready";

  switch (session.status) {
    case "scheduled":
      // Session row pre-created (e.g. by patient join link generation)
      // but the consultation has not started. The doctor still sees
      // the "Start consult" affordance.
      return "ready";
    case "ended":
      // Session has ended but the appointment is not yet `completed`.
      // Doctor must explicitly mark the visit done via WrapUpDialog.
      return "wrap_up";
    case "cancelled":
    case "no_show":
      // Session was abandoned/cancelled even though the appointment
      // is still pending/confirmed. No actionable surface.
      return "terminal";
    case "live":
      // Lobby vs live discriminator (lifted from
      // `ConsultationLauncher.tsx:153-157` + `:276-283`).
      if (session.modality === "text") return "live";
      return session.provider_session_id ? "live" : "lobby";
  }
}

// ---------------------------------------------------------------------------
// Derived gates (used by the Rx workspace + chart rail)
// ---------------------------------------------------------------------------

/**
 * Gate for the prescription "Send to patient" button. Rx may only be
 * sent once a consultation is in flight or wrapped up — never from a
 * pre-call (`ready` / `lobby`) or terminal state.
 *
 * `wrap_up` is included because the doctor may still want to send or
 * revise the Rx while completing the visit notes before marking done.
 */
export function canSendPrescription(state: CockpitState): boolean {
  return state === "live" || state === "wrap_up" || state === "ended";
}

/**
 * Gate for editing the prescription draft. Editable up to and including
 * the wrap-up phase; read-only once the appointment is `completed`
 * (`ended` state); hidden in `terminal` (no Rx pane at all).
 */
export function canEditPrescriptionDraft(state: CockpitState): boolean {
  return (
    state === "ready" ||
    state === "lobby" ||
    state === "live" ||
    state === "wrap_up"
  );
}

/**
 * Whether the EHR chart rail (allergies, problems, vitals, history)
 * should mount alongside the cockpit. Walk-in appointments without a
 * `patient_id` cannot show a chart — there is no patient record to load
 * from. The state itself does not gate the rail otherwise; even the
 * `terminal` state benefits from the rail for context while the doctor
 * reschedules.
 */
export function shouldShowChartRail(
  state: CockpitState,
  hasPatientId: boolean,
): boolean {
  // `state` is unused today; kept in the signature so future tweaks
  // (e.g. hiding the rail in `terminal` once the reschedule modal
  // owns the surface) don't change the call-site contract.
  void state;
  return hasPatientId;
}

/**
 * Resolve the primary call-to-action button shown in the cockpit
 * header for a given state.
 *
 * The label is state-driven; the `modality` parameter is passed in so
 * downstream consumers can vary the click handler (start-text vs
 * start-voice vs start-video) without re-deriving it. The label set
 * is intentionally identical across modalities — design lock from the
 * cockpit-1 review.
 */
export function primaryCtaFor(
  state: CockpitState,
  modality: CockpitConsultationModality | null | undefined,
): CockpitPrimaryCta | null {
  // `modality` is reserved for the call handler — the visible label
  // is identical across text / voice / video. Reference it so unused-
  // parameter lints stay quiet.
  void modality;

  switch (state) {
    case "ready":
      return { label: "Start consult", action: "start" };
    case "lobby":
      return { label: "Resend join link", action: "resend" };
    case "live":
      return { label: "End consult", action: "end" };
    case "wrap_up":
      return { label: "Done with patient", action: "wrap-up" };
    case "ended":
      // CP-D4: no primary CTA in the ended state. Auto-advance flow
      // (NextPatientCountdown / EndOfDayCard) drives the next action.
      // For another Rx, doctor navigates to /dashboard/patients-v2/:id.
      return null;
    case "terminal":
      return { label: "Reschedule", action: "reschedule" };
  }
}

// ---------------------------------------------------------------------------
// Launcher mount gate
// ---------------------------------------------------------------------------

/**
 * Whether the ConsultationLauncher area should mount in the cockpit.
 *
 * The launcher (which initiates video/voice/text sessions) is only
 * meaningful in the `ready` state — before any session has started.
 * All other states either have a running session (no launch needed)
 * or are post-session (launch would be confusing or harmful).
 *
 * Centralised here so `pf-08` (queue rail) and `pf-11` (countdown
 * overlay) share the same predicate without drifting independently.
 */
export function shouldMountLauncher(state: CockpitState): boolean {
  return state === "ready";
}

// ---------------------------------------------------------------------------
// Template dispatcher (R-MOD-full · tmr-02)
// ---------------------------------------------------------------------------

/**
 * Map (cockpit state, modality, override) → CockpitTemplate id.
 *
 * Pure function — no React, no hooks, no fetches. Trivially testable.
 *
 * Priority order:
 *   1. override (doctor's global preference)
 *   2. state-based override: terminal | ended → review
 *   3. modality-based dispatch: video / voice / text / in_clinic
 *
 * Returns `CockpitTemplate` (never null). Walk-in appointments
 * (`patient_id` absent) are handled by the caller — see DL-7 of the
 * templates-r-mod batch plan. The caller short-circuits before calling
 * this function when no chart/template should mount.
 *
 * @see frontend/lib/patient-profile/templates.tsx for the factories this
 *      function dispatches to.
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/templates-r-mod/
 *      Tasks/task-tmr-02-map-state-to-template.md
 */
export function mapStateToTemplate(
  state: CockpitState,
  modality: CockpitConsultationModality | null | undefined,
  override: CockpitTemplateOverride,
): CockpitTemplate {
  if (override !== null) {
    return override;
  }

  if (state === "terminal" || state === "ended") {
    return "review";
  }

  switch (modality) {
    case "voice":
      return "telemed-voice";
    case "text":
      return "telemed-text";
    case "video":
    case "in_clinic":
    case null:
    case undefined:
    default:
      return "telemed-video";
  }
}
