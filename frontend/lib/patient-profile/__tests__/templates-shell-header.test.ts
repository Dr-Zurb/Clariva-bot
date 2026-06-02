import { describe, expect, it } from "vitest";
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
  type TelemedVideoContext,
} from "../templates";

function fixtureCtx(
  overrides: Partial<TelemedVideoContext> = {},
): TelemedVideoContext {
  return {
    appointment: {
      id: "appt-1",
      doctor_id: "doc-1",
      patient_id: "pat-1",
      patient_name: "Test Patient",
      patient_phone: null,
      patient_age: null,
      patient_sex: null,
      appointment_date: "2026-05-14T10:00:00Z",
      status: "confirmed",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      consultation_session: null,
    },
    token: "test-token",
    state: "live",
    ...overrides,
  };
}

describe("templates · column-shell headers (csl-01)", () => {
  for (const [name, getter] of [
    ["video", getTelemedVideoTemplate],
    ["voice", getTelemedVoiceTemplate],
    ["text", getTelemedTextTemplate],
  ] as const) {
    it(`hides shell header on every column root for ${name}`, () => {
      const tree = getter(fixtureCtx());
      const ids = ["left-column", "middle-column", "right-column"];
      for (const id of ids) {
        const node = tree.find((n) => n.id === id);
        expect(node, `${id} missing`).toBeTruthy();
        expect(node!.hideShellHeader, `${id} hideShellHeader`).toBe(true);
      }
    });
  }
});
