# Task text-C2: Image lightbox with pinch-zoom (full-screen + prev/next + swipe-down dismiss)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today, tapping an image attachment in chat opens it in a small modal or new tab — neither lets the user actually inspect the photo. Doctors looking at a rash, an X-ray, or a med label need to:
- See the photo at full screen (black backdrop, no chrome).
- Pinch-zoom on mobile / wheel-zoom on desktop.
- Swipe-down to dismiss (mobile) / Esc (desktop).
- Arrow / swipe-left-right between all images in the chat.

This task ships an `<ImageLightbox>` component that consumes the array of all `kind='attachment'` messages with image MIME (filtered from `messages`), opens to a specific one, and supports prev / next / dismiss.

**Estimated time:** ~6 hours.

**Status:** Done (2026-05-24).

**Depends on:** None hard. Soft-dep on [task-text-B8](./task-text-B8-multi-attachment-composer.md) (multi-attachment batches benefit most from prev/next).

**Source plan:** [T6 §T6.39](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **`<ImageLightbox>` new component** at `frontend/components/consultation/ImageLightbox.tsx`:
  ```ts
  interface ImageLightboxProps {
    images: { src: string; alt: string; messageId: string }[];
    initialIndex: number;
    onClose: () => void;
  }
  ```
  Renders into a portal at `document.body`. Black backdrop covers viewport.
- [x] **Pinch-zoom on mobile.** Two-finger pinch gestures scale the image up to 8x. Use `touch-action: pinch-zoom` CSS; prefer browser-native handling over a JS library to keep dependencies tiny. If browser-native isn't responsive enough on the chosen targets, fall back to a small library (recommendation: `react-zoom-pan-pinch`; only if browser-native fails).
- [x] **Wheel-zoom on desktop** — `onWheel` with `e.deltaY` adjusts a scale state; clamp 1x–8x. `Cmd/Ctrl + 0` resets to 1x.
- [x] **Pan when zoomed** — touch drag on mobile / mouse drag on desktop translates the image. When at scale = 1, pan is disabled (so swipe-down dismiss works).
- [x] **Swipe-down dismiss (mobile)** — when scale = 1 and a vertical drag exceeds 100 px downward (with low horizontal delta), close. Animate the image sliding out.
- [x] **Esc dismiss (desktop)** — keydown handler on the lightbox.
- [x] **Prev / Next** — left/right arrow keys (desktop), tap arrows in corners (always-visible), swipe left/right on the image when scale = 1 (mobile). Wraps around (last → first).
- [x] **Counter** — small "3 / 7" indicator in the top-right corner.
- [x] **Dismiss button** — `×` in top-left corner; calls `onClose`.
- [x] **Trigger from `<MessageBubble>` and `<MessageBatch>`** — both gain an `onOpenLightbox(messageId)` callback prop. Parent (`<TextConsultRoom>`) computes the images list (filtered + sorted) and the initial index from messageId at the moment the user taps.
- [x] **Memory** — never copy image bytes; render via `<img src={signedUrl}>`. The signed URL is the same one already used by the existing single-attachment viewer.
- [x] **Three-host parity** — opens full-screen in all layouts (portals to body).
- [x] **`mode='readonly'`** — fully functional (history view especially benefits).
- [x] **Accessibility** — `role="dialog"` `aria-modal="true"` `aria-label="Image viewer"`. Trap focus; restore focus to the trigger element on close.
- [x] **PHI hygiene** — no logging of image src or signed URL beyond what the existing attachment viewer already does.
- [x] Frontend type-check + lint clean. Manual smoke (mobile): open a chat with 5 image attachments; tap the 3rd; lightbox opens at index 2; pinch-zoom works smoothly; swipe left → 4th image; swipe down → dismiss. (Desktop): same with arrow keys + Esc + wheel-zoom.

---

## Out of scope

- **PDF lightbox.** PDFs render in the OS-native viewer; not in scope.
- **Image annotations / draw-on-image.** Out of scope.
- **Image rotation in viewer.** Out of scope.
- **Slideshow auto-advance.** Out of scope.
- **Image download from lightbox.** The OS native long-press (mobile) / right-click (desktop) on the image already offers Save; no in-app download button.
- **Cross-session image gallery** ("see all images from previous consults"). Out of scope; T4 territory.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/ImageLightbox.tsx` — **new** (~150 LOC).
- `frontend/components/consultation/MessageBubble.tsx` — **edit** (image-attachment tap → call `onOpenLightbox(messageId)`).
- `frontend/components/consultation/MessageBatch.tsx` — **edit** (B8) — same wiring.
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (`lightboxState: { images, index } | null`; `openLightbox(messageId)` derivation; render `<ImageLightbox>` at portal target).
- `frontend/lib/text/image-lightbox-images.ts` — **new** helper to filter/sort chat image attachments.
- `frontend/lib/text/__tests__/image-lightbox-images.test.ts` — **new** unit tests.
- `frontend/components/consultation/__tests__/ImageLightbox.test.tsx` — **new** interaction tests.

**Optional new dep (only if browser-native pinch-zoom is insufficient):**

- `react-zoom-pan-pinch` (~10 KB gzipped). Add via `package.json`; document in PR. **Not added** — hand-rolled pinch + wheel zoom shipped instead.

**No backend, no schema.**

---

## Notes / open decisions

1. **Browser-native pinch-zoom vs library** — try CSS-only first (`touch-action: pinch-zoom; user-scalable: yes`). Many recent Chromes / Safaris handle this gracefully without JS. Library only if user-testing flags lag.
2. **Swipe-down threshold** — 100 px dismiss is the WhatsApp default; tweak if users complain about accidental dismisses.
3. **Initial scale** — fit-to-screen, not 1:1 actual-pixels. Use `object-fit: contain` on the image.
4. **Counter visibility** — only show when `images.length > 1`; for single-image lightbox, hide.
5. **`signedUrl` lifetime** — Supabase signed URLs are typically 1-hour TTL; a long-running lightbox session might outlive the URL. If observed, refresh on next-image navigation.
6. **Animation** — fade-in 200 ms on open, slide-out 200 ms on swipe-down dismiss. Keep simple; don't reach for a spring-physics library.
7. **Focus trap** — small hand-roll is fine; no need for `focus-trap-react` if existing modals don't already use it.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.39](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Wires from:** [task-text-B8](./task-text-B8-multi-attachment-composer.md) (multi-attachment grids tap into the lightbox).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
