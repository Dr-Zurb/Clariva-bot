# Cockpit hardening — Execution order (authoritative)

**Status:** Drafted — ready to execute. All 5 fixes in `Drafted` state.  
**Last doc sync:** 2026-05-06  
**Owner:** TBD  
**Scope:** 5 post-ship fixes for the cockpit redesign batch  
**Total estimate:** ~5h serial · ~3h with 3 parallel chats  
**Parent batch plan:** [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md)  
**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## TL;DR — read before you touch any task

1. **fix-1 has no deps and is trivially Composer-grade.** Ship it first; it makes the Rx pane visible immediately and is a 5-line edit.
2. **Fixes split into 3 disjoint-file lanes** (H1 / H2 / H3) that can run as **3 parallel chats**.
3. **Architectural locks K-H1..K-H5 are in [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md#architectural-locks-from-the-opus-design-pass)** — impl chats treat them as non-negotiable.
4. **One topic per chat.** Each task file's `## Model & execution guidance` block tells you what to pre-load.

---

## Pre-flight

```
- [ ] Cockpit redesign batch (cockpit-1..8) has been deployed to dev. The current
      page renders chart-rail + center-pane + Rx-PLACEHOLDER (dashed border) per
      the screenshots taken 2026-05-06.
- [ ] Frontend type-check + lint clean BEFORE starting:
      cd frontend && npx tsc --noEmit && npx next lint
- [ ] A live text or video appointment exists in dev for smoke-testing the
      side-by-side experience.
```

---

## Parallel-chat lane matrix

Three lanes; engineered so each touches disjoint files. Run the three Cursor chats side-by-side.

| Lane | Window title | Tasks | Files owned exclusively | Wait-on |
|---|---|---|---|---|
| **H1** (Rx wiring) | "H1 — wire Rx" | fix-1 | `frontend/components/consultation/ConsultationCockpit.tsx` (only this file) | none |
| **H2** (Launcher cleanup) | "H2 — launcher cleanup" | fix-2 → fix-4 → fix-5 | `frontend/components/consultation/ConsultationLauncher.tsx`, `frontend/components/consultation/cockpit/CockpitHeader.tsx`, `frontend/components/consultation/cockpit/ReadyCard.tsx` (where it mounts the launcher) | none |
| **H3** (Room compact) | "H3 — room cockpit mode" | fix-3 | `frontend/components/consultation/VideoRoom.tsx`, `frontend/components/consultation/VoiceConsultRoom.tsx` | none |

**Why H1 owns ConsultationCockpit.tsx and H2 doesn't:** fix-2 makes the launcher mode-aware via its **own internal** logic — H2 never edits the cockpit. fix-4 (imperative handle) needs the cockpit to call `launcherRef.current?.start(...)` from the header — the **header** is owned by H2 (`CockpitHeader.tsx`); the **ref creation in the cockpit** is a single 3-line addition that H1 does at the end of its turn (after fix-1) OR H2 does at the end of fix-4. Either lane can land it; the loser swallows the small edit. **H1 is recommended** because it ships first and the file is already open in that chat.

**No-collision guarantees:**
- H1 and H3 never see `ConsultationLauncher.tsx`.
- H2 and H3 never see `ConsultationCockpit.tsx` (except for the 3-line ref-creation at the end of fix-4 if H1 hasn't done it).
- H2 and H1 never see `VideoRoom.tsx`.

**Suggested wall-clock plan (solo dev with 3 chats):**

```
T+0h    Chat H1: fix-1 (Composer, 10 min)
        → Rx pane is now visible; "Cockpit state" debug chip removed.
T+0h    Chat H2: fix-2 (Sonnet, 30 min)
        → launcher pre-call UI hidden during live state.
T+0h    Chat H3: fix-3 (Sonnet, 3h — the long pole)
        → VideoRoom mode="cockpit" with locked design.

T+0.5h  Chat H2 continues: fix-4 (Sonnet, 1h)
        → real ref-based wiring; querySelector hack removed.
T+1.5h  Chat H2 continues: fix-5 (Sonnet, 30 min)
        → patient join link gated on remote-participant presence.

T+3h    Chat H3 ships fix-3.
T+3h    Close-gate Opus review (1h) — done.
```

**Solo serial:** ~5h. **Solo with 3 parallel chats:** ~3h wall-clock.

---

## Model-tier glossary

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

| Tier | Label | Use for |
|---|---|---|
| 1 | **Opus** | None during impl — design was done up-front in the parent plan. Reserve only for the close-gate review. |
| 2 | **Sonnet** | fix-2, fix-3, fix-4, fix-5. The default workhorse. |
| 3 | **Codex** | Sonnet alternative for fix-3 if you want to compare. |
| 4 | **Composer** | fix-1 only — pure import-line replacement. |

---

## Execution table

### Lane H1 — Rx wiring (1 task, ~10min)

| Step | Task | Effort | Hard deps | Recommended model | New chat? |
|---|---|---|---|---|---|
| H1-1 | [fix-1 — wire `RxWorkspace`](./task-cockpit-fix-1-wire-rx-workspace.md) | XS (~10min) | none | **Composer 2 Fast** | Yes |

### Lane H2 — Launcher cleanup (3 tasks, ~2h, sequential within lane)

Same file (`ConsultationLauncher.tsx`); cut the chat at task boundaries OR stitch if context fits in <300 lines.

| Step | Task | Effort | Hard deps | Recommended model | New chat? |
|---|---|---|---|---|---|
| H2-1 | [fix-2 — launcher mode-aware](./task-cockpit-fix-2-launcher-mode-aware.md) | S (~30min) | none | **Sonnet** | Yes |
| H2-2 | [fix-4 — launcher imperative handle](./task-cockpit-fix-4-launcher-imperative-handle.md) | S (~1h) | fix-2 (clean reference state) | **Sonnet** | Yes (or stitched after H2-1 if diff is small) |
| H2-3 | [fix-5 — hide patient join link](./task-cockpit-fix-5-hide-join-link.md) | S (~30min) | fix-2 | **Sonnet** | Yes |

### Lane H3 — Room cockpit mode (1 task, ~3h)

| Step | Task | Effort | Hard deps | Recommended model | New chat? |
|---|---|---|---|---|---|
| H3-1 | [fix-3 — `mode="cockpit"` on VideoRoom / VoiceConsultRoom](./task-cockpit-fix-3-room-cockpit-mode.md) | M (~3h) | none — design fully locked in the spec | **Sonnet** with the locked design pre-loaded | Yes |

---

## Per-lane close gates

**Lane H1:** Rx pane renders `<RxWorkspace>` (real component) instead of the dashed-border placeholder. No "Cockpit state: live" chip anywhere. `rg "Rx workspace — wired in cockpit-5"` returns zero matches.

**Lane H2:**
- `ConsultationLauncher` does NOT render its 3 modality buttons during `live`. Smoke: start a video consult, observe header strip + buttons disappear once `liveSession` is set.
- `rg "data-cockpit-(start|end)-btn"` returns zero matches; `rg "document.querySelector" frontend/components/consultation/ConsultationCockpit.tsx` returns zero matches.
- `<PatientJoinLink>` hidden once `remoteParticipant` is present. Smoke: open the consult on doctor + patient sides; once patient connects, link disappears for the doctor.

**Lane H3:**
- `<VideoRoom mode="cockpit">` renders the compact set listed in K-H3..K-H5.
- Default mount of `<VideoRoom>` (e.g. patient-side `/consult/join`) is unchanged.

---

## Whole-batch close gate

See [plan-cockpit-hardening-batch.md § Whole-batch acceptance gate](../plan-cockpit-hardening-batch.md#whole-batch-acceptance-gate). One Opus chat, paste full diff, grade against the checklist + K-H1..K-H5.

---

## Cost calibration

| Phase | Opus | Sonnet | Composer |
|---|---|---|---|
| H1 | 0 | 0 | 1 |
| H2 (3 fixes) | 0 | 3–5 | 0 |
| H3 | 0 | 3–4 | 0 |
| Close-gate | 1 | 0 | 0 |
| **Totals** | **1** | **6–9** | **1** |

**Red flag:** if H3 takes >2 chats, **stop**. The design is locked in the task file — extra chats indicate the lock isn't being followed. Re-paste the locked-design section as the first message of the new chat.

---

## References

- **Parent batch plan:** [plan-cockpit-hardening-batch.md](../plan-cockpit-hardening-batch.md)
- **Original cockpit redesign:** [plan-cockpit-redesign-batch.md](../plan-cockpit-redesign-batch.md)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- **Style precedent:** [EXECUTION-ORDER-cockpit.md](./EXECUTION-ORDER-cockpit.md) — same parallel-chat-lane structure.

---

**Created:** 2026-05-06.  
**Status:** `Drafted` — ready to execute.
