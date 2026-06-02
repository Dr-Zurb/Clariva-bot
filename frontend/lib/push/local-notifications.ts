/**
 * Local in-tab browser notifications (task-text-D7).
 *
 * Fires `new Notification(...)` from the open consult tab when it is hidden
 * and the patient has not opted into D6 Web Push. Complements server push
 * without requiring PushManager subscription.
 */

import { hasActiveWebPushSubscription } from "@/lib/push/web-push-subscribe";

export const LOCAL_NOTIF_PROMPT_SNOOZE_PREFIX = "notif-prompt-snooze-";
export const LOCAL_NOTIF_PROMPT_DISMISS_PREFIX = "notif-prompt-dismissed-";
export const LOCAL_NOTIF_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type ConsultRoomMode = "live" | "readonly";

export interface FireLocalNotificationOptions {
  title: string;
  body: string;
  sessionId: string;
  messageId: string;
  sender: string;
  mode?: ConsultRoomMode;
}

let permissionRequestInFlight: Promise<NotificationPermission> | null = null;
let navigateFn: ((path: string) => void) | null = null;

/** Wire Next.js (or other) client navigation for notification click deeplinks. */
export function configureLocalNotificationNavigation(
  navigate: (path: string) => void,
): void {
  navigateFn = navigate;
}

/** Clears navigation hook on unmount (TextConsultRoom cleanup). */
export function clearLocalNotificationNavigation(): void {
  navigateFn = null;
}

/**
 * Wraps `Notification.requestPermission()` with a single-call guard so the
 * consent prompt cannot spam parallel permission dialogs.
 */
export async function requestLocalNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission !== "default") {
    return Notification.permission;
  }
  if (permissionRequestInFlight) {
    return permissionRequestInFlight;
  }
  permissionRequestInFlight = Notification.requestPermission().finally(() => {
    permissionRequestInFlight = null;
  });
  return permissionRequestInFlight;
}

export function localNotifPromptSnoozeKey(sessionId: string): string {
  return `${LOCAL_NOTIF_PROMPT_SNOOZE_PREFIX}${sessionId}`;
}

export function localNotifPromptDismissKey(sessionId: string): string {
  return `${LOCAL_NOTIF_PROMPT_DISMISS_PREFIX}${sessionId}`;
}

export function isLocalNotifPromptSnoozed(
  sessionId: string,
  nowMs = Date.now(),
): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(localNotifPromptSnoozeKey(sessionId)) || 0);
  return until > nowMs;
}

export function isLocalNotifPromptDismissed(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(localNotifPromptDismissKey(sessionId)) === "1";
}

export function snoozeLocalNotifPrompt(sessionId: string, nowMs = Date.now()): void {
  window.localStorage.setItem(
    localNotifPromptSnoozeKey(sessionId),
    String(nowMs + LOCAL_NOTIF_SNOOZE_MS),
  );
}

export function dismissLocalNotifPrompt(sessionId: string): void {
  window.localStorage.setItem(localNotifPromptDismissKey(sessionId), "1");
}

function textConsultDeeplink(sessionId: string): string {
  return `/c/text/${sessionId}`;
}

function isOnTextConsultRoute(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes(textConsultDeeplink(sessionId));
}

// TODO(T3.24): consolidate into shared PHI redactor when AI clinical assist lands.
export function redactPhi(text: string): string {
  let out = text;
  // Card before Aadhaar — both are digit groups; 16-digit cards must not partial-match Aadhaar.
  out = out.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[card redacted]");
  out = out.replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[Aadhaar redacted]");
  out = out.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[PAN redacted]");
  out = out.replace(/\+91[\s-]*[6-9]\d{9}/g, "[phone redacted]");
  out = out.replace(/\b[6-9]\d{9}\b/g, "[phone redacted]");
  if (out.length > 140) {
    return `${out.slice(0, 137)}...`;
  }
  return out;
}

/**
 * Fires a local OS notification when the consult tab is open but hidden.
 * Call sites stay dumb — suppression lives here.
 */
export function fireLocalNotification({
  title,
  body,
  sessionId,
  messageId,
  mode = "live",
}: FireLocalNotificationOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (mode === "readonly") return;
  if (Notification.permission !== "granted") return;

  const deeplink = textConsultDeeplink(sessionId);
  if (document.visibilityState === "visible" && isOnTextConsultRoute(sessionId)) {
    return;
  }
  if (hasActiveWebPushSubscription(sessionId)) return;

  const redactedBody = redactPhi(body);
  const notification = new Notification(title, {
    body: redactedBody,
    tag: sessionId,
    icon: "/icons/icon-192.png",
    data: { sessionId, messageId, deeplink },
  });

  notification.onclick = () => {
    window.focus();
    if (navigateFn) {
      navigateFn(deeplink);
    } else {
      window.location.assign(deeplink);
    }
    notification.close();
  };
}
