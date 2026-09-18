# Task lvc-15: Phase 3 gate

**Program / Phase:** last-visit-context · Phase 3
**Status:** Implemented 2026-09-11 — residuals recorded; not Shipped
**Change Type:** Tests + docs

Prove a cockpit open fires one last-visit fetch (`last-visit-summary`), served from the queue-hover prefetch cache. `PreviousRxPopover` is gone. Carry-forward and vitals ghosts do not call `last-subjective` or `last-in-episode`.

First visit still renders nothing. Display still writes nothing.

Do not claim Shipped if repo-wide `tsc` / lint are dirty.

## Suites this sitting

| Proof | Where |
|---|---|
| Source: cockpit readers do not import last-subjective / last-in-episode / PreviousRxPopover | `lastVisitPhase3Gate.test.tsx` |
| Prefetch warms the summary; mount does not fetch again; carry + ghosts add no legacy call | same |
| First visit renders nothing; display is not dirty | same |
| Apply one complaint dirties | same |
| Summary stays appointment-scoped (LVC-Q2) | `last-visit-phase3-gate.test.ts` (backend) |

## Residuals

- `GET /prescriptions/last-subjective` and `GET /prescriptions/last-in-episode` still exist for non-cockpit callers.
- `PreviousRxSideSheet` still lists all prior Rx (`listPrescriptionsByPatient`) — browse-all, not last-visit.
- Test files still mock `getLastPrescriptionInEpisode` so older vitals suites do not hit the network.
- Repo-wide `tsc` / lint not claimed. Phase 3 is **not Shipped**.
- Program items already in tree (Repeat keyboard, LVC-DL-7/8 contrast) were not re-walked in a live OPD this sitting.
