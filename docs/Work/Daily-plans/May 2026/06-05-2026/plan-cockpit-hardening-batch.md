# Cockpit hardening — implementation batch (2026-05-06, post-ship)

## Close the gaps between what the cockpit redesign promised and what actually rendered after lanes α/β/γ/δ shipped

> **Parent batch:** [plan-cockpit-redesign-batch.md](./plan-cockpit-redesign-batch.md). The 8 tasks there shipped a working three-pane shell, header, state machine, and in-call cleanup. **Three of them shipped incomplete in ways the user surfaced from screenshots on 2026-05-06**:
>
> 1. Lane β created `RxWorkspace.tsx` but the import in `ConsultationCockpit.tsx` was never updated — the dashed-border placeholder is still what renders in the right column.
> 2. Lane α / cockpit-3 mounted the **whole** `ConsultationLauncher` for `live` state instead of just the room — the modality button row (Text / Voice / Video) keeps rendering during a live call.
> 3. Lane α / cockpit-4 wired the header `Start consult` / `End consult` CTAs via `document.querySelector("[data-cockpit-{start,end}-btn]")` — those data attributes don't exist in the codebase, so the header CTAs are no-ops.
>
> The room itself (`VideoRoom`) is also surfacing 15+ controls in cockpit context — too dense for "side-by-side with chart and Rx". That's not a bug from the redesign, it's a pre-existing density issue that the new layout exposes.
>
> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md). Most of this batch is Sonnet / Composer; one Opus-locked design section in fix-3.
>
> **Per-task execution checklist:** [Tasks/EXECUTION-ORDER-cockpit-hardening.md](./Tasks/EXECUTION-ORDER-cockpit-hardening.md).

---

## Status

`Drafted, ready to execute` — 2026-05-06.

The Opus-grade architectural locks for fix-2 / fix-3 / fix-4 / fix-5 are baked into the task files (the impl chats treat them as non-negotiable). Most fixes are surgical patches; the one heavy item (fix-3 — `mode="cockpit"` on `VideoRoom`) has its design fully locked here so Sonnet can implement without an extra Opus turn.

---

## What this batch does NOT do

- **No new features.** Every fix here removes / hides / consolidates UI that was promised but didn't render correctly.
- **No backend changes.** No migrations. No new env vars.
- **No new npm deps.**
- **No PHI-touching code edits.** `PrescriptionForm` is still wrapped, never rewritten — same rule as cockpit-5.

---

## The 5 fixes

| ID | Fix | Effort | Lane | Spec |
|---|---|---|---|---|
| fix-1 | **Wire `RxWorkspace`** — replace local `RxPaneMountSlot` placeholder with `<RxWorkspace>` import in `ConsultationCockpit.tsx`. Also removes the "Cockpit state: live" debug chip (it lived inside the placeholder). | XS (~10min) | H1 (Composer) | [task-cockpit-fix-1-wire-rx-workspace.md](./Tasks/task-cockpit-fix-1-wire-rx-workspace.md) |
| fix-2 | **Make `ConsultationLauncher` mode-aware** — hide its header strip + modality button row when `sessionLive === true`. The launcher's pre-call UI is wrong inside the cockpit's `live` state. | S (~30min) | H2 (Sonnet) | [task-cockpit-fix-2-launcher-mode-aware.md](./Tasks/task-cockpit-fix-2-launcher-mode-aware.md) |
| fix-3 | **`VideoRoom` / `VoiceConsultRoom` `mode="cockpit"` prop** — compact set of essential controls (mute, camera, leave, network bars, modality switch); everything else (recording pause/resume, mirror, layout, background, quality, PIP, share, snapshot, annotate, companion-chat panel) collapses behind a `More ▾` dropdown. | M (~3h) | H3 (Sonnet, with Opus-locked design here) | [task-cockpit-fix-3-room-cockpit-mode.md](./Tasks/task-cockpit-fix-3-room-cockpit-mode.md) |
| fix-4 | **Replace `document.querySelector` wiring with a real ref handle** — `useImperativeHandle` on `ConsultationLauncher` exposing `start(modality)`. Cockpit holds the ref; `CockpitHeader.onStartConsult` calls it. **`endCall` is intentionally NOT exposed** — the room's own "Leave call" button stays the source of truth (see fix-3 for why). The header `End consult` CTA is hidden during `live`; the room's button replaces it. | S (~1h) | H2 (Sonnet) | [task-cockpit-fix-4-launcher-imperative-handle.md](./Tasks/task-cockpit-fix-4-launcher-imperative-handle.md) |
| fix-5 | **Hide `<PatientJoinLink>` once patient has joined** — currently shows even mid-call. `VideoRoom` / `VoiceConsultRoom` fire `onRemoteJoined` / `onRemoteLeft` callbacks; launcher gates the link visibility. | S (~30min) | H2 (Sonnet) | [task-cockpit-fix-5-hide-join-link.md](./Tasks/task-cockpit-fix-5-hide-join-link.md) |

**Total:** ~5h. With H1 + H2 + H3 in parallel chats: **~3 calendar hours wall-clock** (H3 is the longest pole).

---

## Architectural locks (from the Opus design pass)

These apply across the batch; impl chats treat them as non-negotiable.

### K-H1 — `ConsultationLauncher` does NOT own the room

The cockpit's `live` state mounts `<ConsultationLauncher>` because the launcher holds the in-memory `liveSession` / `textSession` records that drive the rehydrate-on-refresh effects. **But the launcher should not be drawing pre-call UI during `live`**. Lock: when `sessionLive === true`, the launcher renders **only** the live panel (its existing `<LiveConsultPanel>` block). The pre-call header strip + modality button grid are gated behind `!sessionLive`.

### K-H2 — Header CTA is hidden during `live`

There were two end-call affordances after cockpit-4: the header's `End consult` button + the room's `Leave call` button. They duplicated each other and the header's was non-functional anyway. Lock: **the cockpit header CTA is hidden during `live`**. Doctor uses the room's own `Leave call` button (which already works and is the only place with the actual room.disconnect() handle).

This means fix-4 only needs to expose `start(modality)` upward via ref — not `endCall`. Smaller surface, no two-level forwardRef chain through `<VideoRoom>`.

### K-H3 — `mode="cockpit"` is a render-time prop, not a refactor

`VideoRoom` is 5676 lines. We do NOT split the file or extract sub-components. fix-3 adds a single `mode?: "default" | "cockpit"` prop and gates 6–8 conditional renders on it. Default is `"default"` (current behaviour); cockpit-mounted rooms pass `"cockpit"`. Patient-side `/consult/join` always uses default — its UX is full-screen single-column, not a cockpit pane.

### K-H4 — Companion text-chat panel is suppressed in cockpit mode

The `<VideoRoom>`'s built-in companion text-chat side panel (mounted when `companion` prop is set) was originally meant as a chat affordance during video. In the cockpit, the doctor types in the Rx pane, not in a chat. **Lock: in `mode="cockpit"`, the companion chat panel is hidden by default**, with a `Show chat` item in the room's `More ▾` dropdown that toggles a smaller floating overlay if the doctor genuinely wants to chat. The patient-side mount keeps the companion chat panel visible (patient page is single-column).

### K-H5 — Recording pause/resume is one pill, not two buttons

Today the room shows both `Pause recording` and `Start video recording` simultaneously. That's confusing. Lock: in `mode="cockpit"`, render one stateful pill `Recording: ON ●` / `Recording: OFF ○` that toggles. Multi-state recording (pause vs stop) lives in the `More ▾` dropdown.

---

## Whole-batch acceptance gate

Run after H1 / H2 / H3 all close.

- [ ] All 5 task files marked `Status: Shipped (YYYY-MM-DD)`.
- [ ] **Side-by-side smoke**: open a `live` text or video appointment. The cockpit shows: chart left, **compact** room center, **`<RxWorkspace>` (not placeholder) right**. The doctor can write Rx fields while the room is connected.
- [ ] No "Cockpit state: live" debug chip anywhere on screen.
- [ ] No `document.querySelector("[data-cockpit-…]")` left in the codebase. Grep returns zero matches.
- [ ] `ConsultationLauncher` does not render its `Text Consultation / Voice Consultation / Video Consultation` button row during `live` state.
- [ ] `VideoRoom` and `VoiceConsultRoom` accept a `mode="cockpit"` prop. When set: only mute / camera / leave / network bars / modality switch / `More ▾` are visible by default; recording is one pill.
- [ ] The cockpit header CTA is hidden when state === `live`.
- [ ] `<PatientJoinLink>` is hidden once a remote participant has joined the call.
- [ ] Type-check + lint clean.
- [ ] No console errors on the redesigned page.
- [ ] **One Opus close-gate review**: paste the full diff, ask for grade against this checklist + K-H1..K-H5.

---

## Cost calibration

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Phase | Opus turns | Sonnet turns | Composer turns |
|---|---|---|---|
| Architectural design (this doc + task files) | 1 (this batch — done) | 0 | 0 |
| fix-1 | 0 | 0 | 1 |
| fix-2 | 0 | 1 | 0 |
| fix-3 | 0 | 3–4 | 0 |
| fix-4 | 0 | 1–2 | 0 |
| fix-5 | 0 | 1 | 0 |
| Close-gate review | 1 | 0 | 0 |
| **Totals** | **2** | **6–8** | **1** |

Roughly 20% Opus / 70% Sonnet / 10% Composer — slightly more Opus-heavy than the parent batch because the design lock work has to happen up-front for fix-3.

---

## References

- **Parent batch:** [plan-cockpit-redesign-batch.md](./plan-cockpit-redesign-batch.md)
- **Execution order (with parallel-chat lanes):** [Tasks/EXECUTION-ORDER-cockpit-hardening.md](./Tasks/EXECUTION-ORDER-cockpit-hardening.md)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- **Surfaces that broke:**
  - `frontend/components/consultation/ConsultationCockpit.tsx:171,181,535-563` (querySelector hack + placeholder)
  - `frontend/components/consultation/ConsultationLauncher.tsx:489-555` (modality buttons rendered during live)
  - `frontend/components/consultation/VideoRoom.tsx` (~5676 LOC; cockpit-mode prop additive)

---

**Created:** 2026-05-06.  
**Status:** `Drafted, ready to execute`.  
**Owner:** TBD.
