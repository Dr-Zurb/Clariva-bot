# Task cockpit-7: Mobile bottom-sheet pills

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane α step 4 — **S, ~3h**

---

## Task overview

The cockpit's three-column layout collapses on mobile (≤768px) into a single scroll. cockpit-2 ships a stacked fallback (chart accordion → room → Rx form); cockpit-7 replaces that with the **bottom-pill UX**:

```
┌─────────────────────────────────┐
│  Header (compact)               │
├─────────────────────────────────┤
│                                 │
│         ROOM (full-width)       │ ← persistent — never unmounts
│                                 │
│                                 │
├─────────────────────────────────┤
│  ⚕ Chart (3)    📝 Rx (2)        │ ← persistent bottom pills
└─────────────────────────────────┘
```

Tapping `⚕ Chart` opens a `<Sheet>` from the bottom containing the existing `<PatientChartPanel layout="mobile">`. Tapping `📝 Rx` opens a `<Sheet>` containing the lane-β `<RxWorkspace>`. The room stays mounted in the background — calls don't drop when the doctor toggles either sheet.

**Estimated time:** ~3h.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-4](./task-cockpit-4-header.md) shipped (header is consolidated; mobile pills attach below it).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. The `<Sheet>` primitive shipped in A2; this is composition + a small persistent footer.

**No Opus design call.** Architecture decided: (1) sheets, not full-screen routes; (2) room never unmounts; (3) two pills only.

**New chat?** **Yes — fresh Sonnet chat.** Pre-load: this task file + cockpit-4's `ConsultationCockpit.tsx` + `frontend/components/ui/sheet.tsx`.

**Multi-chat coordination:** none. By the time cockpit-7 runs, every other lane is already shipped.

---

## Acceptance criteria

### Layout

- [ ] At `<lg` (≤1023px), `ConsultationCockpit` switches from the 3-column grid to a vertical layout:
  - Compact header at top (`CockpitHeader` from cockpit-4 — already responsive).
  - Room fills the viewport between header and bottom-pill bar.
  - Two pills fixed at `bottom-0`: `⚕ Chart (n)` and `📝 Rx (status)`. The `n` is allergy-count or section-count badge from `PatientChartPanel`; the Rx pill shows save status (e.g., "Saved", "Saving…", "Send Rx" when state allows).
- [ ] Pills are full-width split (50/50). Tap area ≥ 44pt.
- [ ] Bottom safe-area inset respected on iOS (`pb-[env(safe-area-inset-bottom)]`).

### Sheet behavior

- [ ] Tap `⚕ Chart` → opens `<Sheet side="bottom">` covering ~85vh. Body: `<PatientChartPanel layout="mobile">` (existing behaviour). Drag-to-close + tap-outside close enabled.
- [ ] Tap `📝 Rx` → opens `<Sheet side="bottom">` covering ~85vh. Body: `<RxWorkspace>` (lane β). Send button still gated by `state` (per K3).
- [ ] **Room stays mounted** when sheets open. Verify by starting a video / voice call, opening a sheet, and confirming the call doesn't drop. (For text rooms this is automatic; for video / voice it requires not unmounting `<VideoRoom>` / `<VoiceConsultRoom>`.)
- [ ] Only one sheet open at a time — opening one auto-closes the other (or chooses to layer; pick one and document).
- [ ] Sheets close on `Escape` and on a back-button press (where applicable).

### State integration

- [ ] If `state === "terminal"`, the Rx pill is hidden (no Rx pane).
- [ ] If `!appointment.patient_id` (walk-in), the Chart pill is hidden.
- [ ] If both pills are hidden, the bottom bar is removed entirely (room fills full viewport).

### Behavior preservation

- [ ] Desktop (≥1024px) UX from cockpit-2 / 3 / 4 is **unchanged**. cockpit-7 only adds mobile-specific behavior gated by a media query.
- [ ] No regression on existing chart / Rx flows on mobile.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Touch targets ≥ 44pt.
- [ ] Tested at 375 / 414 / 768 widths.

---

## Out of scope

- **Bottom-tab nav for the whole app.** That's `U5.5` from the parent UI redesign plan — different scope.
- **Re-implementing chart sections in mobile.** `PatientChartPanel layout="mobile"` already handles it.
- **Modality switching from mobile.** Same affordance as desktop (header CTA / `ModalityChangeLauncher`); no mobile-specific UX.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` — add mobile branch with `<Sheet>` + bottom pills.

**New (small, optional):**
- `frontend/components/consultation/cockpit/MobilePillBar.tsx` (~80 LOC) — extracted only if it makes the cockpit cleaner.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why two pills, not three (chart / room / rx).** The room is the room — it doesn't need a pill. Pills only toggle the side surfaces.
2. **Why Sheets (not full-screen routes).** Routes would unmount the room; that drops video calls. Sheets keep the room alive and let the doctor pop in/out of chart and Rx in seconds.
3. **Why 85vh height.** Chart is dense; full sheet feels claustrophobic; 85vh leaves a sliver of room peeking through so the doctor knows the call is still alive.
4. **Why the Rx pill shows "Send Rx" sometimes.** It's a hint that the doctor can send without opening the sheet — but tapping the pill always opens the sheet. The text is just a status pill, not a CTA. (If we want a one-tap send, that's a follow-up enhancement.)
5. **What about iPad / 1024–1279px tablet portrait.** Falls into the `lg` range from cockpit-2 (3 columns with narrow Rx). cockpit-7 only kicks in at `<lg`. Tablet portrait at 768px DOES hit `<lg` and gets the mobile UX — that's intentional; on portrait tablets the 3-col layout is too cramped.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane α](../plan-cockpit-redesign-batch.md#lane-α--cockpit-core-4-tasks-14h-sequential)
- **Hard dep:** [task-cockpit-4-header.md](./task-cockpit-4-header.md)
- **Reuses:** `<Sheet>` (A2), `<PatientChartPanel>` (existing), `<RxWorkspace>` (cockpit-5).
- **Strategic lock:** K6 from [plan-cockpit-redesign-batch.md § Strategic locks](../plan-cockpit-redesign-batch.md#strategic-locks-confirmed-by-user-2026-05-06-in-chat).

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
