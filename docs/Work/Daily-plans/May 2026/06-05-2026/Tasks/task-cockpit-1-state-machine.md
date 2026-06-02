# Task cockpit-1: Consultation state machine helper

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane α (prerequisite) — **XS, ~2h**

---

## Task overview

The cockpit center pane needs to render exactly one of five states at any time: `ready`, `lobby`, `live`, `ended`, `terminal`. Today the same logic is scattered across `AppointmentDetailWorkArea.tsx` (`hasSession / sessionEnded / sessionLive / consultationStarted`), `ConsultationLauncher.tsx` (`canStartConsultation` / `existingProviderSessionId` / `existingTextSessionId`), and the page header CTA derivation. Three call-sites compute slightly different views of the same truth.

This task **centralises** that derivation into one pure helper module so every cockpit pane reads from the same source of truth. No UI here. Just a function + a small test suite.

**Estimated time:** ~2h. ~30min Opus design, ~1h Sonnet impl + tests, ~30min review.

**Status:** Shipped (2026-05-06).

**Hard deps:** none.

**Source:** new — this batch's foundation.

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the design turn (state enumeration + transition rules), then **Sonnet 4.6 Medium** for impl + tests. Pattern B from the efficiency guide.

**Why Opus for design:** the state space sounds simple but has edge cases — text sessions return `provider_session_id=null` (so the legacy "started?" check is wrong for text), `cancelled` appointments may still have a session row, walk-ins have no `patient_id`. One careful Opus turn nails the truth table; Sonnet then types it out.

**New chat?** **Yes — split into two:**

1. **Opus design chat (~30min, Plan Mode):**
   - Pre-load: this task file + `frontend/types/appointment.ts` + `frontend/components/consultation/ConsultationLauncher.tsx` (lines 100–200) + `frontend/components/consultation/AppointmentDetailWorkArea.tsx` (lines 60–130).
   - Ask: *"Define the 5-state machine `ready / lobby / live / ended / terminal` from `appointment.status` × `consultation_session.{status, modality, provider_session_id}`. Output a truth table covering: confirmed×no_session, confirmed×live, confirmed×ended, pending×live, completed×ended, cancelled×any, no_show×any. Flag every edge case (text session with `provider_session_id=null`, walk-in with `patient_id=null`)."*
   - Lock the truth table before chat 2.

2. **Sonnet impl chat (~1h):**
   - Pre-load: this task file + the locked truth table.
   - Implement `lib/consultation/cockpit-state.ts` per the locked spec + write the unit-test file.

**Estimated turns:** 1 Opus design + 2–3 Sonnet impl turns.

**Lane α prerequisite — this task gates everything else.** Do not start cockpit-2, cockpit-5, cockpit-6, or cockpit-8 until this lands.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### Module surface

- [ ] New file `frontend/lib/consultation/cockpit-state.ts` exports:

  ```ts
  export type CockpitState =
    | "ready"      // confirmed/pending, no live session yet
    | "lobby"      // session row exists, status=live, but consultation hasn't started in earnest (e.g. patient hasn't joined)
    | "live"       // session active and joined
    | "ended"      // session.status=ended (recordings/transcripts available)
    | "terminal";  // appointment cancelled / no_show, no actionable session

  export interface CockpitStateInput {
    appointmentStatus: AppointmentStatus;
    session: ConsultationSessionSummary | null | undefined;
  }

  export function deriveCockpitState(input: CockpitStateInput): CockpitState;
  ```

- [ ] Function is **pure** (no side-effects, no hooks). Trivially memoisable.

- [ ] Function is **total** — every (status, session) combination resolves to exactly one state. No `undefined` returns.

### Truth table (locked by Opus design pass — impl chat treats as non-negotiable)

| `appointment.status` | `session?.status` | `session.provider_session_id` (video/voice) OR `session.id` (text) | → State |
|---|---|---|---|
| `pending` / `confirmed` | absent / null | n/a | `ready` |
| `pending` / `confirmed` | `live` | absent (text session, no provider yet) | `lobby` |
| `pending` / `confirmed` | `live` | present | `live` |
| `pending` / `confirmed` | `ended` | n/a | `ended` |
| `pending` / `confirmed` | `cancelled` / `no_show` | n/a | `terminal` |
| `completed` | absent / null | n/a | `ended` (post-call view; no session row but visit completed) |
| `completed` | `ended` | n/a | `ended` |
| `completed` | `live` | n/a | `live` (defensive — may happen briefly during state flip) |
| `cancelled` | absent / null | n/a | `terminal` |
| `cancelled` | any | n/a | `terminal` (the appointment trumps the session) |
| `no_show` | any | n/a | `terminal` |

The `lobby` vs `live` discriminator (`provider_session_id` for video/voice; presence of `session.id` for text) matches the existing logic in `ConsultationLauncher.tsx:153-157` + `:281-283`.

### Helpers (also in the same module)

- [ ] `canSendPrescription(state: CockpitState): boolean` — `true` only for `live` and `ended`. (Used by Rx workspace's `Send to patient` button gate.)
- [ ] `canEditPrescriptionDraft(state: CockpitState): boolean` — `true` for `ready`, `lobby`, `live`. `false` for `ended` (read-only) and `terminal` (no Rx pane).
- [ ] `shouldShowChartRail(state: CockpitState, hasPatientId: boolean): boolean` — `false` if `!hasPatientId` (walk-in), else `true` for all states.
- [ ] `primaryCtaFor(state, modality)` returning `{ label, action }` mapped to:
  - `ready` → `{ label: "Start consult", action: "start" }`
  - `lobby` → `{ label: "Resend join link", action: "resend" }`
  - `live` → `{ label: "End consult", action: "end" }`
  - `ended` → `{ label: "Send follow-up Rx", action: "draft-followup" }`
  - `terminal` → `{ label: "Reschedule", action: "reschedule" }`

### Tests

- [ ] New file `frontend/lib/consultation/__tests__/cockpit-state.test.ts`.
- [ ] Covers all 11 rows of the truth table above. Each row → 1 test case asserting the resulting `CockpitState`.
- [ ] 4 helper tests: `canSendPrescription`, `canEditPrescriptionDraft`, `shouldShowChartRail`, `primaryCtaFor` for each state.
- [ ] Run with the existing test runner (whatever `cd frontend && npm run test` resolves to today). If no test infra exists for this folder yet, **flag it in the chat and stop** — do NOT add a new test framework as part of this task.

### General

- [ ] Type-check + lint clean.
- [ ] No imports from `react`, `next`, or any UI lib — this is a pure helper.
- [ ] JSDoc on every export, with a one-line summary of which state each helper drives.

---

## Out of scope

- **Rendering anything.** No JSX. cockpit-2/3 consume this helper.
- **Removing the legacy logic** in `AppointmentDetailWorkArea` / `ConsultationLauncher`. Their consumers are deleted in cockpit-2/4; we don't pre-emptively rewrite them here.
- **`patient_id` derivation.** Walk-in detection lives in cockpit-2's shell logic; this helper exposes `shouldShowChartRail(state, hasPatientId)` and the caller passes `hasPatientId`.
- **Modality switching.** That's a separate flow (`ModalityChangeLauncher`); this state machine doesn't model it.

---

## Files expected to touch

**New:**
- `frontend/lib/consultation/cockpit-state.ts` (~120 LOC)
- `frontend/lib/consultation/__tests__/cockpit-state.test.ts` (~80 LOC)

**Modified:** none.

**Deleted:** none.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **`completed` × `live` quirk.** This is the one row where the truth table maps a status combination that "shouldn't happen" — appointment marked completed while session still live. Defensively map to `live` (the session is the more granular truth). One Opus thinking turn confirmed.
2. **Why `lobby` is its own state.** The doctor pre-call (waiting for patient to join) is qualitatively different from `live` — the room shell mounts but no patient is there. The header CTA reads `Resend join link` instead of `End consult`. Worth the extra state.
3. **Why `terminal` exists.** `cancelled / no_show` should hide the Rx pane entirely; rendering an editable Rx form for a cancelled appointment is a footgun. `terminal` makes the gate explicit.
4. **Why text vs video session check differs.** Text sessions don't get a `provider_session_id` (no Twilio room); they're keyed off `session.id` + `session.modality === "text"`. The existing rehydrate code in `ConsultationLauncher.tsx:276-283` already handles this; we lift the same predicate.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane α](../plan-cockpit-redesign-batch.md#lane-α--cockpit-core-4-tasks-14h-sequential)
- **Execution order:** [EXECUTION-ORDER-cockpit.md § Parallel-chat lane matrix](./EXECUTION-ORDER-cockpit.md#parallel-chat-lane-matrix-the-multi-tasking-workflow)
- **Existing legacy logic to consolidate:**
  - `frontend/components/consultation/AppointmentDetailWorkArea.tsx:60-130`
  - `frontend/components/consultation/ConsultationLauncher.tsx:151-160, 276-283`
- **Cost-aware model strategy — Pattern B (split design / impl):** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § Pattern B](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-b-new-feature--no-spec-yet)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
