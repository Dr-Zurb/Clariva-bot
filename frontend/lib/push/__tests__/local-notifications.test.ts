/**
 * @vitest-environment jsdom
 *
 * @see task-text-D7
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureLocalNotificationNavigation,
  clearLocalNotificationNavigation,
  fireLocalNotification,
  redactPhi,
  requestLocalNotificationPermission,
} from "../local-notifications";

const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PUSH_LOCAL_SUBSCRIBED_KEY = "clariva:push:local-subscribed";

describe("redactPhi", () => {
  it("leaves benign text unchanged", () => {
    expect(redactPhi("Hello doctor, my headache is better.")).toBe(
      "Hello doctor, my headache is better.",
    );
  });

  it("redacts spaced Aadhaar numbers", () => {
    expect(redactPhi("My id is 1234 5678 9012 please verify")).toBe(
      "My id is [Aadhaar redacted] please verify",
    );
  });

  it("redacts compact Aadhaar numbers", () => {
    expect(redactPhi("Aadhaar:123456789012 end")).toBe("Aadhaar:[Aadhaar redacted] end");
  });

  it("redacts PAN", () => {
    expect(redactPhi("PAN ABCDE1234F on file")).toBe("PAN [PAN redacted] on file");
  });

  it("redacts 10-digit Indian mobile numbers", () => {
    expect(redactPhi("Call me at 9876543210 tomorrow")).toBe("Call me at [phone redacted] tomorrow");
  });

  it("redacts +91 prefixed phone numbers", () => {
    expect(redactPhi("Reach +91 9876543210 soon")).toBe("Reach [phone redacted] soon");
  });

  it("redacts card numbers with spaces", () => {
    expect(redactPhi("Card 4111 1111 1111 1111 expired")).toBe(
      "Card [card redacted] expired",
    );
  });

  it("redacts card numbers with dashes", () => {
    expect(redactPhi("Card 4111-1111-1111-1111")).toBe("Card [card redacted]");
  });

  it("redacts multiple PHI patterns in one string", () => {
    const input = "PAN ABCDE1234F phone 9876543210";
    expect(redactPhi(input)).toBe("PAN [PAN redacted] phone [phone redacted]");
  });

  it("handles edge whitespace around PHI", () => {
    expect(redactPhi("  1234 5678 9012  ")).toBe("  [Aadhaar redacted]  ");
  });

  it("truncates after redaction at 140 characters", () => {
    const long = `${"safe ".repeat(24)}9876543210 tail`;
    const out = redactPhi(long);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith("...")).toBe(true);
    expect(out).toContain("[phone redacted]");
  });

  it("redacts adjacent PHI tokens separated by whitespace", () => {
    expect(redactPhi("9876543210 ABCDE1234F")).toBe("[phone redacted] [PAN redacted]");
  });
});

describe("requestLocalNotificationPermission", () => {
  beforeEach(() => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns granted without re-prompting when already granted", async () => {
    Object.assign(globalThis.Notification, { permission: "granted" });
    await expect(requestLocalNotificationPermission()).resolves.toBe("granted");
    expect(globalThis.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("dedupes concurrent permission requests", async () => {
    let resolvePermission: (value: NotificationPermission) => void = () => {};
    const pending = new Promise<NotificationPermission>((resolve) => {
      resolvePermission = resolve;
    });
    vi.mocked(globalThis.Notification.requestPermission).mockReturnValue(pending);

    const first = requestLocalNotificationPermission();
    const second = requestLocalNotificationPermission();

    resolvePermission("granted");
    await expect(Promise.all([first, second])).resolves.toEqual(["granted", "granted"]);
    expect(globalThis.Notification.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("fireLocalNotification", () => {
  const NotificationMock = vi.fn(function NotificationMock(
    this: { onclick: (() => void) | null },
    title: string,
    options?: NotificationOptions,
  ) {
    this.onclick = null;
    return { title, options, close: vi.fn() };
  });

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("Notification", NotificationMock);
    Object.assign(globalThis.Notification, { permission: "granted" });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    window.history.pushState({}, "", `/c/text/${SESSION_ID}`);
  });

  afterEach(() => {
    clearLocalNotificationNavigation();
    vi.unstubAllGlobals();
  });

  it("bails when permission is not granted", () => {
    Object.assign(globalThis.Notification, { permission: "default" });
    fireLocalNotification({
      title: "Dr",
      body: "Hi",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
    });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("bails in readonly mode", () => {
    fireLocalNotification({
      title: "Dr",
      body: "Hi",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
      mode: "readonly",
    });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("suppresses when tab is visible on the consult route", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireLocalNotification({
      title: "Dr",
      body: "Hi",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
    });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("suppresses when D6 Web Push subscription is active", () => {
    localStorage.setItem(PUSH_LOCAL_SUBSCRIBED_KEY, "1");
    fireLocalNotification({
      title: "Dr",
      body: "Hi",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
    });
    expect(NotificationMock).not.toHaveBeenCalled();
  });

  it("fires a redacted notification when tab is hidden", () => {
    fireLocalNotification({
      title: "Dr Patel",
      body: "Call 9876543210",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
    });
    expect(NotificationMock).toHaveBeenCalledWith("Dr Patel", {
      body: "Call [phone redacted]",
      tag: SESSION_ID,
      icon: "/icons/icon-192.png",
      data: {
        sessionId: SESSION_ID,
        messageId: "msg-1",
        deeplink: `/c/text/${SESSION_ID}`,
      },
    });
  });

  it("navigates via configured router on click", () => {
    const navigate = vi.fn();
    configureLocalNotificationNavigation(navigate);

    fireLocalNotification({
      title: "Dr",
      body: "Hi",
      sessionId: SESSION_ID,
      messageId: "msg-1",
      sender: "doctor",
    });

    const instance = NotificationMock.mock.instances[0] as { onclick: (() => void) | null };
    instance.onclick?.();
    expect(navigate).toHaveBeenCalledWith(`/c/text/${SESSION_ID}`);
  });
});
