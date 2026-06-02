"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deletePushSubscription,
  listPushSubscriptions,
  subscribePushSubscription,
} from "@/lib/api";

export type PushPermissionState = "default" | "granted" | "denied";

export const PUSH_LOCAL_SUBSCRIBED_KEY = "clariva:push:local-subscribed";
export const PUSH_OPT_IN_DISMISS_KEY = "clariva:push:opt-in-dismissed-until";
/** Doctor dashboard opt-in (voice-C3) — separate from patient text consult dismiss. */
export const DOCTOR_PUSH_OPT_IN_DISMISS_KEY = "clariva:push:doctor-opt-in-dismissed-until";
export const PUSH_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export interface UsePushSubscriptionOptions {
  accessToken: string;
  enabled?: boolean;
  /** localStorage key for "Not now" snooze; defaults to patient text consult key. */
  dismissStorageKey?: string;
}

export interface UsePushSubscriptionResult {
  permission: PushPermissionState;
  subscribed: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  notSupported: boolean;
  isDismissed: boolean;
  dismissOptIn: () => void;
}

/** Converts a URL-safe base64 VAPID public key to Uint8Array for PushManager. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function readPermission(): PushPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  return Notification.permission;
}

function readLocalSubscribed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PUSH_LOCAL_SUBSCRIBED_KEY) === "1";
}

export function isPushOptInDismissed(
  dismissStorageKey = PUSH_OPT_IN_DISMISS_KEY,
  nowMs = Date.now(),
): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(dismissStorageKey) || 0);
  return until > nowMs;
}

export function detectPushNotSupported(): boolean {
  if (typeof window === "undefined") return true;
  return (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  );
}

export function usePushSubscription({
  accessToken,
  enabled = true,
  dismissStorageKey = PUSH_OPT_IN_DISMISS_KEY,
}: UsePushSubscriptionOptions): UsePushSubscriptionResult {
  const notSupported = useMemo(() => detectPushNotSupported(), []);
  const [permission, setPermission] = useState<PushPermissionState>(() => readPermission());
  const [subscribed, setSubscribed] = useState<boolean>(() => readLocalSubscribed());
  const [backendSubscriptionId, setBackendSubscriptionId] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() =>
    isPushOptInDismissed(dismissStorageKey),
  );

  useEffect(() => {
    if (!enabled || notSupported || !accessToken.trim()) return;
    let cancelled = false;

    void listPushSubscriptions(accessToken)
      .then((rows) => {
        if (cancelled) return;
        const active = rows[0]?.id ?? null;
        setBackendSubscriptionId(active);
        const local = readLocalSubscribed();
        setSubscribed(Boolean(active) || local);
      })
      .catch(() => {
        // Best-effort — local flag still drives UI.
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, notSupported]);

  const subscribe = useCallback(async () => {
    if (notSupported || !enabled) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublicKey) {
      throw new Error("Web Push is not configured on this deployment");
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dhKey = json.keys?.p256dh;
    const authKey = json.keys?.auth;
    if (!endpoint || !p256dhKey || !authKey) {
      throw new Error("Push subscription keys missing from browser");
    }

    const result = await subscribePushSubscription(accessToken, {
      endpoint,
      p256dhKey,
      authKey,
      userAgent: navigator.userAgent,
    });

    window.localStorage.setItem(PUSH_LOCAL_SUBSCRIBED_KEY, "1");
    setBackendSubscriptionId(result.id);
    setSubscribed(true);
  }, [accessToken, enabled, notSupported]);

  const unsubscribe = useCallback(async () => {
    if (notSupported) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }

    if (backendSubscriptionId && accessToken.trim()) {
      try {
        await deletePushSubscription(accessToken, backendSubscriptionId);
      } catch {
        // Local SW unsubscribe still counts — backend row may already be revoked.
      }
    }

    window.localStorage.removeItem(PUSH_LOCAL_SUBSCRIBED_KEY);
    setBackendSubscriptionId(null);
    setSubscribed(false);
  }, [accessToken, backendSubscriptionId, notSupported]);

  const dismissOptIn = useCallback(() => {
    window.localStorage.setItem(
      dismissStorageKey,
      String(Date.now() + PUSH_DISMISS_MS),
    );
    setIsDismissed(true);
  }, [dismissStorageKey]);

  return {
    permission,
    subscribed,
    subscribe,
    unsubscribe,
    notSupported,
    isDismissed,
    dismissOptIn,
  };
}
