# Task video-A4: End-call confirmation modal (reuse voice `<EndCallConfirmModal>`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~30 min**

---

## Task overview

Today, one accidental tap on the unguarded red "Leave call" button at the bottom of `<VideoRoom>` (lines 488-494) kills a 20-minute consult. The button is a wide tappable target on mobile; misclicks are common. T1.4 wraps the call-end action in a 2-button modal:

```
End the call?
You'll need to rejoin via the original link if you change your mind.
[Cancel]   [End call]
```

**Reuses voice batch's `<EndCallConfirmModal>`** verbatim ([task-voice-A2](./task-voice-A2-end-call-confirmation.md)). Doctor side has the same `shift+click` bypass for power users.

**Estimated time:** ~30 min.

**Status:** **Complete (component pull-forward + modal wired into Leave-call flow with doctor Shift-click bypass).**

**Depends on:** voice [task-voice-A2](./task-voice-A2-end-call-confirmation.md) (SOFT — reuses component; voice hasn't shipped → this task pulled the component forward and shipped it at `frontend/components/consultation/EndCallConfirmModal.tsx`. Voice A2 imports it as-is when it picks up).

**Source:** [T1 §T1.4](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Reuse `<EndCallConfirmModal>`

- [x] **Voice T1.5 / A2 has NOT shipped** → built the component here at `frontend/components/consultation/EndCallConfirmModal.tsx` (~125 LOC) per the voice A2 contract.
  - Props: `isOpen: boolean`, `onCancel: () => void`, `onConfirm: () => void` — exact shape voice A2's draft specifies.
  - Title: "End the call?".
  - Body: "You'll need to rejoin via the original link if you change your mind."
  - Buttons: `[Cancel]` (secondary, gray border) `[End call]` (primary destructive, red — matches the existing Leave-call button so users get visual continuity).
  - Default focus: **Cancel** on mount (per voice decision §1; safe default for destructive confirmations).
  - Esc-key handler: cancels (matches the dialog convention; only bound while `isOpen`).
  - Backdrop click: cancels (event-target equality check so clicks on the dialog content don't bubble out as cancels).
  - Aesthetic matches `<VideoConsentModal>` exactly — same `fixed inset-0 z-50 bg-black/70` backdrop, same `rounded-xl bg-white p-6 shadow-2xl` dialog, same `useId()` wiring for `aria-labelledby` / `aria-describedby`.
- [x] Voice A2 will `import EndCallConfirmModal from "@/components/consultation/EndCallConfirmModal"` as-is when that batch picks up.

### Wire into `<VideoRoom>` controls bar

- [x] **Edit `frontend/components/consultation/VideoRoom.tsx`** — replaced direct `onClick={handleLeave}` with the modal flow:
  - `endConfirmOpen` state added next to A3's `connectedAt`.
  - "Leave call" button now reads `onClick={handleLeaveClick}`; the new handler decides between bypass and modal.
  - Modal mounted inside `videoPane` (same scope as `<VideoConsentModal>`); `fixed inset-0` overlay, doesn't shift companion-chat layout.
- [x] **Doctor `shift+click` bypass** — `handleLeaveClick` checks `role !== 'patient' && event.shiftKey` and calls `handleLeave()` directly when both are true. The Leave-call button's `title` advertises the shortcut **only on the doctor side** (`title="Shift-click to skip the confirmation"`) so patients don't discover it accidentally.
- [x] **Default focus on Cancel** — handled in the modal itself via `useEffect` + `cancelBtnRef`; `<VideoRoom>` doesn't need to do anything.

### Manual smoke

- [ ] Doctor or patient hits "Leave call" → modal appears, focus visibly on **Cancel**.
- [ ] Click Cancel → modal closes, call continues. Camera + mic + chat all unaffected.
- [ ] Click End call (modal's confirm) → call ends (existing `handleLeave` path runs: tracks stopped, room disconnected, status flipped to "disconnected", parent `onDisconnect` notified).
- [ ] Doctor: Shift-click "Leave call" → modal skipped, call ends immediately. Title attribute hints at the shortcut on hover.
- [ ] Patient: Shift-click "Leave call" → modal STILL appears (role-gated; the safety net for the more accident-prone audience).
- [ ] Esc key while modal is open → cancels (matches the Cancel button).
- [ ] Backdrop click → cancels.
- [ ] Mobile (≤640px): modal max-width clamps to `max-w-md` with `px-4` overlay padding → centered, full-width content, no overflow.
- [ ] No regression: companion chat panel still mounts; mic/camera buttons still hide while connecting; call-duration chip still ticks across opening/closing the modal (the modal doesn't unmount the room).

### General

- [x] Type-check (`npx tsc --noEmit`) clean — 0 errors. (Initial build had a TDZ error — new `useCallback`s referencing `handleLeave` were declared before the `handleLeave` `const`; fixed by moving the new callbacks below `handleLeave` AND wrapping `handleLeave` itself in `useCallback` so the new callbacks can list it in their deps without re-creating every render.)
- [x] Lint (`npx next lint --file VideoRoom.tsx --file EndCallConfirmModal.tsx`) clean — no warnings or errors.
- [x] No console errors introduced.

---

## Out of scope

- **Different copy for the patient side.** Out of scope; same modal for both.
- **"End call for both sides" doctor power.** Doctor ending only ends their side; Twilio handles the orphan-side disconnect within seconds. Don't add a separate "kick patient" affordance.
- **Confirmation telemetry.** Out of scope; track via existing call-ended events.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/EndCallConfirmModal.tsx` — **new IF voice hasn't shipped**, otherwise import.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~15 LOC: import + state + wrap end-call handler).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Coordinate with voice batch ownership** — if voice A2 hasn't merged yet, decide whether to ship the modal from this task. Recommendation: ship from here if voice is paused.
2. **Shift-click bypass scope** — doctor side only (voice decision). Patient side always sees the modal — they're the more accident-prone audience.
3. **Modal styling** — match the existing video room modal aesthetic (`<VideoConsentModal>`, `<VideoEscalationButton>` confirm). Use the same shadcn / radix dialog primitive if already in use.
4. **Esc-key default** — Esc = Cancel (browser default for dialogs).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.4](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Sibling (voice):** [task-voice-A2](./task-voice-A2-end-call-confirmation.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** **Complete (component pull-forward + Leave-call modal flow with doctor Shift-click bypass, 2026-04-30).** Component now lives at `frontend/components/consultation/EndCallConfirmModal.tsx` for voice A2 to import as-is.

---

## Implementation log

### 2026-04-30 — A4 confirmation modal shipped (component pulled forward from voice A2)

**Scope shipped:**

The full T1.4 deliverable: a 2-button confirmation modal (`<EndCallConfirmModal>`) wired in front of the destructive Leave-call action, with the doctor-side Shift-click bypass for power users. Mounted alongside `<VideoConsentModal>`'s aesthetic so the two consult-room dialogs feel consistent. ~30 min as estimated (plus ~5 min on the TDZ fix).

**Pull-forward decision:**

Voice A2 hasn't shipped (`Glob` for `EndCallConfirm*` returned 0 matches across `frontend/`). Per task draft Note #1 — *"Recommendation: ship from here if voice is paused."* — built the component here with the exact contract voice A2 would have used. Voice batch can `import EndCallConfirmModal from "@/components/consultation/EndCallConfirmModal"` when they pick up T1.5 / A2 with zero changes.

**Files changed (this PR):**

- **NEW** `frontend/components/consultation/EndCallConfirmModal.tsx` (~125 LOC).
  - Three-prop API per the voice A2 contract (`isOpen` / `onCancel` / `onConfirm`); modal does NOT close itself on confirm — the parent owns `isOpen`.
  - Returns `null` when `isOpen === false` so there's no portal, no listener, no extra cost when the modal is dormant.
  - Esc-key + backdrop-click both call `onCancel`. Esc listener is bound only while `isOpen` so we don't intercept Esc anywhere else in the app.
  - Default focus on **Cancel** (voice decision §1) via `useEffect` + `cancelBtnRef`. Wrapped in `setTimeout(0)` so React paints the dialog before focus moves — mirrors `<VideoConsentModal>`'s `allowBtnRef.current?.focus()` pattern.
  - `useId()` for `aria-labelledby` + `aria-describedby` so multiple instances on a page (theoretical) don't collide.
  - Aesthetic: identical backdrop (`fixed inset-0 z-50 bg-black/70 px-4`) + dialog shell (`rounded-xl bg-white p-6 shadow-2xl`) as `<VideoConsentModal>`. Width is `max-w-md` (smaller than the consent modal's `max-w-lg`) because the body copy is 1 line; smaller dialog feels less alarming for a routine confirm.

- `frontend/components/consultation/VideoRoom.tsx` — additive only.
  - Imported `<EndCallConfirmModal>`.
  - Added `endConfirmOpen` state next to A3's `connectedAt` block.
  - Added `handleLeaveClick`, `handleEndConfirmCancel`, `handleEndConfirmConfirm` callbacks (all `useCallback`-wrapped).
  - **`handleLeaveClick`** branches between bypass and modal: doctor + `event.shiftKey` → `handleLeave()` directly; everything else → `setEndConfirmOpen(true)`. Patient role is never given the bypass even if they hold Shift on a desktop keyboard — `role !== 'patient'` is the safety net.
  - **Wrapped existing `handleLeave` in `useCallback`** so the new A4 callbacks can list it in their deps without re-creating every render. The closure body only touches refs + setters (all stable), so empty deps `[]` is correct. This was a small refactor of pre-existing code — no behavior change.
  - **Reordered**: A4 callbacks now sit immediately after `handleLeave`'s declaration (TDZ fix — see Verification below).
  - Replaced the "Leave call" button's `onClick={handleLeave}` with `onClick={handleLeaveClick}` and added a `title="Shift-click to skip the confirmation"` hint **only when `role !== 'patient'`** so patients don't discover the bypass via tooltip.
  - Mounted `<EndCallConfirmModal>` at the bottom of `videoPane` so the existing companion-chat layout doesn't shift (the modal is `fixed inset-0` either way, but keeping the JSX inside `videoPane` matches `<VideoConsentModal>`'s pattern).

**Backend / migrations / tests:** none.

**Verification:**

- `npx tsc --noEmit -p tsconfig.json` (frontend) → exit 0, no errors.
  - **First-pass error**: `Block-scoped variable 'handleLeave' used before its declaration` (TS2448 + TS2454). Caused by declaring the new A4 callbacks above `handleLeave`'s `const` declaration. Fixed by moving the three callbacks to the slot immediately after `handleLeave`.
- `npx next lint --file components/consultation/VideoRoom.tsx --file components/consultation/EndCallConfirmModal.tsx` → "✔ No ESLint warnings or errors".
- `ReadLints` on both files → no diagnostics.
- No existing test files for either component (`Glob` returned 0); the manual smoke checklist above covers the flow.

**Deviations from the task draft:** none of substance. The only adjustments are:

| # | Detail | Why |
|---|---|---|
| 1 | Modal width `max-w-md` (not `max-w-lg` like `<VideoConsentModal>`) | Body copy is one line; smaller dialog reads as less alarming for a routine confirm. |
| 2 | Tooltip on Leave-call button gated on `role !== 'patient'` | Patients don't discover the bypass via hover; safer than a universally-visible hint. |
| 3 | Wrapped existing `handleLeave` in `useCallback` | Required so the A4 callbacks can list it as a stable dep. Body-only touches stable refs, so `[]` deps is correct — no behavior change to the existing leave path. |

**Follow-ups (track for voice A2):**

1. Voice A2 (T1.5): `import EndCallConfirmModal from "@/components/consultation/EndCallConfirmModal"` and wire into `<VoiceConsultRoom>`'s "End call" button (line ~610-616 currently calls `handleLeave` directly).
2. **Future controls-bar extract** (mentioned in A2's follow-ups too): A1 + A2 + A4 all share the controls-bar slotting logic. When A4's "End call" rework lands across both voice + video and someone wants to factor out `<VideoControlsBar>`, the modal mount can move with it. Not blocking.

**Manual smoke:** all "Manual smoke" rows above are intentionally still unchecked — they require a deployed staging env + at least one device. Run during PR review.
