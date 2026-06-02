import { describe, expect, it } from "vitest";
import { formatSystemMessageBody } from "./format-system-message";

describe("formatSystemMessageBody", () => {
  it("rewrites mute_changed to self copy when actor_id matches", () => {
    const text = formatSystemMessageBody({
      body: "Dr. Sharma muted their microphone",
      systemEvent: "mute_changed",
      metadata: {
        actor_id: "user-1",
        actor_role: "doctor",
        actor_name: "Dr. Sharma",
        muted: true,
      },
      currentUserId: "user-1",
    });
    expect(text).toBe("You muted your microphone");
  });

  it("keeps third-person copy for the counterparty", () => {
    const text = formatSystemMessageBody({
      body: "Patient unmuted their microphone",
      systemEvent: "mute_changed",
      metadata: {
        actor_id: "patient-1",
        actor_role: "patient",
        actor_name: "Patient",
        muted: false,
      },
      currentUserId: "doctor-1",
    });
    expect(text).toBe("Patient unmuted their microphone");
  });

  it("rewrites hold_changed to self copy when actor_id matches", () => {
    const text = formatSystemMessageBody({
      body: "Dr. Sharma put the call on hold",
      systemEvent: "hold_changed",
      metadata: {
        actor_id: "user-1",
        actor_role: "doctor",
        actor_name: "Dr. Sharma",
        on_hold: true,
      },
      currentUserId: "user-1",
    });
    expect(text).toBe("You put the call on hold");
  });

  it("keeps third-person hold copy for the counterparty", () => {
    const text = formatSystemMessageBody({
      body: "Patient resumed the call",
      systemEvent: "hold_changed",
      metadata: {
        actor_id: "patient-1",
        actor_role: "patient",
        actor_name: "Patient",
        on_hold: false,
      },
      currentUserId: "doctor-1",
    });
    expect(text).toBe("Patient resumed the call");
  });

  it("passes through non-mute system rows unchanged", () => {
    expect(
      formatSystemMessageBody({
        body: "Consultation started at 10:00",
        systemEvent: "consult_started",
        currentUserId: "x",
      }),
    ).toBe("Consultation started at 10:00");
  });
});
