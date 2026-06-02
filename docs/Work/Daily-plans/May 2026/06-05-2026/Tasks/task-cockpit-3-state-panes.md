# Task cockpit-3: State-driven center pane

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane α step 2 — **M, ~5h**

---

## Task overview

Wires the cockpit center pane to render the right surface for the current `CockpitState`. The shell from cockpit-2 has a placeholder; this task replaces it with five branches:

| State | Center pane content |
|---|---|
| `ready` | "Ready to start" card — modality picker + patient join link preview + scheduling info + (kebab: reschedule / cancel) |
| `lobby` | Same room shell as `live` (so the doctor sees their own video preview) + "Waiting for patient — Resend link" affordance |
| `live` | `<VideoRoom>` / `<VoiceConsultRoom>` / `<TextConsultRoom>` (the three room components, picked by `appointment.consultation_type`) |
| `ended` | `<CallPostCallSummary>` + `<ConsultArtifactsPanel>` + "View conversation" link |
| `terminal` | Empty state: "Appointment cancelled / no-show. Reschedule?" + reschedule CTA |

The `ConsultationLauncher`'s session-lifecycle state (token / room name / patient join URL / companion text channel) was previously held inside `<AppointmentDetailWorkArea>`. cockpit-3 mounts `ConsultationLauncher` inside the `ready` and `lobby` branches so its existing rehydrate-on-refresh logic continues to work; it does NOT rewrite that logic.

**Estimated time:** ~5h. ~30min spec read + grep, ~4h impl, ~30min smoke.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-2](./task-cockpit-2-shell.md) shipped with the placeholder center pane.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for the whole task. The state-machine truth table is locked in cockpit-1; the room components already exist; this task is plumbing.

**Why no Opus design call:** the architectural decisions are made in cockpit-1 + cockpit-2. State branches are mechanical: "if state===live, render rooms; if state===ended, render summary". Sonnet handles cleanly.

**Escalate per-message to Opus** if you discover that `ConsultationLauncher` mounting twice (once in cockpit-3, once still in old `AppointmentDetailWorkArea`) causes a double session-create. The clean fix is to delete `AppointmentDetailWorkArea` early — but that's cockpit-4's job. If this surfaces, escalate one Opus message: *"Should we accelerate `AppointmentDetailWorkArea` deletion into cockpit-3 or keep it in cockpit-4?"*

**New chat?** **Yes — fresh Sonnet chat.** Pre-load: this task file + cockpit-1's state machine module + cockpit-2's `ConsultationCockpit.tsx` + the three room components (`VideoRoom`, `VoiceConsultRoom`, `TextConsultRoom`).

**Lane stitching:** lane α-1 (cockpit-2) → α-2 (cockpit-3) is the natural place to **stitch the chat** (i.e. continue in the same Cursor chat) IF the cockpit-2 diff was small. Heuristic: if cockpit-2's diff > 300 lines or > 4 turns, cut the chat. Otherwise stitch — the context is genuinely shared.

**Composer-OK sub-steps:** none. (cockpit-4 has the file delete; cockpit-3 doesn't.)

---

## Acceptance criteria

### Center pane state branches

- [ ] **`ready` branch:** New component `<ReadyCard appointment token />` that renders:
  - A small "Ready to start" header
  - The existing `ConsultationLauncher` (verbatim — its modality buttons + patient join link preview)
  - A scheduling summary (date, modality, duration if any)
  - **No tab system.** This is one card.

- [ ] **`lobby` branch:** Renders the same `ConsultationLauncher` as `ready` (it handles the rehydrate). Adds a top banner: *"Waiting for patient — they were sent the join link X minutes ago. [Resend link]"* — the resend handler already exists in `ConsultationLauncher` (`handleResendLink`); cockpit-3 surfaces a button that calls into it. (If the existing API doesn't expose the resend handler outward, expose it via a render-prop or callback ref — small additive change to the launcher signature.)

- [ ] **`live` branch:** Picks the room by `appointment.consultation_type`:
  - `video` → `<VideoRoom ...>`
  - `voice` → `<VoiceConsultRoom ...>`
  - `text` → `<TextConsultRoom ...>`
  - `in_clinic` → renders the `ready` card (in-clinic has no tele-room; doctor uses Rx pane only).
  - **The room props (token, room name, companion channel)** come from `ConsultationLauncher`'s session state. Easiest path: keep mounting `ConsultationLauncher` and let it render its own `<LiveConsultPanel>` + room. cockpit-3 does NOT replicate the launcher's state machine; it just mounts the launcher in the appropriate states.

- [ ] **`ended` branch:**
  - `<CallPostCallSummary sessionId={...} bearerJwt={token} mountContext="cockpit-detail" />`
  - `<ConsultArtifactsPanel sessionId={...} token={token} callerRole="doctor" callerLabel="Doctor view" />`
  - `<Link href="/dashboard/appointments/<id>/chat-history">View conversation</Link>`
  - **Preserve the three Plan-07 / video-D1 JSDoc blocks verbatim** — they were carried into `ConsultationCockpit.tsx` by cockpit-2; cockpit-3 moves each block next to the surface it documents.

- [ ] **`terminal` branch:** A simple empty-state card: *"This appointment was cancelled / no-show. Use the kebab in the header to reschedule."* Centered, muted text. No CTA inside the pane (the kebab is in the header).

### Banner above the room (live)

- [ ] When state === `live`, render the existing `SessionStartBanner` if applicable. (Already integrated in `LiveConsultPanel`; if `ConsultationLauncher` mounts the panel, this is automatic — verify and don't double-mount.)

### `ConsultationLauncher` mount discipline

- [ ] `ConsultationLauncher` mounts **at most once** in the cockpit. Wrap the decision in a small helper:

  ```ts
  function shouldMountLauncher(state: CockpitState): boolean {
    return state === "ready" || state === "lobby" || state === "live";
  }
  ```

  In `ended` / `terminal`, the launcher is unmounted (and its in-memory `liveSession` GC'd).

- [ ] Verify that `ConsultationLauncher`'s rehydrate effect (the `useEffect` at lines 203-259 + 285-329 in the existing file) still runs once on first mount. Do NOT add a parent state that toggles the launcher's mount key — that would defeat rehydrate.

### Behavior preservation

- [ ] Same Rx round-trip: open `pending` appointment → state === `ready` → start consult → state === `live` → write Rx in right pane → send → patient receives. **Smoke this end-to-end.**
- [ ] Refresh while `live`: `ConsultationLauncher`'s rehydrate kicks in; user lands back in the live room. (This is the existing `existingProviderSessionId` / `existingTextSessionId` rehydrate path.)
- [ ] All Plan-07 comments visible in source.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Token-only colors.

---

## Out of scope

- **Header / CTA / kebab.** That's cockpit-4.
- **Modality switching.** Existing `ModalityChangeLauncher` continues to work inside `LiveConsultPanel`; cockpit-3 doesn't add a second switcher.
- **Rx workspace internals.** Lane β. cockpit-3 may pass `state` and `disabled` props down to the right pane (so the Rx Send button is disabled when `state !== "live" && state !== "ended"`), but does not implement the workspace.
- **Deleting `AppointmentDetailWorkArea`.** cockpit-4 does this.

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/ReadyCard.tsx` (~80 LOC) — wraps `ConsultationLauncher` + scheduling summary
- `frontend/components/consultation/cockpit/EndedCard.tsx` (~120 LOC) — `<CallPostCallSummary>` + `<ConsultArtifactsPanel>` + chat-history link, with the three preserved JSDoc blocks
- `frontend/components/consultation/cockpit/TerminalCard.tsx` (~30 LOC)

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` — replace the `<CenterPanePlaceholder>` from cockpit-2 with a switch on `state` rendering the four cards above (lobby reuses `ReadyCard` with a banner prop).

**Deleted:** none.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why mount `ConsultationLauncher` (not its children directly) inside `ReadyCard`.** Its in-memory `liveSession` / `textSession` state is the reason refresh-during-live works without a backend round-trip every time. Replicating that state in the cockpit would be a regression.
2. **Why `lobby` reuses `ReadyCard`.** The launcher itself decides whether to render its modality buttons (pre-start) or its `<LiveConsultPanel>` (post-start). The cockpit's only job in `lobby` is to surface the "Resend link" hint — handled via a small banner prop into `ReadyCard`.
3. **Why no top-of-page launcher anymore.** The launcher LIVES inside the center pane now. The header CTA (cockpit-4) talks to it via a callback prop, not via being the launcher.
4. **What if `appointment.consultation_type` is `in_clinic`?** The page is technically usable (the doctor scrolls the chart + writes Rx) but there's no tele-room. cockpit-3's center pane shows the `ready` card with a tweaked label *"In-clinic visit — start when patient arrives."* The Rx pane is fully functional.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane α](../plan-cockpit-redesign-batch.md#lane-α--cockpit-core-4-tasks-14h-sequential)
- **Hard dep:** [task-cockpit-2-shell.md](./task-cockpit-2-shell.md)
- **Existing surfaces reused:** `ConsultationLauncher`, `VideoRoom`, `VoiceConsultRoom`, `TextConsultRoom`, `CallPostCallSummary`, `ConsultArtifactsPanel`, `LiveConsultPanel`.
- **State helper:** `frontend/lib/consultation/cockpit-state.ts` (cockpit-1).

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
