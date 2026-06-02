/**
 * @vitest-environment jsdom
 *
 * @see task-text-D6c
 */

import { describe, expect, it } from "vitest";

import { shouldSuppressWebPush } from "../push-suppression";

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("shouldSuppressWebPush", () => {
  it("suppresses text push when the text consult tab is focused", () => {
    const clients = [
      {
        focused: true,
        url: `https://app.clariva.health/c/text/${SESSION_ID}?t=abc`,
      },
    ];
    expect(
      shouldSuppressWebPush(clients, {
        data: {
          sessionId: SESSION_ID,
          deeplink: `/c/text/${SESSION_ID}`,
        },
      }),
    ).toBe(true);
  });

  it("does not suppress text push when only the voice tab is focused", () => {
    const clients = [
      {
        focused: true,
        url: `https://app.clariva.health/c/voice/${SESSION_ID}`,
      },
    ];
    expect(
      shouldSuppressWebPush(clients, {
        data: {
          sessionId: SESSION_ID,
          deeplink: `/c/text/${SESSION_ID}`,
        },
      }),
    ).toBe(false);
  });

  it("does not suppress when the matching tab exists but is not focused", () => {
    const clients = [
      {
        focused: false,
        url: `https://app.clariva.health/c/text/${SESSION_ID}`,
      },
    ];
    expect(
      shouldSuppressWebPush(clients, {
        data: {
          sessionId: SESSION_ID,
          deeplink: `/c/text/${SESSION_ID}`,
        },
      }),
    ).toBe(false);
  });

  it("falls back to sessionId-only match when deeplink is absent", () => {
    const clients = [
      {
        focused: true,
        url: `https://app.clariva.health/c/voice/${SESSION_ID}`,
      },
    ];
    expect(
      shouldSuppressWebPush(clients, {
        data: { sessionId: SESSION_ID },
      }),
    ).toBe(true);
  });
});
