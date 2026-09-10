/**
 * rec-23 matrix — client `deriveStateFromRows` kind parity with the
 * server table. Same fixtures as
 * `backend/tests/unit/services/recording-escalation-derive-state.test.ts`.
 *
 * A stop row must never raise `attemptsUsed` or produce `max_attempts`.
 */

import { describe, expect, it } from "vitest";
import {
  deriveStateFromRows,
  videoEscalationRequestsLeftCopy,
  type EscalationDeriveRow,
} from "@/hooks/useVideoEscalationState";

const T0 = Date.parse("2026-08-20T10:00:00.000Z");
const MIN = 60_000;
const FIVE_MIN = 5 * MIN;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function row(
  overrides: Partial<EscalationDeriveRow> & Pick<EscalationDeriveRow, "id">,
): EscalationDeriveRow {
  return {
    patient_response: null,
    requested_at:     iso(T0),
    revoked_at:       null,
    revoke_reason:    null,
    initiated_by:     "doctor",
    ...overrides,
  };
}

const CASES: Array<{
  id: string;
  rows: EscalationDeriveRow[];
  nowMs: number;
  kind: ReturnType<typeof deriveStateFromRows>["kind"];
}> = [
  { id: "1",  rows: [], nowMs: T0, kind: "idle" },
  { id: "2",  rows: [row({ id: "p" })], nowMs: T0 + 30_000, kind: "requesting" },
  { id: "3",  rows: [row({ id: "p" })], nowMs: T0 + 61_000, kind: "requesting" },
  {
    id: "4",
    rows: [row({ id: "d", patient_response: "decline" })],
    nowMs: T0 + 2 * MIN,
    kind: "cooldown",
  },
  {
    id: "5",
    rows: [row({ id: "d", patient_response: "decline" })],
    nowMs: T0 + FIVE_MIN,
    kind: "idle",
  },
  {
    id: "6",
    rows: [row({ id: "t", patient_response: "timeout" })],
    nowMs: T0 + 2 * MIN,
    kind: "cooldown",
  },
  {
    id: "7",
    rows: [row({ id: "t", patient_response: "timeout" })],
    nowMs: T0 + FIVE_MIN,
    kind: "idle",
  },
  {
    id: "8",
    rows: [row({ id: "a", patient_response: "allow" })],
    nowMs: T0 + 5_000,
    kind: "locked",
  },
  {
    id: "9",
    rows: [row({ id: "a", patient_response: "allow" })],
    nowMs: T0 + 5_000,
    kind: "locked",
  },
  {
    id: "10",
    rows: [
      row({
        id: "s",
        patient_response: "allow",
        revoked_at: iso(T0 + 10_000),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 20_000,
    kind: "cooldown",
  },
  {
    id: "11",
    rows: [
      row({
        id: "s",
        patient_response: "allow",
        revoked_at: iso(T0 + 10_000),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 40_000,
    kind: "idle",
  },
  {
    id: "12",
    rows: [
      row({
        id: "s",
        patient_response: "allow",
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + FIVE_MIN,
    kind: "idle",
  },
  {
    id: "13",
    rows: [
      row({
        id: "e",
        patient_response: "allow",
        revoked_at: iso(T0 + MIN),
        revoke_reason: "grant_expired",
      }),
    ],
    nowMs: T0 + MIN + 5_000,
    kind: "cooldown",
  },
  {
    id: "14",
    rows: [
      row({
        id: "e",
        patient_response: "allow",
        revoked_at: iso(T0 + MIN),
        revoke_reason: "grant_expired",
      }),
    ],
    nowMs: T0 + MIN + 30_000,
    kind: "idle",
  },
  {
    id: "15",
    rows: [
      row({ id: "d2", patient_response: "decline", requested_at: iso(T0 + MIN) }),
      row({ id: "d1", patient_response: "decline", requested_at: iso(T0) }),
    ],
    nowMs: T0 + MIN + 10_000,
    kind: "locked",
  },
  {
    id: "16",
    rows: [
      row({ id: "d", patient_response: "decline", requested_at: iso(T0 + 2 * MIN) }),
      row({
        id: "s",
        patient_response: "allow",
        requested_at: iso(T0),
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 3 * MIN,
    kind: "cooldown",
  },
  {
    id: "17a",
    rows: [
      row({
        id: "s",
        patient_response: "allow",
        requested_at: iso(T0 + 2 * MIN),
        revoked_at: iso(T0 + 3 * MIN),
        revoke_reason: "patient_revoked",
      }),
      row({ id: "d", patient_response: "decline", requested_at: iso(T0) }),
    ],
    nowMs: T0 + 3 * MIN + 5_000,
    kind: "cooldown",
  },
  {
    id: "17b",
    rows: [
      row({
        id: "s",
        patient_response: "allow",
        requested_at: iso(T0 + 2 * MIN),
        revoked_at: iso(T0 + 3 * MIN),
        revoke_reason: "patient_revoked",
      }),
      row({ id: "d", patient_response: "decline", requested_at: iso(T0) }),
    ],
    nowMs: T0 + 3 * MIN + 30_000,
    kind: "idle",
  },
  {
    id: "18",
    rows: [
      row({
        id: "s2",
        patient_response: "allow",
        requested_at: iso(T0 + 2 * MIN),
        revoked_at: iso(T0 + 3 * MIN),
        revoke_reason: "patient_revoked",
      }),
      row({
        id: "s1",
        patient_response: "allow",
        requested_at: iso(T0),
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 3 * MIN + 30_000,
    kind: "idle",
  },
  {
    id: "19",
    rows: [
      row({ id: "p", requested_at: iso(T0 + 2 * MIN) }),
      row({
        id: "s",
        patient_response: "allow",
        requested_at: iso(T0),
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 2 * MIN + 5_000,
    kind: "requesting",
  },
  {
    id: "20",
    rows: [
      row({
        id: "off",
        patient_response: "allow",
        initiated_by: "patient",
      }),
    ],
    nowMs: T0 + 5_000,
    kind: "locked",
  },
  {
    id: "21",
    rows: [
      row({ id: "d", patient_response: "decline", requested_at: iso(T0 + 2 * MIN) }),
      row({
        id: "off",
        patient_response: "allow",
        initiated_by: "patient",
        requested_at: iso(T0),
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 3 * MIN,
    kind: "cooldown",
  },
  {
    id: "22",
    rows: [
      row({
        id: "s3",
        patient_response: "allow",
        requested_at: iso(T0 + 4 * MIN),
        revoked_at: iso(T0 + 5 * MIN),
        revoke_reason: "patient_revoked",
      }),
      row({
        id: "s2",
        patient_response: "allow",
        requested_at: iso(T0 + 2 * MIN),
        revoked_at: iso(T0 + 3 * MIN),
        revoke_reason: "patient_revoked",
      }),
      row({
        id: "s1",
        patient_response: "allow",
        requested_at: iso(T0),
        revoked_at: iso(T0 + MIN),
        revoke_reason: "patient_revoked",
      }),
    ],
    nowMs: T0 + 5 * MIN + 30_000,
    kind: "idle",
  },
];

describe("deriveStateFromRows — rec-23 kind parity", () => {
  it.each(CASES)("matrix $id → $kind", ({ rows, nowMs, kind }) => {
    expect(deriveStateFromRows(rows, nowMs).kind).toBe(kind);
  });

  it("a lone stop never raises attemptsUsed or produces max_attempts", () => {
    const stop = row({
      id: "s",
      patient_response: "allow",
      revoked_at: iso(T0 + 10_000),
      revoke_reason: "patient_revoked",
    });
    const during = deriveStateFromRows([stop], T0 + 20_000);
    const after = deriveStateFromRows([stop], T0 + 40_000);
    expect(during.kind === "locked" && during.reason === "max_attempts").toBe(false);
    expect(after.kind === "locked" && after.reason === "max_attempts").toBe(false);
    if (during.kind === "cooldown" || during.kind === "idle") {
      expect(during.attemptsUsed).toBe(0);
    }
    if (after.kind === "cooldown" || after.kind === "idle") {
      expect(after.attemptsUsed).toBe(0);
    }
  });
});

describe("deriveStateFromRows — rec-22 grant fields", () => {
  it("carries grant expiry and extension-spent on an active allow", () => {
    const state = deriveStateFromRows(
      [
        row({
          id: "a",
          patient_response: "allow",
          grant_expires_at: iso(T0 + 120_000),
          grant_extended_at: iso(T0),
        }),
      ],
      T0,
    );
    expect(state).toMatchObject({
      kind: "locked",
      reason: "already_recording_video",
      grantExpiresAt: iso(T0 + 120_000),
      extensionSpent: true,
    });
  });

  it("marks a paused grant without unlocking", () => {
    const state = deriveStateFromRows(
      [
        row({
          id: "a",
          patient_response: "allow",
          video_paused_at: iso(T0),
        }),
      ],
      T0,
    );
    expect(state).toMatchObject({
      kind: "locked",
      reason: "already_recording_video",
      videoPaused: true,
    });
  });
});

describe("videoEscalationRequestsLeftCopy", () => {
  it("does not say no requests left when used is 0", () => {
    expect(videoEscalationRequestsLeftCopy(0)).toBe("2 requests left this consult.");
    expect(videoEscalationRequestsLeftCopy(1)).toBe("1 request left this consult.");
    expect(videoEscalationRequestsLeftCopy(2)).toBe("No requests left this consult.");
  });
});
