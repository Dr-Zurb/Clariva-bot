# Task text-C1: Camera-direct attachment polish (in-composer button + preview + "switch to gallery")

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch C (T6 mobile native)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today, mobile patients tap the existing `<input type="file">` and get the OS chooser ("Photo Library / Take Photo / Choose File"). Most tap "Take Photo", which is fine, but they then return to the chat with no preview before send — the photo lands in the message immediately, blurry / dark / wrong frame, and they have to delete-and-retry.

This task adds:
- A dedicated camera button in the composer (`📷` icon, beside the existing attachment icon).
- Tapping it triggers `<input type="file" accept="image/*" capture="environment">` (rear camera by default — the meaningful default for clinical photos: rashes, wounds, X-rays on a lightbox).
- After capture, a preview overlay appears with the photo + caption textarea + Send / Retake / Switch to gallery buttons.
- Switch to gallery → re-prompts the file picker with `accept="image/*"` (no `capture` hint) so the user can pick from existing photos instead.
- Send → routes through the same B8 composer queue as everything else.

**Estimated time:** ~4 hours.

**Status:** Done (2026-05-24).

**Depends on:** None hard. Soft-deps on [task-text-B8](./task-text-B8-multi-attachment-composer.md) (uses the composer queue) and [task-text-B2](./task-text-B2-message-bubble-extract.md) (so render side already handles attachment grouping cleanly).

**Source plan:** [T6 §T6.41](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)

---

## Acceptance criteria

- [x] **`<CameraButton>` new component OR inline JSX** in the composer:
  ```tsx
  <button
    type="button"
    onClick={() => cameraInputRef.current?.click()}
    aria-label="Take photo"
    className="p-2 rounded-full hover:bg-gray-100"
  >
    📷
  </button>
  <input
    ref={cameraInputRef}
    type="file"
    accept="image/*"
    capture="environment"
    className="hidden"
    onChange={handleCameraCapture}
  />
  ```
- [x] **`handleCameraCapture` opens the preview overlay** — sets `cameraPreview: { file, previewUrl }` state.
- [x] **`<CameraPreviewOverlay>` new component** at `frontend/components/consultation/CameraPreviewOverlay.tsx`:
  - Full-screen-on-mobile, modal-on-desktop overlay.
  - Renders the captured photo at fit-to-viewport.
  - Caption textarea below the photo.
  - Action row: `Retake` (re-triggers `cameraInputRef`) · `Switch to gallery` (re-triggers a sibling `galleryInputRef` with `accept="image/*"`, no `capture`) · `Cancel` · `Send`.
  - Send → routes through `addAttachment` (B8) with the file + sets `composerBody = caption`; closes the overlay.
- [x] **Memory hygiene** — `URL.revokeObjectURL(previewUrl)` on overlay close + on retake.
- [x] **Layout-aware visibility** — camera button is visible in all three layouts (`standalone`, `panel`, `canvas`); the preview overlay renders at the layout root (`portal` to body) so it's full-screen regardless of layout container.
- [x] **`mode='readonly'`** — composer hidden; camera button + overlay never reachable.
- [x] **`capture="environment"`** for clinical default. The user can still pick front camera from the OS UI (the `capture` attribute is a hint, not a hard restriction).
- [x] **Existing attachment button (paperclip)** stays — gives a clear path for "I want to pick from gallery without going through capture-then-switch".
- [x] **Three-host parity** — all three layouts get the camera button. Preview overlay portals to document body so it's full-screen everywhere.
- [x] **No new permissions needed** — `<input capture>` reuses the OS-level camera permission flow; no `getUserMedia` call.
- [x] Frontend type-check + lint clean. Manual smoke (mobile): tap 📷; OS camera opens; capture; overlay shows preview + caption; tap Send; bubble appears with photo; tap Retake; OS camera reopens; tap Switch to gallery; OS gallery picker opens.

---

## Out of scope

- **Live camera in-app** (`getUserMedia`-based). The OS-native capture path is simpler, more battery-friendly, and avoids us reimplementing the camera UI.
- **Multi-photo capture in one session.** Each tap of 📷 captures one. Doctors / patients wanting batches use the gallery picker (B8).
- **Filters / annotations / redaction tooling on the captured photo.** Out of scope; PHI / privacy concerns warrant a dedicated future feature.
- **Video capture.** Out of scope; chat is text + still images + PDF only.
- **Front-camera default.** Clinical photos are rear-camera by default; users can override at the OS prompt.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/CameraPreviewOverlay.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (camera button JSX; `cameraInputRef`; `cameraPreview` state; gallery re-trigger ref).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why `capture="environment"`** — it's the only standardised way to hint "rear camera" on Android + iOS Safari. iOS sometimes ignores it on installed PWAs; document the inconsistency.
2. **Portal target** — render the overlay into `document.body` to escape any layout-imposed `overflow: hidden`. Use `createPortal` from `react-dom`.
3. **Caption focus** — auto-focus the caption textarea when the overlay opens (mobile users will dismiss the keyboard if they don't want to caption; auto-focus saves a tap for those who do).
4. **Why not reuse the existing `<input type="file">`** — the existing one accepts both image and PDF; adding `capture` to it would prompt for camera even for PDF use cases. Cleaner to ship a dedicated camera path.
5. **Gallery fallback uses a separate `galleryInputRef`** — same widget could conceptually re-trigger by removing `capture`, but DOM attribute mutations on a file input are flaky. Two refs is cleaner.
6. **Long-term: does this conflict with C7 share-target?** No — share-target is "received from another app"; camera is "captured in app". Different entry points; both end up in the composer queue.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch C](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T6 §T6.41](../../../../Product%20plans/text-consult/plan-t6-text-mobile-native.md)
- **Soft-dep:** [task-text-B8](./task-text-B8-multi-attachment-composer.md) (composer queue).
- **Sibling:** [task-text-C7](./task-text-C7-pwa-share-target.md) (alternative attachment ingress).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
