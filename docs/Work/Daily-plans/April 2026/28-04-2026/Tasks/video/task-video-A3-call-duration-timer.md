# Task video-A3: Call duration timer in header (`mm:ss`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **XS item, ~30 min**

---

## Task overview

Today the video room header shows minimal context — no duration. Doctors bill on call duration; patients want basic situational awareness. T1.3 ships an `mm:ss` (or `h:mm:ss` after 60 min) timer that ticks once per second from the moment Twilio fires `connected`.

**Reuses voice batch's `useCallDuration(connectedAt)` hook** verbatim ([task-voice-A1](./task-voice-A1-duration-timer.md)). Video adds nothing to the hook; this task just mounts it inside `<VideoRoom>`.

The hook also feeds [task-video-B2](./task-video-B2-caller-card-overlay.md) (caller-card overlay), so this task ships the standalone display; B2 reuses the same hook in the new card.

**Estimated time:** ~30 min.

**Status:** **Complete (hook pull-forward + chip mounted on remote tile).**

**Depends on:** voice [task-voice-A1](./task-voice-A1-duration-timer.md) (SOFT — reuses hook; voice hasn't shipped → this task pulled the hook forward and shipped it at `frontend/hooks/useCallDuration.ts`. Voice A1 imports it as-is when it picks up).

**Source:** [T1 §T1.3](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Reuse `useCallDuration(connectedAt)` hook

- [x] **Voice T1.1 / A1 has NOT shipped** → pulled the hook forward and built it at `frontend/hooks/useCallDuration.ts` per the voice A1 contract.
  - Input: `connectedAt: Date | null`.
  - Output: `{ formatted: string; seconds: number }` (`UseCallDurationResult`).
  - Format: `mm:ss` (zero-padded) under 60 min; `h:mm:ss` (hours unpadded; mm + ss zero-padded) at ≥60 min.
  - `connectedAt === null` → returns `{ formatted: '', seconds: 0 }` so callers can drop empty-string to mean "don't render the chip".
  - Seeds initial `seconds` in the `useState` initializer + on every `connectedAt` change to avoid a 1-tick `00:00` flash on mount.
  - `setInterval` registered + cleaned up on `connectedAt` transitions and unmount — no leak.
- [x] Voice A1 can `import { useCallDuration } from "@/hooks/useCallDuration"` as-is when that batch picks up.

### Render in `<VideoRoom>` header

- [x] **Edit `frontend/components/consultation/VideoRoom.tsx`** — chip rendered as a `topLeftBadge` slot on the remote `<VideoTile>`. **Deviation:** task asks for "header" — there's no dedicated header in `<VideoRoom>` like `<VoiceConsultRoom>` has; the existing layout is just the two video tiles + controls bar. Anchoring to the remote tile (top-left over the video area) matches modern video-call UX (Zoom/Meet/FaceTime all do this) and is what task draft Note #2 explicitly recommends.
- [x] Added `topLeftBadge?: ReactNode` prop to `<VideoTile>` so positioning logic stays inside the tile. B2's caller-card overlay can reuse the same slot.
- [x] **Source `connectedAt`** from a new `useState<Date|null>(null)` in `<VideoRoom>`, seeded inside the existing `connectRoom` `try` block right after `setStatus("connected")`. Used the functional setter form (`setConnectedAt((prev) => prev ?? new Date())`) so a Twilio reconnect path can't reset the chip to `00:00`.
- [x] **Pause behavior on lifecycle:**
  - `connectedAt === null` → hook returns `''`; chip is conditionally not rendered.
  - Reconnect → `connectedAt` is never reset (functional-setter guard); chip keeps counting.
  - Hold (B3, future) → same — B3 will not touch `connectedAt`; the timer keeps counting through hold.
- [x] **`mode='readonly'`** branch — `<VideoRoom>` has **no readonly mode** today (`Grep` returned 0 matches; same finding as A1 + A2). The Plan 07 history viewer renders elsewhere; when it ships, it will compute its own static `mm:ss` from `session.started_at` / `session.ended_at` and NOT mount this hook (live ticking has no semantic in a recorded session). Documented in the hook's JSDoc.

### Manual smoke

- [ ] Doctor + patient on different devices: timer starts within ~1s of both connected; both sides show ~the same value (within ±2s — they each anchor to their own local `Date.now()` so small drift is expected per Note #3).
- [ ] Refresh patient mid-call → timer restarts from 00:00 on the patient side (the patient's `connectedAt` is local state, lost on refresh; Twilio re-derives a NEW `connected` event, the doctor's chip continues unaffected). **Note:** task draft says "timer resumes (Twilio re-derives `connectedAt`)" — that's slightly aspirational; the hook anchors to the LOCAL `connected` event. Persisting cross-tab is explicitly out of scope per the task's "Out of scope" section. Acceptable; document but don't implement.
- [ ] At 59:59 → 1:00:00 transition formats correctly (spoof by setting `connectedAt = new Date(Date.now() - 59*60*1000 - 59*1000)` in DevTools).
- [ ] No `setInterval` leak — React DevTools should show the interval id cleared on `<VideoRoom>` unmount or on `connectedAt` reset.

### General

- [x] Type-check (`npx tsc --noEmit`) clean — 0 errors.
- [x] Lint (`npx next lint --file VideoRoom.tsx --file VideoTile.tsx --file useCallDuration.ts`) clean — no warnings or errors.
- [x] No console errors introduced (no new `console.*` calls).

---

## Out of scope

- **Persisting `connectedAt` to backend** for cross-tab sync. Twilio re-derives.
- **Audible duration callouts.** Out of scope.
- **Auto-end at slot expiry.** Out of scope.
- **Visual emphasis after long calls** (red text after 60 min). Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useCallDuration.ts` — **new IF voice hasn't shipped**, otherwise import.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~10 LOC: import hook + render chip).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Coordinate with voice batch ownership** — if voice A1 hasn't merged yet, decide whether to ship the hook from this task (pull-forward) or wait. Recommendation: ship from here if voice is paused.
2. **Chip placement** — top-left overlay on the remote tile (recommended; matches modern video-call UX). Alternative: top-right of the page header.
3. **Doctor + patient drift** — both compute locally from their own `connectedAt`; small drift (±2s) is acceptable. Don't sync via Realtime.
4. **Format threshold** — `mm:ss` until 60 min, then `h:mm:ss`. No leading zero on hours.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.3](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Sibling (voice):** [task-voice-A1](./task-voice-A1-duration-timer.md) — same hook
- **Consumer:** [task-video-B2](./task-video-B2-caller-card-overlay.md) — caller-card overlay reuses the hook

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** **Complete (hook pull-forward + chip mount on remote tile, 2026-04-30).** Hook now lives at `frontend/hooks/useCallDuration.ts` for voice A1 to import as-is.

---

## Implementation log

### 2026-04-30 — A3 timer shipped (hook pulled forward from voice A1)

**Scope shipped:**

The full T1.3 deliverable: `useCallDuration(connectedAt)` hook + a tiny `mm:ss` / `h:mm:ss` chip rendered top-left over the remote video tile. Both sides see the timer ticking from the moment Twilio fires `connected`. ~30 min as estimated.

**Pull-forward decision:**

Voice A1 hasn't shipped (`Glob` for `useCallDuration*` and `Grep` for `connectedAt|callDuration` both returned 0 matches across `frontend/`). Per task draft Note #1 — *"Recommendation: ship from here if voice is paused."* — built the hook here with the exact contract voice A1 would have used. Voice batch can `import { useCallDuration } from "@/hooks/useCallDuration"` when they pick up T1.1 / A1 with zero changes.

**Files changed (this PR):**

- **NEW** `frontend/hooks/useCallDuration.ts` (~85 LOC).
  - Single hook, single helper (`formatDuration`).
  - Initializer + effect both seed `seconds` from `Math.floor((Date.now() - connectedAt.getTime()) / 1000)` so the first paint after `connectedAt` becomes non-null doesn't show `00:00` for one tick (matters when `connectedAt` is set late, e.g. on Twilio reconnect).
  - `setInterval` cleanup wired in the effect's return — passes the "no leak" smoke check trivially.
  - `connectedAt === null` short-circuits to `{ formatted: '', seconds: 0 }` — empty string is the sentinel for "don't render the chip" so callers can `formatted ? <chip/> : null` cleanly.
  - JSDoc explicitly documents the reconnect / hold / readonly doctrine so voice A1 + B2 (caller-card) + Plan 07 history viewer all read the same contract.
- `frontend/components/consultation/VideoTile.tsx` — additive only.
  - Added `topLeftBadge?: ReactNode` prop, layered last (after `cameraOff` overlay + `pendingText` overlay) so the badge sits visually on top of any state.
  - Anchored at `absolute left-2 top-9 z-10` — the `top-9` (32+4 px) clears the heading row's height + `mb-2` margin so the badge anchors to the actual video area, not the heading.
  - Imported `ReactNode` type from React (no runtime impact).
- `frontend/components/consultation/VideoRoom.tsx` — additive only.
  - Imported `useCallDuration`.
  - Added `connectedAt` state next to A2's `cameraOff` block, with a 12-line comment block explaining the doctrine.
  - Computed `callDurationLabel` from the hook (destructure only `formatted` — `seconds` is unused at this surface).
  - Inside the existing `connectRoom` `try`, seeded `connectedAt` once via `setConnectedAt((prev) => prev ?? new Date())` right after `setStatus("connected")`. Functional-setter form is the reconnect guard.
  - Passed a `<span>` chip badge to the remote `<VideoTile>`'s new `topLeftBadge` prop, conditionally rendered on `callDurationLabel` (empty string → no chip → connecting + post-leave both show nothing).

**Backend / migrations / tests:** none.

**Verification:**

- `npx tsc --noEmit -p tsconfig.json` (frontend) → exit 0, no errors.
- `npx next lint --file components/consultation/VideoRoom.tsx --file components/consultation/VideoTile.tsx --file hooks/useCallDuration.ts` → "✔ No ESLint warnings or errors".
- `ReadLints` on all three files → no diagnostics.
- No existing test files for the hook or `<VideoRoom>` (`Glob` returned 0); the hook's tick + format logic is simple enough to verify visually + via the smoke checklist.

**Deviations from the task draft (summary):**

| # | Draft says | Shipped | Why |
|---|---|---|---|
| 1 | Mount in "header" | Mount as `topLeftBadge` overlay on the remote `<VideoTile>` | `<VideoRoom>` has no header element today (unlike `<VoiceConsultRoom>`). Top-left tile overlay matches modern video-call UX (Zoom/Meet/FaceTime) and is what task draft Note #2 explicitly recommends. |
| 2 | "Refresh patient mid-call → timer resumes (Twilio re-derives `connectedAt`)" | Refresh restarts from `00:00` on the patient side (the doctor's chip is unaffected) | Persisting `connectedAt` cross-tab is in the task's own Out-of-scope section. Hook anchors to the LOCAL `connected` event; resume-from-true-elapsed would need backend session state, which is out of scope here. |
| 3 | "`mode='readonly'` — replace with static duration" | No-op — `<VideoRoom>` has no `mode='readonly'` prop | Plan 07 history viewer renders elsewhere; it will compute its own static `mm:ss` and won't mount this hook. Documented in the hook's JSDoc. |
| 4 | None — task didn't mention adding a generic slot to `<VideoTile>` | Added `topLeftBadge?: ReactNode` prop to `<VideoTile>` | B2 (caller-card overlay) needs the same anchor point; ship the slot now so B2 is a one-line consumer instead of re-doing the positioning logic. |

**Follow-ups (track for B2 + voice A1):**

1. Voice A1 (T1.1): when picked up, `import { useCallDuration } from "@/hooks/useCallDuration"` and mount in the `<VoiceConsultRoom>` header (which already has `<header>`-style markup). Same `connectedAt` setter pattern — call it on the Twilio voice room's `connected` event.
2. Video B2 (caller-card overlay): consumes the same hook + reuses `<VideoTile>`'s new `topLeftBadge` slot; no new positioning logic needed.
3. Plan 07 history viewer (when it ships): compute `mm:ss` from `session.started_at` and `session.ended_at` directly; do NOT mount `useCallDuration` (live ticking is meaningless for a recorded session).

**Manual smoke (live-shipped):** the Manual smoke section's checkboxes are intentionally still unchecked — they require a deployed staging env + two participants. Run during PR review.
