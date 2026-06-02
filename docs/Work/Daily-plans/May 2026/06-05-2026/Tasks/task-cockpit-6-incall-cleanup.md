# Task cockpit-6: Strip the in-call Rx slide-over

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane γ (parallel any time after cockpit-1) — **S, ~3h**

---

## Task overview

Today there are TWO Rx surfaces:

1. The page-level Rx (lives in the Prescriptions tab today; will live in the cockpit right column after lane β).
2. An **in-call** Rx that opens via a FAB → side overlay → tabbed `<InCallChartRxTabs>` (chart + Rx). Mounted by `VideoRoom` and `VoiceConsultRoom`.

Once the cockpit puts Rx on screen permanently, the in-call duplicate is redundant — and worse, opens an overlay that hides the patient video. This task **deletes the in-call Rx surface entirely** while keeping the FAB for `Schedule follow-up` and `Invite participant` (which still need overlays — there's no place to inline them).

**What gets deleted:**
- `frontend/components/ehr/InCallChartRxTabs.tsx` (file delete)
- The `"rx"` `QuickAction` from `InCallQuickActions`
- The `<InCallActionPanel>` mounting branch in `VideoRoom` / `VoiceConsultRoom` for the `"rx"` route

**What stays:**
- `InCallActionPanel` itself (still used for Schedule + Invite overlays)
- `InCallQuickActions` FAB with `Schedule` + `Invite` (+ the greyed `Labs` / `Consent` placeholders)

Lane γ is **fully independent** of lanes α / β / δ. Can run any time after cockpit-1 ships.

**Estimated time:** ~3h. ~2h Sonnet impl, ~30min Composer for the file delete + import audit, ~30min smoke.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-1](./task-cockpit-1-state-machine.md) shipped (the cockpit will provide the always-on Rx pane; lane γ is the cleanup that assumes that pane exists).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for the impl. **Composer 2 Fast** for the file delete + import audit at the end.

**Why no Opus:** removal is mechanical. The risk is missing an import; that's a Composer-grade audit.

**New chat?** **Yes — own chat for lane γ.** Pre-load: this task file + `frontend/components/consultation/InCallQuickActions.tsx` + the relevant `<InCallActionPanel>` mount sites in `VideoRoom.tsx` and `VoiceConsultRoom.tsx` (use the lines that mention `quick-action-rx` / `InCallChartRxTabs`).

**Multi-chat coordination:** none. γ is in its own world.

**Composer turn at the end:** *"Delete `frontend/components/ehr/InCallChartRxTabs.tsx`. Audit imports — there should be zero remaining. Run `cd frontend && npx tsc --noEmit && npx next lint` to confirm."*

---

## Acceptance criteria

### Quick actions FAB

- [ ] `frontend/components/consultation/InCallQuickActions.tsx`:
  - Remove the `"rx"` `QuickAction` literal from the type union: `export type QuickAction = "schedule" | "invite";`.
  - Remove the "Send prescription" menu item from the JSX.
  - Keep `Schedule follow-up` and `Invite participant` items.
  - Keep the greyed-out `Labs` / `Consent` "soon" entries.
  - Update the FAB label / aria-label slightly: *"In-call quick actions"* (was "clinical actions menu") — minor copy.

### `VideoRoom` / `VoiceConsultRoom` cleanup

- [ ] In `frontend/components/consultation/VideoRoom.tsx` and `VoiceConsultRoom.tsx`, remove the conditional that mounts `<InCallActionPanel>` for the `"rx"` route:
  - Find the `if (panelAction === "rx")` (or equivalent) branch.
  - Delete the branch + its `<InCallChartRxTabs>` import + the JSX.
  - Keep the panel mounting branches for `"schedule"` and `"invite"`.

- [ ] Verify the `panelAction` state type narrows to `"schedule" | "invite" | null` after the removal.

### File delete

- [ ] **Delete** `frontend/components/ehr/InCallChartRxTabs.tsx`.
- [ ] Run `rg "InCallChartRxTabs"` — should return zero matches.
- [ ] Run `rg "quick-action-rx"` — should return zero matches.
- [ ] Run `rg "Send prescription"` inside `frontend/components/consultation/` — should return only the cockpit-5 / Rx-pane usages (or none).

### Behavior preservation

- [ ] During a live call, the FAB still opens; `Schedule follow-up` still launches the existing `<FollowUpInlineBooker>` flow inside `<InCallActionPanel>`; `Invite participant` still opens the existing 3-way invite panel.
- [ ] No regression in the recording / transcripts / chat companion paths.
- [ ] The doctor can still write Rx — but they do so in the **cockpit Rx pane** (lane β), not in an overlay.

### Integration smoke

- [ ] Open a video call appointment in the cockpit. The Rx pane is visible on the right. The FAB is bottom-right of the video. Click FAB → only Schedule + Invite (no Rx). Click `Schedule follow-up` → overlay opens with booker. Close.
- [ ] Confirm with `cd frontend && npx tsc --noEmit && npx next lint` — clean.

### General

- [ ] No console errors.
- [ ] No console warnings about removed imports.
- [ ] Token-only colors (cleanup pass on any leftover raw classes in `InCallQuickActions.tsx`).

---

## Out of scope

- **The cockpit Rx pane itself.** Lane β.
- **Restyling the FAB.** Cosmetic; lane γ is removal, not restyling.
- **Chart pane in-call.** The cockpit's left chart rail is already always-visible at `xl+`. Mid-call on small screens, cockpit-7 will provide a bottom-pill sheet for the chart. Lane γ does not duplicate that.
- **Re-adding "Order Labs" or "Request Consent".** They stay greyed out as today.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/InCallQuickActions.tsx` — remove `"rx"` action.
- `frontend/components/consultation/VideoRoom.tsx` — remove `"rx"` branch from action-panel mount.
- `frontend/components/consultation/VoiceConsultRoom.tsx` — same.

**Deleted:**
- `frontend/components/ehr/InCallChartRxTabs.tsx`.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why keep `InCallActionPanel`.** Schedule + Invite still need overlays — they don't fit on screen alongside the video grid + chart + Rx. The panel itself is fine; only its `"rx"` consumer is removed.
2. **Why remove now (not after cockpit-7).** The in-call Rx slide-over is a UX **footgun** while the cockpit Rx pane exists — doctors will open the overlay, lose the video, and not realize Rx is also available on the right pane. Removing early reduces confusion in the rollout.
3. **Walk-ins.** The deleted `InCallChartRxTabs` had a fallback for walk-ins (`!patientId` → bare `<PrescriptionForm>`). The cockpit Rx pane handles walk-ins via `PrescriptionForm`'s existing walk-in mode; nothing extra is needed in lane γ.
4. **`onPrescriptionSent`** callback in `<VideoRoom>` (which posted a `'rx_sent'` system banner into the chat) — does that still work? Yes — `<PrescriptionForm>`'s `onSent` prop is wired by lane β's `<RxWorkspace>` to call into the chat-banner handler **via a prop or context**. Verify by grep; if the chat-banner handler lived inside `VideoRoom` and was being passed down through `<InCallChartRxTabs>`, lane γ exposes it as a context provider OR adds an `onRxSent` callback prop on the cockpit and threads through. **If this path is non-trivial,** flag in lane γ chat and consider escalating to one Opus message; otherwise keep simple.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane γ](../plan-cockpit-redesign-batch.md#lane-γ--in-call-cleanup-1-task-3h-independent-of-αβ)
- **Hard dep:** [task-cockpit-1-state-machine.md](./task-cockpit-1-state-machine.md) (only because lane γ assumes the cockpit's Rx pane will exist; γ doesn't depend on cockpit-2/3 directly to ship — but should not ship before β to avoid a transient state where Rx is missing entirely)
- **Sibling:** [task-cockpit-5-rx-workspace.md](./task-cockpit-5-rx-workspace.md) (provides the always-on Rx pane that this cleanup assumes)
- **Files removed:** `InCallChartRxTabs.tsx`.

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
