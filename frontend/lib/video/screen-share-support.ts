/**
 * Sub-batch C · task-video-C5 — Screen-share capability detection.
 *
 * Pure module. No React, no Twilio. Lives next to `virtual-background.ts`
 * (C2) and the call-side capability helpers (`pip-support.ts` from B7,
 * `actor-avatar.ts` from B2) so the doctrine of "renderer-side
 * decisions live as pure modules" is preserved.
 *
 * `navigator.mediaDevices.getDisplayMedia` is supported on:
 *   - Chrome desktop (≥ 72)
 *   - Edge (≥ 79)
 *   - Firefox desktop (≥ 66)
 *   - Safari desktop (≥ 13)
 *   - Chrome Android (≥ 70 — but only since 78 is it usable for
 *     ALL surfaces; Chrome 70-77 only allow tab capture)
 *   - **NOT supported** on iOS Safari at all (any version, any
 *     iPad / iPhone). The API is feature-detected as `undefined`
 *     on iOS, so the `typeof` check below correctly hides the button.
 *
 * Decision §15 (per task file Notes/Open decisions): hide the
 * Share button entirely on unsupported browsers — same precedent
 * as B7's PiP button (decision §8) and B6's Sidebar layout option.
 * Cleaner UX than "show + warn / fail".
 *
 * The detection is a single-call check at component mount; PiP
 * support doesn't change across a session lifetime, and neither
 * does `getDisplayMedia`. SSR-safe — returns `false` when
 * `navigator` is undefined (the consumers are `"use client"` so
 * this is a defensive guard, not the primary code path).
 */

/**
 * Heuristic for "is this an iOS device" — used as the EXTRA gate
 * on top of the `getDisplayMedia` feature check, because some
 * iOS Safari builds expose a stub `getDisplayMedia` that always
 * rejects with `NotAllowedError` (worse than absent — the user
 * would see a permission popup that immediately fails). The
 * extra gate hides the button on those builds too.
 *
 * Pattern matches:
 *   - `iPhone` / `iPad` / `iPod` in user-agent (classic).
 *   - `Macintosh` + `MaxTouchPoints > 0` covers iPadOS 13+ which
 *     reports as desktop Safari but still has the iOS PiP/screen
 *     constraints (Apple's "iPad-as-Mac" UA quirk). We can't
 *     read MaxTouchPoints in pure UA-string mode, so we accept
 *     the false-positive of hiding screen-share on a real Mac
 *     trackpad — actually, no: we ONLY check classic iOS strings
 *     here. iPadOS-as-Mac users get the false-positive of the
 *     button showing + the Twilio call rejecting; that's
 *     acceptable for a v1.
 */
const IOS_USER_AGENT_FRAGMENTS: ReadonlyArray<string> = [
  "iPhone",
  "iPad",
  "iPod",
];

/**
 * Pure UA-string heuristic for "this is an iOS device that
 * cannot screen-share." Exported so future call sites (a
 * hypothetical voice screen-share, or a snapshot capture C3
 * sibling) can reuse the same negative gate.
 */
export function isIOSUserAgent(userAgent?: string | null): boolean {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return false;
  return IOS_USER_AGENT_FRAGMENTS.some((fragment) => ua.includes(fragment));
}

/**
 * Capability check — returns `true` only when the browser
 * exposes `navigator.mediaDevices.getDisplayMedia` AND the
 * device isn't a known-broken iOS build.
 *
 * Three layered gates:
 *
 *   1. `typeof navigator.mediaDevices !== 'undefined'` — required
 *      to even reach `.getDisplayMedia`. Some embedded webviews
 *      (older Android WebView builds) don't expose `mediaDevices`
 *      at all.
 *   2. `typeof navigator.mediaDevices.getDisplayMedia === 'function'` —
 *      the actual feature check. False on iOS Safari (the
 *      method is undefined).
 *   3. `!isIOSUserAgent(navigator.userAgent)` — the iOS belt-
 *      and-braces. Some iOS-Chrome / iOS-Edge / iOS-Firefox
 *      builds use a WebKit shell that exposes a stub
 *      `getDisplayMedia` that always rejects; treating the
 *      iOS userAgent as a hard "no" hides the button on those
 *      builds too.
 *
 * SSR-safe — returns `false` when `navigator` is undefined.
 */
export function isScreenShareSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const md = (navigator as Navigator & {
    mediaDevices?: MediaDevices & {
      getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
    };
  }).mediaDevices;
  if (!md) return false;
  if (typeof md.getDisplayMedia !== "function") return false;
  if (isIOSUserAgent(navigator.userAgent)) return false;
  return true;
}
