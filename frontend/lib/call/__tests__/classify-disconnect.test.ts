/**
 * Unit tests for `frontend/lib/call/classify-disconnect.ts`
 * (shared by video B5 + voice A9).
 */

import { classifyDisconnect } from "../classify-disconnect";

const NOW = new Date("2026-05-20T12:00:00.000Z");

describe("classifyDisconnect", () => {
  it("returns local when the user explicitly ended the call", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: true,
          remoteEndedFirst: true,
          twilioError: { code: 53001 },
        },
        NOW,
      ),
    ).toBe("local");
  });

  it("returns token_expired when tokenExpiredAt is in the past", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          tokenExpiredAt: new Date("2026-05-20T11:59:00.000Z"),
        },
        NOW,
      ),
    ).toBe("token_expired");
  });

  it("returns token_expired for Twilio access-token error codes", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          twilioError: { code: 20104, message: "Access Token expired" },
        },
        NOW,
      ),
    ).toBe("token_expired");
  });

  it("returns connection_lost for Twilio signaling/media error codes", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          twilioError: { code: 53001 },
        },
        NOW,
      ),
    ).toBe("connection_lost");
  });

  it("returns remote when the counterparty left first", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          remoteEndedFirst: true,
        },
        NOW,
      ),
    ).toBe("remote");
  });

  it("returns timeout when sessionStatus is ended", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          sessionStatus: "ended",
        },
        NOW,
      ),
    ).toBe("timeout");
  });

  it("returns unknown when no specific signal matches", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
        },
        NOW,
      ),
    ).toBe("unknown");
  });

  it("prefers local over remoteEndedFirst", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: true,
          remoteEndedFirst: true,
        },
        NOW,
      ),
    ).toBe("local");
  });

  it("prefers token_expired over connection_lost when both apply", () => {
    expect(
      classifyDisconnect(
        {
          ourLocalEndCalled: false,
          tokenExpiredAt: new Date("2026-05-20T11:00:00.000Z"),
          twilioError: { code: 53001 },
        },
        NOW,
      ),
    ).toBe("token_expired");
  });
});
