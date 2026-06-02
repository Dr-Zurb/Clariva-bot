# Task text-B9: Drag-and-drop attachment on desktop (`standalone` + `canvas` only)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Desktop users want to drag a file from Finder / Explorer onto the chat surface and have it land in the composer attachment queue. This task adds:

- A drop zone wrapping the message-list + composer area.
- Visual hint while dragging over (blue overlay + "Drop to attach" copy).
- On drop, files go through the same `addAttachment` path as the file-picker (B8), respecting the 5-attachment cap, MIME whitelist, and 10 MB per-file limit.

**Excluded layouts:** `panel`. The voice/video room's chat panel is too narrow; drag operations from outside the panel often miss the drop target and instead drop on the underlying video tile, which has its own (Twilio-specific) drag handlers. Cleaner to disable the affordance there.

**Estimated time:** ~3 hours.

**Status:** Done.

**Depends on:**
- [task-text-B8](./task-text-B8-multi-attachment-composer.md) — hard. Reuses `addAttachment` and the composer attachment queue.

**Source plan:** [T2 §T2.17](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)

---

## Acceptance criteria

- [x] **Drop zone wrapper** — wrap the message-list + composer container in `<TextConsultRoom>` with a drop-zone div:
  ```tsx
  <div
    className="relative"
    onDragOver={handleDragOver}
    onDragEnter={handleDragEnter}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
    aria-dropeffect="copy"
  >
    {dragOverActive ? (
      <div className="absolute inset-0 bg-blue-100 bg-opacity-50 border-2 border-dashed border-blue-500 z-10 flex items-center justify-center">
        <span className="text-lg font-medium text-blue-700">Drop to attach</span>
      </div>
    ) : null}
    {/* existing message list + composer */}
  </div>
  ```
- [x] **`dragOverActive` state** — true while a drag is over the zone with at least one file in the dataTransfer. Reset on drag leave + drop.
- [x] **Drag-leave hysteresis** — `onDragLeave` fires when the cursor enters child elements; use a counter pattern to track enter/leave depth and only reset `dragOverActive` when depth hits 0. This is a well-known React gotcha; the implementation is ~10 LOC.
- [x] **`handleDrop` reads files** from `e.dataTransfer.files`, filters by MIME (image/* + application/pdf only — same as the file picker), filters by size (≤10 MB), then calls `handleFilePick` for each up to the 5-cap. Files exceeding the cap get a toast: `Maximum 5 attachments per send. {N} files dropped were ignored.`.
- [x] **`onDragOver`** must call `e.preventDefault()` for `onDrop` to fire. Easy to forget; pin in the test.
- [x] **Layout gating** — only renders + binds handlers in `layout === 'standalone' || layout === 'canvas'`. In `panel`, the wrapper is a passthrough (no drop zone, no `onDragOver` handler).
- [x] **`mode='readonly'`** — drop zone never renders (composer is gone).
- [x] **No regression on existing file picker** — the existing `<input type="file" multiple>` still works as before.
- [x] **No regression on B5 long-press / B4 reply-tap** — these handlers shouldn't trigger during a drag operation. Browsers naturally suppress this; verify in manual smoke.
- [x] Frontend type-check + lint clean. Manual smoke (desktop): drag 3 photos from Finder onto the chat → blue overlay appears → drop → 3 thumbnails appear in composer; drag 7 photos → only first 5 land + toast for the 2 extras; drag a `.exe` → no thumbnails (silently rejected, optional toast `Unsupported file type.`).

---

## Out of scope

- **Mobile drop targets.** Touch devices don't have OS-level drag-from-outside; this is a no-op there.
- **Drag-to-reorder thumbnails in the composer.** Out of scope.
- **Drag-out** (drag a chat image to the OS desktop). HTML5 supports this via `draggable` + `ondragstart`; out of scope.
- **Paste-image-from-clipboard** support (Ctrl+V to attach). Adjacent feature; not in T2.17. Could be a fast follow-up.
- **`<panel>` drop support.** Explicitly excluded per the source plan; if requested later, requires resolving the Twilio video-tile drag conflict.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (drop-zone wrapper; drag handlers; layout gating).

**No new files. No backend, no schema.**

---

## Notes / open decisions

1. **Why a counter for drag-leave** — React's drag events bubble, and entering a child fires `onDragLeave` on the parent. A naive `setDragOverActive(false)` on `onDragLeave` causes flicker. The standard fix is `dragDepth.current += 1` on enter, `-= 1` on leave, set state to `depth > 0`.
2. **Toast on rejection vs. silent** — recommendation: silent on file-type rejection (file picker also silently rejects), toast on count-cap (less obvious to the user why some were dropped).
3. **Visual treatment** — blue overlay is the convention; pick the same blue as the composer focus state for consistency.
4. **`canvas` layout drop zone** — small in width; the "Drop to attach" copy may need to be smaller. Use `text-base` or `text-sm` in canvas via `data-host="canvas"`.
5. **Testing on touch-with-mouse devices** (Surface, iPad with trackpad) — touch drag doesn't fire HTML5 drag events. Acceptable degradation; users can still tap the file picker.
6. **`aria-dropeffect`** — the modern accessibility recommendation has moved away from this attribute, but it's still recognised. Including it is harmless; live-region announcements are out of scope.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T2 §T2.17](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Hard dep:** [task-text-B8](./task-text-B8-multi-attachment-composer.md) (composer queue + `addAttachment`).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
