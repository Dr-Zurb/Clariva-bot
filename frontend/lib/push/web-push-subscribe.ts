/**
 * Web Push subscription client cache (task-text-D6b).
 *
 * `hasActiveWebPushSubscription` is consumed by task-text-D7 local notification
 * suppression so patients don't get duplicate OS banners when D6 is active.
 */

import { PUSH_LOCAL_SUBSCRIBED_KEY } from "@/lib/text/use-push-subscription";

/**
 * Returns true when the user has an active server-side Web Push subscription
 * recorded in the D6b client cache. Session id is reserved for future
 * per-session scoping; v1 subscriptions are user-scoped.
 */
export function hasActiveWebPushSubscription(_sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PUSH_LOCAL_SUBSCRIBED_KEY) === "1";
}
