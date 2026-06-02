/**
 * Sub-batch B · task-video-B7 — Picture-in-Picture capability + in-app
 * browser detection helpers.
 *
 * Pure module. No React, no Twilio. Lives next to other call helpers
 * (`actor-avatar.ts`, `classify-disconnect.ts`) so the doctrine of
 * "renderer-side decisions live as pure modules" is preserved. The
 * hook (`usePictureInPicture`) consumes these; voice could too if
 * a future "Voice + companion-document PiP" surface materializes.
 *
 * Decision §8 — hide the PiP button entirely on unsupported browsers
 * (cleaner UX than show + warn). The capability check is intentionally
 * permissive about WHAT counts as "supported" but strict about the
 * known-broken cases:
 *
 *   - Safari pre-iOS-14, mobile Safari without `pictureInPictureEnabled`,
 *     and embedded webviews (Instagram, Facebook, Twitter, LinkedIn,
 *     etc.) — these are flagged unsupported.
 *   - Everything else (Chrome desktop, Edge, Chrome Android, modern
 *     iOS Safari) is assumed supported; the actual `requestPictureInPicture`
 *     call will reject with a meaningful error if the browser still
 *     denies it (e.g. user-gesture missing). The hook surfaces that
 *     rejection as a toast — see hook header.
 *
 * The detection is best-effort. The cost of a false-positive is a
 * disabled button that does nothing on click; the cost of a
 * false-negative is a missing button. Per decision §8, we'd rather
 * miss the button than show a useless one.
 */

/**
 * In-app browser user-agent fragments. These are the webviews that
 * disable Picture-in-Picture entirely (or embed a webview that
 * intercepts `requestPictureInPicture` without forwarding to a
 * usable surface). The list is conservative — adding a fragment
 * removes the PiP button for those users; missing one means
 * showing a button that errors on click.
 *
 * Sources:
 *   - Instagram in-app browser: `Instagram` token in UA.
 *   - Facebook in-app browser:  `FBAN` (app name) / `FBAV` (app version).
 *   - Messenger in-app browser: `FB_IAB`.
 *   - Twitter/X in-app browser: `Twitter` token in UA.
 *   - LinkedIn in-app browser:  `LinkedInApp` token in UA.
 *   - Snapchat in-app browser:  `Snapchat` token in UA.
 *   - Threads in-app browser:   `Threads` token in UA.
 *   - WeChat in-app browser:    `MicroMessenger` token in UA.
 *   - TikTok in-app browser:    `BytedanceWebview` / `Musical_ly` /
 *                               `Bytedance` tokens in UA.
 */
const IN_APP_BROWSER_FRAGMENTS: ReadonlyArray<string> = [
  "Instagram",
  "FBAN",
  "FBAV",
  "FB_IAB",
  "Twitter",
  "LinkedInApp",
  "Snapchat",
  "Threads",
  "MicroMessenger",
  "BytedanceWebview",
  "Musical_ly",
  "Bytedance",
];

/**
 * Detect known in-app browser webviews. Pure function on a UA
 * string so the unit-testable surface stays trivial.
 *
 * Exported so the hook can short-circuit AND so any future call
 * site (post-call summary D1, voice B5, etc.) can reuse the same
 * heuristic without re-importing the fragment list.
 */
export function isInAppBrowser(userAgent?: string | null): boolean {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return false;
  return IN_APP_BROWSER_FRAGMENTS.some((fragment) => ua.includes(fragment));
}

/**
 * Capability check — returns `true` only when the browser exposes
 * the W3C Picture-in-Picture API AND the document has it enabled
 * AND the UA isn't a known-broken in-app webview.
 *
 * Three layered gates:
 *
 *   1. `'pictureInPictureEnabled' in document` — feature-detect
 *      the API surface itself. False on Safari < iOS 14, on the
 *      Wayback machine archive of every Firefox build pre-PiP, etc.
 *   2. `document.pictureInPictureEnabled` — runtime flag. The
 *      browser CAN expose the API but disable it (e.g. via
 *      enterprise policy, kiosk mode, or `<meta>` opt-out). When
 *      this is `false`, requestPictureInPicture() always rejects.
 *   3. `!isInAppBrowser(navigator.userAgent)` — the in-app webview
 *      check. These browsers technically expose `pictureInPictureEnabled`
 *      but reject the request OR, worse, succeed silently without
 *      actually opening a PiP window (Instagram's webview is the
 *      historical offender). Better to hide the button.
 *
 * SSR-safe — returns `false` when `document` or `navigator` is
 * undefined. The hook is mounted client-side only (`"use client"`)
 * so this is a defensive guard, not the primary code path.
 */
export function isPictureInPictureSupported(): boolean {
  if (typeof document === "undefined") return false;
  if (!("pictureInPictureEnabled" in document)) return false;
  // The cast keeps TS happy on stricter `lib` settings where
  // `Document.pictureInPictureEnabled` may not be in the lib.
  if (!(document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled) {
    return false;
  }
  if (typeof navigator !== "undefined" && isInAppBrowser(navigator.userAgent)) {
    return false;
  }
  return true;
}
