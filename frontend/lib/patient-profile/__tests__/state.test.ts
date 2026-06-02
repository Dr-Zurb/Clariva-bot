/**
 * Unit tests for `cockpit-state` (Cockpit redesign batch · Lane α ·
 * cockpit-1).
 *
 * Runner note (mirrors `frontend/lib/ehr/match-allergens.test.ts` +
 * `pre-send-warnings.test.ts`):
 *   The frontend package does not yet have Jest / Vitest installed —
 *   only `@playwright/test` for E2E. This file is written in a
 *   runner-agnostic Jest-compatible style (`@jest/globals`-style
 *   imports, plain `describe` / `it` / `expect`) so it becomes
 *   executable the moment a frontend test runner is wired up. Until
 *   then, the helper is purely TypeScript with no React / DOM /
 *   network deps so any of `{ jest + ts-jest, vitest, node:test + tsx }`
 *   will run it.
 *
 * Coverage (locked truth table from the cockpit-1 + pf-03 task specs):
 *   13 rows of `deriveCockpitState` × 1 test each = 13 cases.
 *   5 helper test groups: `canSendPrescription`,
 *   `canEditPrescriptionDraft`, `shouldShowChartRail`, `primaryCtaFor`,
 *   `shouldMountLauncher`.
 */

import { describe, it, expect } from "vitest";
import {
  deriveCockpitState,
  canSendPrescription,
  canEditPrescriptionDraft,
  shouldShowChartRail,
  primaryCtaFor,
  shouldMountLauncher,
  mapStateToTemplate,
  type CockpitState,
  type CockpitAppointmentStatus,
  type CockpitConsultationModality,
  type CockpitSessionSummary,
  type CockpitTemplate,
  type CockpitTemplateOverride,
} from "../state";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

let sessionCounter = 0;

function makeSession(
  overrides: Partial<CockpitSessionSummary> = {},
): CockpitSessionSummary {
  sessionCounter += 1;
  return {
    id: `session-${sessionCounter}`,
    modality: "video",
    status: "live",
    provider: "twilio",
    provider_session_id: "RM_room_sid_xxx",
    actual_started_at: "2026-05-06T08:00:00.000Z",
    actual_ended_at: null,
    ...overrides,
  };
}

const ALL_STATES: readonly CockpitState[] = [
  "ready",
  "lobby",
  "live",
  "wrap_up",
  "ended",
  "terminal",
] as const;

// ---------------------------------------------------------------------------
// deriveCockpitState — truth-table coverage
// ---------------------------------------------------------------------------
//
// Each `it()` below maps to exactly one row of the locked truth table
// in the cockpit-1 task spec. Order matches the spec verbatim; a
// breaking change to any row should surface as a single failing test.

describe("deriveCockpitState — pending / confirmed × no session", () => {
  it("Row 1a: confirmed × no session row → ready", () => {
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session: null }),
    ).toBe<CockpitState>("ready");
  });

  it("Row 1b: pending × undefined session → ready", () => {
    expect(
      deriveCockpitState({
        appointmentStatus: "pending",
        session: undefined,
      }),
    ).toBe<CockpitState>("ready");
  });
});

describe("deriveCockpitState — pending / confirmed × live session", () => {
  it("Row 2: confirmed × live × video with no provider_session_id → lobby", () => {
    const session = makeSession({
      modality: "video",
      status: "live",
      provider_session_id: null,
    });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("lobby");
  });

  it("Row 2 (voice variant): confirmed × live × voice with no provider_session_id → lobby", () => {
    const session = makeSession({
      modality: "voice",
      status: "live",
      provider_session_id: null,
    });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("lobby");
  });

  it("Row 3: confirmed × live × video with provider_session_id present → live", () => {
    const session = makeSession({
      modality: "video",
      status: "live",
      provider_session_id: "RM_abc123",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("live");
  });

  it("Row 3 (text variant): confirmed × live × text → live (text has no Twilio room)", () => {
    // The text path mirrors `ConsultationLauncher.tsx:276-283`:
    // a text session with status='live' is treated as joined,
    // regardless of provider_session_id (which is always null
    // for text consultations).
    const session = makeSession({
      modality: "text",
      status: "live",
      provider_session_id: null,
    });
    expect(
      deriveCockpitState({ appointmentStatus: "pending", session }),
    ).toBe<CockpitState>("live");
  });
});

describe("deriveCockpitState — pending / confirmed × terminated session", () => {
  it("Row 4a: confirmed × ended session → wrap_up (session ended, appointment not yet completed)", () => {
    const session = makeSession({
      status: "ended",
      actual_ended_at: "2026-05-06T08:30:00.000Z",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("wrap_up");
  });

  it("Row 4b: pending × ended session → wrap_up (defensive — skipped status flip)", () => {
    const session = makeSession({
      status: "ended",
      actual_ended_at: "2026-05-06T08:30:00.000Z",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "pending", session }),
    ).toBe<CockpitState>("wrap_up");
  });

  it("Row 5a: confirmed × cancelled session → terminal", () => {
    const session = makeSession({ status: "cancelled" });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("terminal");
  });

  it("Row 5b: confirmed × no_show session → terminal", () => {
    const session = makeSession({ status: "no_show" });
    expect(
      deriveCockpitState({ appointmentStatus: "confirmed", session }),
    ).toBe<CockpitState>("terminal");
  });
});

describe("deriveCockpitState — completed appointment", () => {
  it("Row 6: completed × no session → ended (post-call view, no session row)", () => {
    expect(
      deriveCockpitState({ appointmentStatus: "completed", session: null }),
    ).toBe<CockpitState>("ended");
  });

  it("Row 7: completed × ended session → ended (regression guard — NOT wrap_up)", () => {
    // completed + ended must remain 'ended', not 'wrap_up'.
    // The wrap_up discriminator only fires when appointment is still
    // pending/confirmed. Once the appointment is completed, it's over.
    const session = makeSession({
      status: "ended",
      actual_ended_at: "2026-05-06T08:30:00.000Z",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "completed", session }),
    ).toBe<CockpitState>("ended");
  });

  it("Row 8: completed × live session → live (defensive — brief flip window)", () => {
    // Per the design pass: appointment marked completed while session
    // still live shouldn't normally happen, but during the state-flip
    // we defer to the more granular session signal.
    const session = makeSession({
      status: "live",
      provider_session_id: "RM_xyz",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "completed", session }),
    ).toBe<CockpitState>("live");
  });
});

describe("deriveCockpitState — cancelled / no_show appointment trumps everything", () => {
  it("Row 9: cancelled × no session → terminal", () => {
    expect(
      deriveCockpitState({ appointmentStatus: "cancelled", session: null }),
    ).toBe<CockpitState>("terminal");
  });

  it("Row 10: cancelled × any session → terminal (appointment trumps)", () => {
    const session = makeSession({
      status: "live",
      provider_session_id: "RM_lingering",
    });
    expect(
      deriveCockpitState({ appointmentStatus: "cancelled", session }),
    ).toBe<CockpitState>("terminal");
  });

  it("Row 11: no_show × any session → terminal", () => {
    const session = makeSession({ status: "ended" });
    expect(
      deriveCockpitState({ appointmentStatus: "no_show", session }),
    ).toBe<CockpitState>("terminal");
  });
});

describe("deriveCockpitState — totality (every status maps to a defined state)", () => {
  it("returns a defined CockpitState for every (status, sessionStatus) pair", () => {
    // Self-check that the function is total. If any case slipped
    // through the switch, this would surface `undefined` here.
    const statuses: CockpitAppointmentStatus[] = [
      "pending",
      "confirmed",
      "completed",
      "cancelled",
      "no_show",
    ];
    const sessionStatuses: Array<CockpitSessionSummary["status"]> = [
      "scheduled",
      "live",
      "ended",
      "no_show",
      "cancelled",
    ];

    for (const appointmentStatus of statuses) {
      // null session
      const nullResult = deriveCockpitState({
        appointmentStatus,
        session: null,
      });
      expect(ALL_STATES).toContain(nullResult);

      // Each session status × each modality
      for (const sessionStatus of sessionStatuses) {
        for (const modality of [
          "text",
          "voice",
          "video",
        ] as CockpitSessionSummary["modality"][]) {
          const session = makeSession({
            status: sessionStatus,
            modality,
            provider_session_id: modality === "text" ? null : "RM_x",
          });
          const result = deriveCockpitState({ appointmentStatus, session });
          expect(ALL_STATES).toContain(result);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: canSendPrescription
// ---------------------------------------------------------------------------

describe("canSendPrescription", () => {
  it("returns true for `live`, `wrap_up`, and `ended`; false otherwise", () => {
    expect(canSendPrescription("ready")).toBe(false);
    expect(canSendPrescription("lobby")).toBe(false);
    expect(canSendPrescription("live")).toBe(true);
    expect(canSendPrescription("wrap_up")).toBe(true);
    expect(canSendPrescription("ended")).toBe(true);
    expect(canSendPrescription("terminal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper: canEditPrescriptionDraft
// ---------------------------------------------------------------------------

describe("canEditPrescriptionDraft", () => {
  it("returns true for `ready`, `lobby`, `live`, `wrap_up`; false for `ended` and `terminal`", () => {
    expect(canEditPrescriptionDraft("ready")).toBe(true);
    expect(canEditPrescriptionDraft("lobby")).toBe(true);
    expect(canEditPrescriptionDraft("live")).toBe(true);
    expect(canEditPrescriptionDraft("wrap_up")).toBe(true);
    expect(canEditPrescriptionDraft("ended")).toBe(false);
    expect(canEditPrescriptionDraft("terminal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper: shouldShowChartRail
// ---------------------------------------------------------------------------

describe("shouldShowChartRail", () => {
  it("returns false for every state when hasPatientId=false (walk-in)", () => {
    for (const state of ALL_STATES) {
      expect(shouldShowChartRail(state, false)).toBe(false);
    }
  });

  it("returns true for every state when hasPatientId=true", () => {
    for (const state of ALL_STATES) {
      expect(shouldShowChartRail(state, true)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: primaryCtaFor
// ---------------------------------------------------------------------------

describe("primaryCtaFor", () => {
  const MODALITIES: Array<CockpitConsultationModality | null | undefined> = [
    "text",
    "voice",
    "video",
    "in_clinic",
    null,
    undefined,
  ];

  it("ready → { label: 'Start consult', action: 'start' }", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("ready", m)).toEqual({
        label: "Start consult",
        action: "start",
      });
    }
  });

  it("lobby → { label: 'Resend join link', action: 'resend' }", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("lobby", m)).toEqual({
        label: "Resend join link",
        action: "resend",
      });
    }
  });

  it("live → { label: 'End consult', action: 'end' }", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("live", m)).toEqual({
        label: "End consult",
        action: "end",
      });
    }
  });

  it("wrap_up → { label: 'Done with patient', action: 'wrap-up' }", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("wrap_up", m)).toEqual({
        label: "Done with patient",
        action: "wrap-up",
      });
    }
  });

  it("ended → null (CP-D4: no follow-up-Rx CTA)", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("ended", m)).toBeNull();
    }
  });

  it("terminal → { label: 'Reschedule', action: 'reschedule' }", () => {
    for (const m of MODALITIES) {
      expect(primaryCtaFor("terminal", m)).toEqual({
        label: "Reschedule",
        action: "reschedule",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: shouldMountLauncher
// ---------------------------------------------------------------------------

describe("shouldMountLauncher", () => {
  it("returns true only for `ready`", () => {
    expect(shouldMountLauncher("ready")).toBe(true);
    expect(shouldMountLauncher("lobby")).toBe(false);
    expect(shouldMountLauncher("live")).toBe(false);
    expect(shouldMountLauncher("wrap_up")).toBe(false);
    expect(shouldMountLauncher("ended")).toBe(false);
    expect(shouldMountLauncher("terminal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapStateToTemplate — truth-table coverage (tmr-02)
// ---------------------------------------------------------------------------

describe("mapStateToTemplate", () => {
  const cases: Array<{
    state: CockpitState;
    modality: CockpitConsultationModality | null | undefined;
    override: CockpitTemplateOverride;
    expected: CockpitTemplate;
  }> = [
    { state: "ready", modality: "video", override: null, expected: "telemed-video" },
    { state: "ready", modality: "voice", override: null, expected: "telemed-voice" },
    { state: "ready", modality: "text", override: null, expected: "telemed-text" },
    { state: "ready", modality: "in_clinic", override: null, expected: "telemed-video" },
    { state: "lobby", modality: "video", override: null, expected: "telemed-video" },
    { state: "lobby", modality: "voice", override: null, expected: "telemed-voice" },
    { state: "live", modality: "text", override: null, expected: "telemed-text" },
    { state: "live", modality: "video", override: null, expected: "telemed-video" },
    { state: "wrap_up", modality: "voice", override: null, expected: "telemed-voice" },
    { state: "wrap_up", modality: "video", override: null, expected: "telemed-video" },
    { state: "ended", modality: "video", override: null, expected: "review" },
    { state: "ended", modality: "voice", override: null, expected: "review" },
    { state: "terminal", modality: "video", override: null, expected: "review" },
    { state: "terminal", modality: "text", override: null, expected: "review" },
    { state: "ready", modality: "video", override: "review", expected: "review" },
    { state: "ready", modality: "voice", override: "telemed-text", expected: "telemed-text" },
    { state: "live", modality: "text", override: "telemed-video", expected: "telemed-video" },
    { state: "ended", modality: "video", override: "telemed-voice", expected: "telemed-voice" },
    { state: "ready", modality: null, override: null, expected: "telemed-video" },
    { state: "ready", modality: undefined, override: null, expected: "telemed-video" },
  ];

  it.each(cases)(
    "$state × $modality × override=$override → $expected",
    ({ state, modality, override, expected }) => {
      expect(mapStateToTemplate(state, modality, override)).toBe(expected);
    },
  );
});
