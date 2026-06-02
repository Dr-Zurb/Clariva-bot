# Text T6 — Mobile-native niceties (7 items, ~9 days)

## Swipe-to-reply, long-press reactions, image lightbox, dictation, share-intent — make the chat feel native on phones

> **Roadmap reference:** [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md). T6 is the final slice; defer until at least T1 + T2 have shipped.
>
> **Foundation:** [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md) (chat baseline) + the existing PWA shell (manifest + service worker; assumes T5.31/32 push has shipped or is concurrent).

---

## Goal

Ship seven items that close the "feels native on a phone" gap: gesture-based reply, long-press to react, hardware-keyboard shortcuts, image lightbox with pinch-zoom, voice-to-text dictation in composer, polished camera-direct attach, and PWA share-intent receive. Three of these are pure-frontend gestures; one needs a small PWA manifest change; none need backend or schema work.

The stretch goal of this tier: a patient on Android Chrome installed-as-PWA should not be able to tell, through 30 seconds of normal use, that the chat isn't a native app.

---

## Status

`Drafted`. **All 7 items SELECTED 2026-04-28** for the implementation batch tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md). T6 maps to Sub-batch C — pure frontend, soft-blocks on T2 / Sub-batch B (swipe-to-reply needs reply-to-message; long-press needs reactions; hardware shortcuts need edit-mode).

---

## What's in scope (7 items)

> All 7 items below are marked **`[SELECTED 2026-04-28]`** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) for sequencing into Sub-batch C (after Sub-batch B's T2 items land).

| # | Item | Effort | Dep | Touch points |
|---|------|--------|-----|--------------|
| T6.36 | **`[SELECTED 2026-04-28]`** **Swipe-to-reply gesture.** Touch-drag a message bubble right ~60 px → triggers reply mode (T2.10). Spring-back animation if released early. WhatsApp pattern. | M (~5h) | T2.10 | `<MessageBubble>` touch handlers; new `frontend/lib/gestures/use-swipe-to-reply.ts`. |
| T6.37 | **`[SELECTED 2026-04-28]`** **Long-press for reactions.** Touch-and-hold (300 ms) on a bubble → opens `<ReactionPicker>` (T2.9) above. Vibrate-on-press for haptic feedback. | S (~3h) | T2.9 | `<MessageBubble>` touch handlers; existing `<ReactionPicker>`. |
| T6.38 | **`[SELECTED 2026-04-28]`** **Hardware-keyboard shortcuts.** Esc clears composer; Up arrow on empty composer enters edit-mode for last own message (T2.11); Cmd/Ctrl+Enter forces send even when chord-pickers etc. open. | S (~3h) | T2.11 | Composer keydown handler. |
| T6.39 | **`[SELECTED 2026-04-28]`** **Image lightbox with pinch-zoom.** Tap on an image attachment → full-screen lightbox; pinch to zoom; swipe down to dismiss; arrow-key / swipe to navigate to prev/next image in the same chat. | M (~6h) | None | New `<ImageLightbox>` component; `<MessageBubble>` attachment-image tap handler; image list pre-collected from messages. |
| T6.40 | **`[SELECTED 2026-04-28]`** **Voice-to-text dictation hint.** Composer mic icon → triggers Web Speech API `SpeechRecognition` (where supported — Android Chrome + iOS Safari 16+). Live-transcribes into composer. Hint shown on first focus. | M (~6h) | None | New `frontend/lib/speech/dictation.ts`; composer mic affordance; degrade to "use system keyboard mic" tooltip on unsupported. |
| T6.41 | **`[SELECTED 2026-04-28]`** **Camera-direct attachment polish.** Existing camera input (`cameraInputRef`, mobile-only) is functional but unpolished — the icon is small + picker is the OS default. Add: in-composer camera-button with preview before send, and an explicit "switch to gallery" toggle. | S (~4h) | None | `TextConsultRoom.tsx` composer camera button; reuses existing `cameraInputRef` capture flow. |
| T6.42 | **`[SELECTED 2026-04-28]`** **PWA share-intent receive.** Patient long-presses an image in their gallery → "Share" → "Clariva Chat" appears as a target → opens the chat with the image pre-filled in the composer. Manifest `share_target` API. | M (~6h) | None | `manifest.json` `share_target` entry; new route `/c/share-target` that handles the upload then routes to the active chat with the file in URL state; SW intercept for POST handler. |

---

## Non-goals (explicitly NOT in T6 — owned by other tiers / plans)

- **Native iOS / Android shell** — not in scope; the entire roadmap is PWA-first per Principle 8.
- **Background message arrival without notification** — that's T5.32 push.
- **Voice notes / audio attachments** — explicitly killed by the audio-MIME exclusion.
- **Doctor-side mobile gestures** — possible future tier, but doctors are primarily desktop today.
- **AR / camera live filters** — not warranted.

---

## Implementation contract per item

### T6.36 — Swipe-to-reply

```ts
// frontend/lib/gestures/use-swipe-to-reply.ts (NEW)

interface UseSwipeToReplyOptions {
  threshold?: number;               // default 60
  onTrigger: () => void;            // open reply mode
}

export function useSwipeToReply(opts: UseSwipeToReplyOptions): {
  bind: () => {                     // spread on the bubble
    onTouchStart: TouchEventHandler;
    onTouchMove: TouchEventHandler;
    onTouchEnd: TouchEventHandler;
  };
  translateX: number;               // animated transform value
  triggered: boolean;               // brief flash before onTrigger fires
};

// Behaviour:
//   - Track touch deltaX; clamp to [0, 120].
//   - Apply transform: translateX(deltaX) to the bubble; fade in a small
//     reply-icon at the leading edge (opacity = deltaX / threshold).
//   - On release:
//       deltaX >= threshold → fire onTrigger() + spring back to 0.
//       else                → spring back to 0 silently.
//   - Vertical drag (deltaY > 10) cancels the gesture (don't fight scroll).
//
// In <MessageBubble>: bind to the entire bubble. The bubble container
// already has the message context to pass to setComposerReplyTo (T2.10).
```

### T6.37 — Long-press for reactions

```ts
// In <MessageBubble> touch handlers:
//   onTouchStart: start a 300ms timer
//   onTouchMove: cancel the timer if move > 8px in any direction
//   onTouchEnd: cancel the timer
//   timer fires: navigator.vibrate?.(15) + open <ReactionPicker> above bubble
//
// Right-click (desktop) ALSO opens the picker — already in T2.9.
//
// Mobile-only: hide the existing T2.9 right-click affordance discovery hint
// on touch-only devices; long-press is the primary path.
```

### T6.38 — Hardware-keyboard shortcuts

```ts
// In TextConsultRoom composer onKeyDown:
//   - Esc: clear composer (preserve via T5.30 draft? no — Esc is "abandon")
//          actually: clear composer + clearDraft().
//   - ArrowUp on empty composer: find last own (sender_role === currentUserRole)
//     non-deleted, non-system message within T2.11's 60s edit window.
//     Enter edit mode for it.
//   - Cmd/Ctrl + Enter: force-send (bypasses T2.13 markdown-toolbar focus,
//     bypasses T3.19 slash-menu preview, bypasses T3.18 chip focus).
//
// Discoverability: the T1.2 keyboard hints get extended:
//   "Enter to send · Shift+Enter for newline · ↑ to edit · Esc to clear"
```

### T6.39 — Image lightbox

```tsx
// frontend/components/consultation/ImageLightbox.tsx (NEW)
//
// Props:
//   images: { url: string, mime: string, captionTime: string }[];
//   startIndex: number;
//   onClose: () => void;
//
// Behaviour:
//   - Full-screen black backdrop (rgba(0,0,0,0.95)).
//   - Image centred; pinch-zoom (CSS transform via touch handlers).
//   - Swipe horizontally → next/prev (loop).
//   - Swipe vertically down → dismiss with a fade.
//   - Esc / backdrop-tap → close.
//   - "Open original" CTA bottom-right (opens the signed URL in new tab).
//
// In <MessageBubble> for kind='attachment' image rows:
//   onClick → opens lightbox with the full image-attachment list pre-built
//   from messagesRef, jumped to the tapped one.
//
// PHI hygiene: images themselves are PHI; lightbox MUST NOT cache them
// to localStorage / IDB — only the in-memory blob URL.
```

### T6.40 — Voice-to-text dictation

```ts
// frontend/lib/speech/dictation.ts (NEW)
//
// Wraps Web Speech API:
//   const rec = new (window.SpeechRecognition ?? window.webkitSpeechRecognition)();
//   rec.continuous = true;
//   rec.interimResults = true;
//   rec.lang = userLocale;             // hi-IN / en-IN / ta-IN / etc.
//
// Hook:
//   const { supported, isListening, partial, start, stop } = useDictation(lang);
//
// Composer mic icon:
//   - Hidden on unsupported (supported === false → tooltip "Use the system
//     keyboard mic instead").
//   - Tap → start; tap again → stop.
//   - While listening: subtle red-pulse dot + partial text appended to
//     composer in italic gray (un-finalised).
//   - On finalise: italic text becomes regular composer text.
//
// PHI: partial transcripts are local-only — never sent anywhere.
// On stop, the composer text is just text — sent like any other message.
//
// Auto-stop after 30 s of silence to avoid runaway transcripts.
```

### T6.41 — Camera-direct attachment polish

```tsx
// In TextConsultRoom composer (mobile only — CSS @media):
//   <button onClick={() => cameraInputRef.current?.click()} aria-label="Take photo">
//     <CameraIcon />
//   </button>
//
// On camera-input change → instead of immediately uploading, mount an
// <AttachmentPreview> overlay:
//   - Image preview full-width.
//   - "Add caption" composer underneath (becomes message body).
//   - [Retake] [Use this photo]
//   - [Switch to gallery] → triggers the existing fileInputRef.click().
//
// Use this photo → flows through the existing T2.15 multi-attach send path.
```

### T6.42 — PWA share-intent receive

```jsonc
// frontend/public/manifest.json (extend):
{
  ...,
  "share_target": {
    "action": "/c/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text":  "text",
      "files": [
        { "name": "files", "accept": ["image/*", "application/pdf"] }
      ]
    }
  }
}
```

```ts
// New route: frontend/app/c/share-target/page.tsx
//
// Handles the POST from the OS share sheet.
//
// Flow:
//   1. Service worker intercepts the POST + stashes the file blob into
//      cache storage with a short-lived key.
//   2. SW responds with a redirect to /c/share-target?key=<...>.
//   3. Page reads the key, fetches the blob from cache, prompts:
//      "Send this photo to: [last active consultation]" or
//      [pick a different active consult].
//   4. Routes to /c/text/[sessionId] with the blob pre-loaded into the
//      attachment composer.
//
// "Active consultation" detection: localStorage token of the most-recent
// /c/text/* visit within the last 60 min. If none → "Open a consult first
// to share files."
```

---

## Acceptance criteria

- [ ] **T6.36** — swipe-right on bubble triggers reply at ~60 px; spring-back smooth; vertical scroll unimpeded; doctor side works on iPad.
- [ ] **T6.37** — 300 ms hold opens reaction picker; vibrate fires (where supported); cancelled by movement; doesn't fight native context menu (preventDefault correctly).
- [ ] **T6.38** — Esc / Up / Cmd+Enter shortcuts work; Up correctly enters edit mode only for own + recent + non-deleted messages; T1.2 hints updated.
- [ ] **T6.39** — lightbox opens on tap; pinch-zoom 1×–4×; swipe-down dismiss; nav between images works; no image leaks beyond the in-memory cache.
- [ ] **T6.40** — dictation works on Android Chrome (Hindi + English); fallback tooltip on iOS < 16.4; auto-stop after 30 s silence; partial text styled distinctly.
- [ ] **T6.41** — camera button visible on mobile only; preview-before-send works; "switch to gallery" round-trips to existing picker.
- [ ] **T6.42** — share-target appears in OS share sheet on Android (after PWA install); receives image, prompts, lands in active-consult composer; iOS Safari path documented as "share-target unsupported on iOS — falls back to chat-side camera/gallery".
- [ ] All gestures degrade gracefully on desktop (swipe handlers ignore mouse; long-press uses right-click).
- [ ] PHI hygiene: lightbox images never cached to disk; dictation partials never leave device.
- [ ] No regression on existing flow (T1 + T2 + T5 still work).
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke: Android Chrome + iOS Safari + desktop Chrome all exercise every applicable T6 item.

---

## Files expected to touch

**Frontend (only):**

- `frontend/components/consultation/TextConsultRoom.tsx` (**extend**) — keyboard shortcuts, camera button, attachment preview.
- `frontend/components/consultation/MessageBubble.tsx` (**extend**, T2 dep) — swipe + long-press handlers + lightbox tap.
- `frontend/components/consultation/ImageLightbox.tsx` (**new**, T6.39).
- `frontend/components/consultation/AttachmentPreview.tsx` (**new**, T6.41).
- `frontend/lib/gestures/use-swipe-to-reply.ts` (**new**, T6.36).
- `frontend/lib/gestures/use-long-press.ts` (**new**, T6.37 — generic, may be reused for non-chat surfaces).
- `frontend/lib/speech/dictation.ts` (**new**, T6.40).
- `frontend/public/manifest.json` (**extend**, T6.42) — `share_target` entry.
- `frontend/public/sw.js` (**extend**, T6.42) — POST intercept for share target.
- `frontend/app/c/share-target/page.tsx` (**new**, T6.42).

**No backend changes. No schema changes. No DM-copy changes.**

---

## Open questions / decisions for during implementation

1. **Swipe-to-reply direction** (T6.36) — right-swipe (WhatsApp) or left-swipe (Telegram)? Recommendation: right-swipe — matches WhatsApp's usage, which dominates the Indian patient demographic.
2. **Long-press duration** (T6.37) — 300 ms (snappy) vs 500 ms (forgiving). Recommendation: 300 ms; matches WhatsApp again.
3. **Dictation language source** (T6.40) — patient.locale, browser locale, or per-tap picker? Recommendation: patient.locale by default + a "Change language" link inside the dictating UI.
4. **Lightbox prefetching** (T6.39) — prefetch next/prev image when lightbox opens? Recommendation: yes; perceptibly snappier and the signed URLs are already in memory.
5. **Camera preview retake button** (T6.41) — do we keep the camera input mounted, or re-prompt? Recommendation: re-prompt on retake — simpler, OS-native.
6. **Share-target prompt UX** (T6.42) — "send to most-recent" vs "always pick consult". Recommendation: most-recent with a "different consult" link; matches the WhatsApp share UX patient is used to.
7. **Hardware-keyboard "Up to edit" scope** (T6.38) — own messages only, OR own + repliable? Recommendation: own only; editing someone else's is conceptually wrong.

---

## References

- [plan-00-text-consult-roadmap.md](./plan-00-text-consult-roadmap.md)
- [plan-04-text-consultation-supabase.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-04-text-consultation-supabase.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — three-host parity (most T6 items are mobile-only and CSS-gate themselves).
- T2 plan — swipe + long-press hard-depend on reactions + reply-to.
- [Voice T6 — Mobile native](../voice-consult/plan-t6-voice-mobile-native.md) — symmetric tier on the voice side; both share the PWA shell + manifest infra.
- Web Speech API — `SpeechRecognition` interface; Chrome + Safari 16.4+; not in Firefox.
- Web Share Target Level 2 spec — `share_target.method = "POST"` for file receive.

---

**Owner:** TBD  
**Created:** 2026-04-28  
**Status:** Drafted; **all 7 items SELECTED 2026-04-28** — implementation tracked in [plan-text-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md) (Sub-batch C; ships after Sub-batch B's T2 items land — soft-blocks on T2.9 / T2.10 / T2.11).
