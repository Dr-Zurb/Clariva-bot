/* eslint-disable no-restricted-globals */

/**
 * Service worker for Clariva consult PWA — first revision.
 *
 * Sub-batch F · task-video-F3 / voice C10 — bears the foundation
 * for the persistent foreground notification path that keeps a
 * voice or video call alive when the patient swipes the PWA away.
 *
 * Capabilities:
 *
 *   1. **Foreground call notification** — `useCallMediaSession`
 *      posts `'show-call-notification'` when the page enters
 *      `visibilitychange === 'hidden'` and `'hide-call-notification'`
 *      when it returns to visible (or when the call ends). The SW
 *      pins a `requireInteraction: true` notification keyed by
 *      `tag: call:${sessionId}` so it can't be swiped away while
 *      the call is active and Android keeps the tab process alive.
 *
 *   2. **Notification actions** — `mute` / `end` actions in the
 *      pinned notification post a message back to the controlling
 *      client so the in-app handlers (mute toggle / leave room)
 *      run with the same code path as a tap inside the UI. This
 *      is the only safe way to mutate Twilio Room state from the
 *      SW — the room object lives in the page's JS context, not
 *      in the SW.
 *
 *   3. **Notification click** — focus the existing client (so the
 *      Twilio Room state is preserved) or open a new window at
 *      the deeplink the page provided. The deeplink defaults to
 *      `window.location.href` at notification-show time so we
 *      don't have to know the route shape (`/c/voice/[sessionId]`
 *      vs `/c/video-invite/[token]` vs future surfaces).
 *
 * Out of scope for v1 (deferred per F.3 + voice C10 specs):
 *
 *   - **Push subscription** for backend-driven notifications (text
 *     consult D6b — push + notificationclick handlers below).
 *   - No general caching strategies — no offline support; leaving the
 *     page open is still required for the call.
 *
 * Lifecycle discipline:
 *   - `install` → `skipWaiting()` so the new SW activates as soon
 *     as it's installed (vs waiting for all tabs to close —
 *     critical because a long call would otherwise pin an old SW).
 *   - `activate` → `clients.claim()` so the new SW takes over the
 *     existing tab without a reload (matches the skipWaiting
 *     intent).
 *
 * text-C7 — share-target POST intercept (see fetch handler below).
 * OS share sheet POSTs multipart files to `/c/share-target`; we
 * stage in Cache API and 303-redirect to the GET handler in the
 * Next app.
 */

const SW_VERSION = "v4-2026-05-24-d6c";
const SHARE_TARGET_CACHE = "share-target-staging-v1";
const SHARE_TARGET_STALE_MS = 30 * 60 * 1000;

self.addEventListener("install", () => {
  // Skip the waiting phase so this SW becomes active immediately.
  // The previous SW (if any) is replaced on the next activate
  // event. Combined with `clients.claim()` below, the upgrade is
  // seamless for the user — no reload required.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any existing clients (open tabs) so the new
  // SW handles their messages right away. Without this the old
  // SW would keep running until every tab closed.
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await purgeStaleShareTargetEntries();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Web Push handler (task-text-D6b + D6c active-tab suppression)
//
// Suppression logic mirrored in frontend/lib/sw/push-suppression.ts — keep in sync.
// Trade-off: focused consult tab + locked screen → no OS notification.
// Cross-modality: match payload.data.deeplink so voice tab does NOT suppress text push.
// Bump SW_VERSION when this handler changes (install → skipWaiting → claim).
// ---------------------------------------------------------------------------

function shouldSuppressWebPush(clients, payload) {
  const deeplink = payload.data?.deeplink?.trim?.() || payload.data?.deeplink;
  const sessionId = payload.data?.sessionId?.trim?.() || payload.data?.sessionId;

  if (deeplink) {
    return clients.some((client) => client.focused && client.url.includes(deeplink));
  }
  if (sessionId) {
    return clients.some((client) => client.focused && client.url.includes(String(sessionId)));
  }
  return false;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (shouldSuppressWebPush(wins, payload)) return;

      await self.registration.showNotification(payload.title || "Clariva", {
        body: payload.body || "",
        icon: payload.icon || "/icons/icon-192.png",
        badge: payload.badge || "/icons/badge-72.png",
        tag: payload.tag,
        renotify: true,
        data: payload.data || {},
      });
    })(),
  );
});

// ---------------------------------------------------------------------------
// Share-target POST intercept (text-C7)
//
// Android installed PWA: OS share sheet POSTs multipart/form-data to
// `/c/share-target`. We stash files in Cache API and 303-redirect to the
// GET route with cache keys in the query string (spec requirement).
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "POST") return;
  let pathname = "";
  try {
    pathname = new URL(event.request.url).pathname;
  } catch {
    return;
  }
  if (pathname !== "/c/share-target") return;
  event.respondWith(handleShareTarget(event));
});

async function handleShareTarget(event) {
  const formData = await event.request.formData();
  const files = formData.getAll("files");
  const cache = await caches.open(SHARE_TARGET_CACHE);
  const stagedKeys = [];
  const stagedAt = String(Date.now());

  for (const file of files) {
    if (!(file instanceof File)) continue;
    const key = `share-target-${crypto.randomUUID()}`;
    await cache.put(
      key,
      new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Staged-At": stagedAt,
        },
      }),
    );
    stagedKeys.push(key);
  }

  const redirectUrl = new URL("/c/share-target", self.location.origin);
  if (stagedKeys.length > 0) {
    redirectUrl.searchParams.set("keys", stagedKeys.join(","));
  }
  return Response.redirect(redirectUrl.href, 303);
}

async function purgeStaleShareTargetEntries() {
  try {
    const cache = await caches.open(SHARE_TARGET_CACHE);
    const keys = await cache.keys();
    const cutoff = Date.now() - SHARE_TARGET_STALE_MS;
    await Promise.all(
      keys.map(async (request) => {
        const key = request.url;
        if (!key.includes("share-target-")) return;
        const response = await cache.match(request);
        if (!response) {
          await cache.delete(request);
          return;
        }
        const stagedAt = Number(response.headers.get("X-Staged-At") || 0);
        if (!stagedAt || stagedAt < cutoff) {
          await cache.delete(request);
        }
      }),
    );
  } catch {
    // Non-fatal — stale entries are bounded by browser cache quota.
  }
}

// ---------------------------------------------------------------------------
// Message handlers
//
// Two messages from the page:
//
//   {
//     type: "show-call-notification",
//     sessionId: string,        // tag suffix; one notif per session
//     callerName: string,       // shown as title
//     modality: "voice" | "video",
//     deeplink: string,         // window.location.href at the time
//     isMuted?: boolean,        // affects "mute" action label
//     isOnHold?: boolean,       // affects "mute" action availability
//   }
//
//   {
//     type: "hide-call-notification",
//     sessionId: string,
//   }
//
// We deliberately accept multiple show-calls for the same session
// (the browser dedupes via `tag`); this lets the page update the
// notification copy when mute / hold state changes mid-call.
// ---------------------------------------------------------------------------

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "show-call-notification") {
    const sessionId = String(data.sessionId || "");
    const callerName = String(data.callerName || "");
    const modality = data.modality === "video" ? "video" : "voice";
    const deeplink = String(data.deeplink || "/");
    const isMuted = Boolean(data.isMuted);
    const isOnHold = Boolean(data.isOnHold);
    if (!sessionId) return;

    const title =
      modality === "video"
        ? `Video consult with ${callerName || "your doctor"}`
        : `Voice consult with ${callerName || "your doctor"}`;
    const body = isOnHold
      ? "Call paused — tap to return"
      : isMuted
        ? "Microphone muted — tap to return"
        : "Tap to return to the call";

    const actions = [
      // Decision §14 from voice C10 — pause / mute action label
      // toggles based on current state so the user knows what
      // they're getting. (Browsers may not honour custom action
      // icons on every OEM, but the title is universal.)
      {
        action: "mute",
        title: isMuted ? "Unmute" : "Mute",
      },
      {
        action: "end",
        title: "End call",
      },
    ];

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag: `call:${sessionId}`,
        // requireInteraction keeps the notification pinned in the
        // tray (Android Chrome) instead of auto-dismissing after
        // a few seconds. Combined with `silent: true` (the call
        // IS the audio — we don't want a chime) this gives the
        // "ongoing call" feel that the OS treats as priority.
        requireInteraction: true,
        silent: true,
        renotify: false,
        actions,
        // `data` is what we get back inside the notificationclick
        // handler — store the deeplink + session info there so we
        // can route taps without keeping a side-table in memory
        // (SWs can be killed and revived between events).
        data: {
          sessionId,
          deeplink,
          modality,
        },
      }),
    );
    return;
  }

  if (data.type === "hide-call-notification") {
    const sessionId = String(data.sessionId || "");
    if (!sessionId) return;
    event.waitUntil(
      self.registration
        .getNotifications({ tag: `call:${sessionId}` })
        .then((notifs) => {
          notifs.forEach((notif) => notif.close());
        }),
    );
    return;
  }
});

// ---------------------------------------------------------------------------
// Notification click handler
//
// Two paths:
//
//   - User tapped a notification ACTION (`mute` / `end`) → route the
//     intent back to the controlling client via postMessage so the
//     in-app handlers (Twilio Room mute / disconnect) run there.
//     This is the only safe way to mutate the call state from the
//     SW — the Room object lives in the page JS context.
//
//   - User tapped the notification BODY (no action) → focus the
//     existing client if one is open, or open the deeplink in a
//     new window. Always close the notification on either path
//     (the page owns its own re-show via visibilitychange).
// ---------------------------------------------------------------------------

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "";
  const data = event.notification.data || {};
  const sessionId = String(data.sessionId || "");
  const deeplink = String(data.deeplink || "/");
  const isCallNotification = event.notification.tag?.startsWith("call:");

  event.notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Web Push deeplink path (non-call notifications).
      const pushSessionId = String(data.sessionId || "");
      if (!isCallNotification && !action) {
        const openTarget =
          deeplink && deeplink !== "/"
            ? deeplink
            : pushSessionId
              ? `/dashboard/consult/${pushSessionId}`
              : null;
        if (openTarget) {
          const existing = allClients.find((c) =>
            pushSessionId
              ? c.url.includes(pushSessionId)
              : c.url.includes(openTarget),
          );
          if (existing && "focus" in existing) {
            try {
              await existing.focus();
              return;
            } catch {
              /* fall through */
            }
          }
          if (self.clients.openWindow) {
            const absolute =
              openTarget.startsWith("http") || openTarget.startsWith("/")
                ? new URL(openTarget, self.location.origin).href
                : openTarget;
            await self.clients.openWindow(absolute);
          }
          return;
        }
      }

      const matchByUrl = allClients.find((c) => c.url.includes(sessionId));
      const target = matchByUrl || allClients[0] || null;

      if (action === "mute" || action === "end") {
        if (target) {
          target.postMessage({
            type: "call-notification-action",
            action,
            sessionId,
          });
          if ("focus" in target) {
            try {
              await target.focus();
            } catch {
              /* focus rejection is non-fatal */
            }
          }
        }
        return;
      }

      if (target && "focus" in target) {
        try {
          await target.focus();
          return;
        } catch {
          /* fall through to openWindow */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(deeplink);
      }
    })(),
  );
});

// ---------------------------------------------------------------------------
// Notification close (user dismissed)
//
// `requireInteraction: true` makes a swipe-away unusual on Android
// (the user has to actively dismiss). When it does happen, we
// don't try to re-show — the page's visibilitychange listener
// will re-post on the next visibility transition. This keeps the
// SW idle when not needed.
// ---------------------------------------------------------------------------

self.addEventListener("notificationclose", () => {
  // No-op for v1. A future enhancement could telemetry-log
  // dismiss events so we know which OEMs honour requireInteraction
  // vs which let users dismiss freely.
});

// Surface a small handle for debugging from DevTools — `await
// navigator.serviceWorker.controller.postMessage({type:"version"})`
// then read the reply via `navigator.serviceWorker.addEventListener('message', ...)`.
self.addEventListener("message", (event) => {
  if (event.data?.type === "version" && event.source) {
    event.source.postMessage({ type: "version", version: SW_VERSION });
  }
});
