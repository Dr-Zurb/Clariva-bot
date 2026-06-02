/**
 * Unit tests for text-A3 send button state derivation.
 */

import { describe, expect, it } from "vitest";
import { deriveSendButtonState } from "../TextConsultRoom";

describe("deriveSendButtonState", () => {
  it("returns disabled-too-long when over cap", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "hello",
        sending: false,
        connection: "online",
        charCountOverCap: true,
      }),
    ).toBe("disabled-too-long");
  });

  it("returns sending when in flight", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "hello",
        sending: true,
        connection: "online",
        charCountOverCap: false,
      }),
    ).toBe("sending");
  });

  it("returns idle when composer empty and no attachments", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "",
        sending: false,
        connection: "online",
        charCountOverCap: false,
      }),
    ).toBe("idle");
  });

  it("returns ready when attachments queued without text", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "",
        sending: false,
        connection: "online",
        charCountOverCap: false,
        hasAttachments: true,
      }),
    ).toBe("ready");
  });

  it("returns queued when offline or reconnecting with text", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "hi",
        sending: false,
        connection: "offline",
        charCountOverCap: false,
      }),
    ).toBe("queued");
    expect(
      deriveSendButtonState({
        composerTrim: "hi",
        sending: false,
        connection: "reconnecting",
        charCountOverCap: false,
      }),
    ).toBe("queued");
  });

  it("returns ready when online with text", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "hi",
        sending: false,
        connection: "online",
        charCountOverCap: false,
      }),
    ).toBe("ready");
  });

  it("prioritizes char cap over sending", () => {
    expect(
      deriveSendButtonState({
        composerTrim: "hi",
        sending: true,
        connection: "online",
        charCountOverCap: true,
      }),
    ).toBe("disabled-too-long");
  });

  describe("text-D5 rate-limited branch", () => {
    it("returns rate-limited when capped and the composer has payload", () => {
      expect(
        deriveSendButtonState({
          composerTrim: "hi",
          sending: false,
          connection: "online",
          charCountOverCap: false,
          rateLimited: true,
        }),
      ).toBe("rate-limited");
    });

    it("does NOT show rate-limited on an empty composer (idle wins)", () => {
      expect(
        deriveSendButtonState({
          composerTrim: "",
          sending: false,
          connection: "online",
          charCountOverCap: false,
          hasAttachments: false,
          rateLimited: true,
        }),
      ).toBe("idle");
    });

    it("char-cap still wins over rate-limited (UX: most actionable hint first)", () => {
      expect(
        deriveSendButtonState({
          composerTrim: "hi",
          sending: false,
          connection: "online",
          charCountOverCap: true,
          rateLimited: true,
        }),
      ).toBe("disabled-too-long");
    });

    it("sending in-flight still wins over rate-limited", () => {
      expect(
        deriveSendButtonState({
          composerTrim: "hi",
          sending: true,
          connection: "online",
          charCountOverCap: false,
          rateLimited: true,
        }),
      ).toBe("sending");
    });

    it("rate-limited wins over queued (rate-limit gates even when offline)", () => {
      expect(
        deriveSendButtonState({
          composerTrim: "hi",
          sending: false,
          connection: "offline",
          charCountOverCap: false,
          rateLimited: true,
        }),
      ).toBe("rate-limited");
    });
  });
});
