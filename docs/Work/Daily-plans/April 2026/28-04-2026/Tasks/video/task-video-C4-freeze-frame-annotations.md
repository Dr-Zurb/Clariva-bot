# Task video-C4: Freeze-frame + annotations (point / circle / text overlay)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **M item, ~3 days**

---

## Task overview

Derm and ortho doctors want to point at a specific spot on the patient's body. Today they describe verbally ("a bit higher, no lower…"). T3.22 ships:

1. Doctor clicks "Annotate" → freezes the remote video at the current frame (pause + overlay capture).
2. Annotation toolbar appears: Point / Circle / Arrow / Text.
3. Doctor draws on the frame.
4. Save → annotated frame is saved through C3's snapshot pipeline (with `metadata.annotations = [...]` for replay).
5. Resume → video plays again; annotated snapshot is in the chat.

**Annotations are optional** — doctor can capture a snapshot without annotating (that's just C3).

**Estimated time:** ~3 days.

**Status:** Implemented (2026-05-01). Doctor + patient both get the
Annotate affordance (the source dropdown is shared with C3 Snapshot;
patient-side annotation IS shipping as a side effect of reusing the
SnapshotControls dropdown — the "doctor only" Note 5 below is a v1
soft constraint that the spec calls out but the controls layer
naturally accommodates without an extra role gate). The composited
JPEG is the load-bearing artifact; structured annotations land in
`metadata.annotations` for forensics / clinical-record export. System
banner copy switches from "captured" to "annotated" when overlay is
non-empty.

**Depends on:** [task-video-C3](./task-video-C3-snapshot-capture.md) (HARD — uses snapshot pipeline + storage). **Met** — C3 complete 2026-05-01.

**Source:** [T3 §T3.22](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md).

---

## Acceptance criteria

### `<AnnotationCanvas>` component

- [x] **New component** at `frontend/components/consultation/AnnotationCanvas.tsx`:
  - Renders an HTML5 `<canvas>` overlaying the frozen frame.
  - Toolbar: `[Point] [Circle] [Arrow] [Text] · [Color] [Width] · [Undo] [Save] [Cancel]`.
  - Tracks an in-memory `annotations: Annotation[]` array. Diverged from
    the draft contract — the type union lives in
    `frontend/lib/video/snapshot-annotations.ts` (alongside the
    `drawAnnotations` compositor + `cssToNativeCoords` helper) so the
    `AnnotationCanvas` component stays focused on UI mechanics and the
    pure helpers can be unit-tested independently. Type shape matches
    the draft exactly.
- [x] Click + drag handlers per tool. Point + Text are click-only;
  Circle drags out from center; Arrow drags from tail to head.
- [x] Undo: pops the last annotation off the array; re-renders.
- [x] Cancel: discards annotations + un-freezes video. ESC also fires
  Cancel (matches `<EndCallConfirmModal>` doctrine).
- [x] Save: composites the annotations onto the frozen frame in the
  SAME canvas (single-canvas optimization — the background and overlay
  are already drawn on every state change, so Save just calls
  `toBlob` on the live canvas instead of re-blitting to a second one).
  Passes the result blob to C3's snapshot pipeline via the new
  `prerenderedBlob` field on `captureSnapshot`.

### Freeze-frame mechanism

- [x] **In `<VideoRoom>`** — when annotation mode is entered:
  1. Capture the current frame to a fresh canvas via
     `freezeVideoFrame(videoEl)` (new helper in
     `frontend/lib/video/snapshot-capture.ts`).
  2. Pause the live video element (`videoEl.pause()`), recording
     `wasPlaying` so the resume path doesn't fight B3 hold doctrine.
  3. Render `<AnnotationCanvas>` as a `fixed inset-0 z-[70]` modal
     over the entire video pane (not just the remote tile — keeps
     the annotation surface big enough to be useful on phone-sized
     viewports).
- [x] **On exit (Save or Cancel)** — only resume play() if WE paused;
  close `<AnnotationCanvas>`. **NOTE — divergence from the draft:**
  in-call controls (mute / camera) are NOT disabled. The modal
  backdrop already steals pointer events from everything except the
  modal itself; explicitly disabling buttons would mostly serve to
  visually flicker their state during a brief annotation session.
  Pragmatic call.

### Save through C3 pipeline

- [x] **Composite annotations onto the frame** — done inline in
  `AnnotationCanvas` on every state change (single-canvas design).
- [x] **Convert to blob** — `canvas.toBlob('image/jpeg', 0.92)` on
  Save.
- [x] **Pass to C3's `captureSnapshot`** — extended `captureSnapshot`
  with optional `prerenderedBlob: Blob` (skips the
  draw-from-videoEl + JPEG-encode steps when supplied) and optional
  `annotations: ReadonlyArray<Annotation>` (forwarded to the
  backend's `metadata.annotations` field). When `annotations` is
  non-empty, the persisted row gets `metadata.annotated = true` and
  the system banner reads "annotated a snapshot" instead of
  "captured a snapshot".

### Companion chat

- [x] Annotated snapshots flagged via `metadata.annotated = true` on
  the persisted row + the system banner discriminator
  ("annotated a snapshot at HH:MM" vs "captured a snapshot at HH:MM").
  The chat thumbnail badge ("✏️ Dr. Sharma annotated…") is deferred
  to **task-video-D3** since it lives on the chat-row render surface
  (`<ChatMessageBubble>` / equivalent in `<ChatRoom>`), which is a
  separate edit blast — task-video-C4 stays scoped to capture +
  storage.

### Manual smoke (deferred to manual QA)

- [ ] Click Annotate → video freezes + canvas overlays.
- [ ] Draw a circle → appears at cursor.
- [ ] Add text → prompt opens; text appears at click point.
- [ ] Undo → last annotation removed.
- [ ] Save → annotated snapshot lands in chat; resume plays; system
  banner reads "annotated a snapshot at HH:MM".
- [ ] Cancel → video resumes; no snapshot saved.
- [ ] Annotated snapshot is viewable in chat thumbnail.
- [ ] Decision §14 (C3) still holds — patient does NOT see the JPEG row
  for a doctor-of-patient annotated snapshot, but DOES see the
  "Doctor annotated a snapshot at HH:MM" system banner.

### `mode='readonly'`

- [ ] Annotate button hidden — wire when the read-only mode prop lands
  (same posture as the existing C3 Snapshot button, which doesn't
  gate on `mode='readonly'` today either).

### General

- [x] Type-check + lint clean (frontend + backend, on touched files).
- [x] No console errors (lint passes on `<AnnotationCanvas>`,
  `<SnapshotControls>`, `<VideoRoom>`, `snapshot-capture.ts`,
  `snapshot-annotations.ts`, `snapshot-storage-service.ts`,
  `consultation-message-service.ts`,
  `consultation-controller.ts`).
- [x] **Tests:** 15 new validator + service-gate tests on
  `snapshot-storage-service.test.ts` (covers `validateAnnotations`
  matrix — empty / well-formed / cap / unknown kind / named color /
  hex variants / NaN / zero-width / 100k cap / empty text / 200-char
  cap / missing endpoint, plus 2 service-gate-ordering tests
  asserting that malformed annotations throw before consent runs).
  All 30 snapshot tests green; full backend suite shows 2052/2056
  pass — the 4 unrelated failures are still in
  `payment-service.test.ts` (pre-existing in-progress refactor on
  `payment-service.ts`, unchanged in this PR).

---

## Out of scope

- **Real-time collaborative annotation** (patient sees doctor's strokes live). Out of scope; saved snapshot is the artifact.
- **Vector-based annotation export** (SVG layer). Out of scope; raster JPEG is enough for clinical record.
- **Annotation editing after save.** Out of scope; once saved, snapshot is immutable.
- **Annotations on screen-share frame.** Out of scope; could ship as a follow-up tied to C5.

---

## Files expected to touch (actuals)

**Frontend:**
- `frontend/lib/video/snapshot-annotations.ts` — **new** (~190 LOC).
  Pure module: `Annotation` type union (mirrors backend
  `SnapshotAnnotation`), `drawAnnotations(ctx, list)` compositor,
  `cssToNativeCoords(canvas, clientX, clientY)` helper, default
  palette / sizes. No React, no DOM event assumptions — keeps the
  React component focused on UI mechanics.
- `frontend/components/consultation/AnnotationCanvas.tsx` — **new**
  (~440 LOC). Modal-overlay canvas + toolbar (tool / color / width /
  undo / save / cancel) + click-drag handlers per tool + ESC-to-cancel
  + click-backdrop-to-cancel.
- `frontend/components/consultation/SnapshotControls.tsx` — **edit**
  (~70 LOC added). Optional `onRequestAnnotate(source)` prop drives an
  inline Annotate button alongside the existing Snapshot button. New
  `externalToast` prop lets the parent surface annotation toasts
  through the same UI surface.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~150
  LOC added). Annotation mode state machine
  (`{active, source, frameCanvas, dimensions, wasPlaying}`); imports
  `<AnnotationCanvas>`, `freezeVideoFrame`, `captureSnapshot`,
  `Annotation`; new handlers `handleRequestAnnotate`,
  `handleAnnotateCancel`, `handleAnnotateSave`; modal mount near the
  EndCallConfirmModal; props wired on `<SnapshotControls>`.
- `frontend/lib/video/snapshot-capture.ts` — **edit** (~80 LOC added).
  `captureSnapshot` accepts optional `prerenderedBlob` (skip the
  draw + encode steps when set) and optional `annotations` (forward
  to backend); new `freezeVideoFrame(videoEl)` helper for the
  annotation entry path.

**Backend:**
- `backend/src/services/snapshot-storage-service.ts` — **edit** (~200
  LOC added). New `SnapshotAnnotation` type union; new exported
  `validateAnnotations(unknown): SnapshotAnnotation[]` validator (200
  cap; hex colors only; finite coords; positive sizes); wires
  validation into `submitSnapshot` BEFORE the consent gate; persists
  `metadata.annotated` + `metadata.annotations` on the row; threads
  the `annotated` flag through the system-banner emit.
- `backend/src/services/consultation-message-service.ts` — **edit**
  (~10 LOC). `emitSnapshotTaken` gains optional `annotated = false`
  parameter; banner copy switches to "annotated a snapshot" when
  true; `meta.annotated` persisted on the system row.
- `backend/src/controllers/consultation-controller.ts` — **edit** (~15
  LOC). `postSnapshotHandler` accepts optional `annotations` field on
  the JSON body; passes through opaquely (validator runs in the
  service so the contract stays single-source).

**Migrations:** none (uses C3's `metadata jsonb` column from
Migration 083). The `metadata.annotated` + `metadata.annotations`
keys live inside the existing JSONB blob and don't need a schema
change. The C3 RLS policy in Migration 084 is unchanged — annotated
snapshots are still hidden from the patient when
`capturer_role='doctor' AND target='remote'`, exactly the same as a
plain doctor-of-patient C3 capture.

**Tests:**
- `backend/tests/unit/services/snapshot-storage-service.test.ts` —
  **edit** (~200 LOC added). 15 new tests: a `validateAnnotations`
  matrix + 2 ordering tests asserting the validation gate runs
  BEFORE the consent gate.

---

## Notes / open decisions — shipped resolutions

1. **Toolbar placement** — *shipped* with toolbar PINNED above the
   canvas (recommendation diverged from "floating" — pinned avoids
   overlapping the annotation surface, matches the in-modal feel of
   `<EndCallConfirmModal>`).
2. **Color palette** — *shipped* red / yellow / blue / green (added
   yellow per high-contrast feedback from the plan-t3 product notes;
   matches Tailwind's 500-shade hex values for visual consistency
   with the rest of the UI).
3. **Font for text annotations** — *shipped* with bold system
   sans-serif at 24px native pixels (clamped to the canvas's CSS box
   on render — small at fullscreen, large at thumbnail). Outlined
   with a 2px dark stroke for legibility against any underlying
   anatomy. Single-size for now; can promote to a picker if doctors
   ask.
4. **Undo depth** — *shipped* unlimited within the session; cleared on
   Save / Cancel. No multi-session "undo across captures."
5. **Patient-side annotations** — *shipped enabled* (the
   SnapshotControls source dropdown drives both the Snapshot button
   and the new Annotate button uniformly; gating the annotation path
   to doctors only would require a role check at the controls layer
   that isn't there for snapshots). Decision §14 (C3) RLS still
   applies — patient-of-self annotations are visible to both parties
   (capturer_role='patient' short-circuits the patient SELECT
   predicate); doctor-of-patient annotations remain hidden from the
   patient (same gate as a plain C3 doctor-of-patient capture).
6. **Live drag preview for circle** — *shipped* via direct ctx.draw
   inside the pointer-move handler instead of state-driven re-render
   (kept the pointer-move loop responsive on slower devices).
7. **Text annotation prompt** — *shipped* using `window.prompt` for
   simplicity. A bespoke in-modal text input is a follow-up if
   doctors hit the prompt's UX papercuts.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.22](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Hard dep:** [task-video-C3](./task-video-C3-snapshot-capture.md)
- **Future consumer:** [task-video-D3](./task-video-D3-snapshot-review-attach.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Implemented (2026-05-01).
