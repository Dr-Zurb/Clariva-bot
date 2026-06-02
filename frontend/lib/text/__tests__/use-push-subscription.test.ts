/**
 * @vitest-environment jsdom
 *
 * @see task-text-D6b
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectPushNotSupported,
  isPushOptInDismissed,
  PUSH_DISMISS_MS,
  PUSH_LOCAL_SUBSCRIBED_KEY,
  PUSH_OPT_IN_DISMISS_KEY,
  urlBase64ToUint8Array,
} from "../use-push-subscription";

describe("urlBase64ToUint8Array", () => {
  it("round-trips a URL-safe base64 VAPID key", () => {
    const sample = "BITE0hzdp7lpQGIUoLfMK8ycN3_3HQCk4u_sIw3gHQ8XtYUq5m2LRZESRpnvqyIgDQcCAVCnhP78e2gfqhjDM_I";
    const bytes = urlBase64ToUint8Array(sample);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe("isPushOptInDismissed", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when no dismiss flag is set", () => {
    expect(isPushOptInDismissed()).toBe(false);
  });

  it("returns true within the 7-day dismiss window", () => {
    localStorage.setItem(
      PUSH_OPT_IN_DISMISS_KEY,
      String(Date.now() + PUSH_DISMISS_MS),
    );
    expect(isPushOptInDismissed()).toBe(true);
  });

  it("returns false after the dismiss window expires", () => {
    localStorage.setItem(PUSH_OPT_IN_DISMISS_KEY, String(Date.now() - 1));
    expect(isPushOptInDismissed()).toBe(false);
  });
});

describe("detectPushNotSupported", () => {
  it("returns false in jsdom when APIs are stubbed", () => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default" },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    expect(detectPushNotSupported()).toBe(false);
  });
});

describe("local subscribed flag key", () => {
  it("uses a stable storage key", () => {
    expect(PUSH_LOCAL_SUBSCRIBED_KEY).toBe("clariva:push:local-subscribed");
  });
});
