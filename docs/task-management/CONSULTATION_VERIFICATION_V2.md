# Consultation Verification v2 — Payout Eligibility

**Purpose:** Update video consultation verification so doctors are paid only when they fulfil their role. Uses "who left first" + 1-minute rule to prevent doctor exploitation.

**Status:** Planning  
**Created:** 2026-03-23  
**Location:** [docs/Development/Daily-plans/March 2026/2026-03-23/](../Development/Daily-plans/March%202026/2026-03-23/)

---

## Summary

| Item | Detail |
|------|--------|
| **Scope** | Video consultations only (no in-clinic for now) |
| **Rule** | Doctor must not leave first before 1 minute; patient no-show or patient-left-first → pay doctor |
| **Tasks** | 4 (migration, env, participant-disconnected, tryMarkVerified) |
| **Est. Total** | ~4–5 hours |

---

## Strategy (Reference)

See [CONSULTATION_VERIFICATION_STRATEGY.md](./CONSULTATION_VERIFICATION_STRATEGY.md) for full scenario matrix and logic.

**One-line:** Doctor gets paid if they joined and either (a) patient never showed, (b) patient left first, or (c) doctor left first but both were in the room ≥ 60 seconds.

---

## Task List

1. [e-task-1: Migration — doctor_left_at, patient_left_at](../Development/Daily-plans/March%202026/2026-03-23/e-task-1-consultation-left-at-migration.md)
2. [e-task-2: Env MIN_VERIFIED default 60](../Development/Daily-plans/March%202026/2026-03-23/e-task-2-min-verified-60.md)
3. [e-task-3: Handle participant-disconnected](../Development/Daily-plans/March%202026/2026-03-23/e-task-3-participant-disconnected.md)
4. [e-task-4: Update tryMarkVerified logic](../Development/Daily-plans/March%202026/2026-03-23/e-task-4-try-mark-verified-who-left-first.md)

---

**Last Updated:** 2026-03-23
