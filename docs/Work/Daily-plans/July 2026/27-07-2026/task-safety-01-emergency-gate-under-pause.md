# SAFETY-01: Emergency gate never evaluates while the receptionist is paused

**Severity:** High (patient safety, shipped code)  
**Status:** ✅ Fixed 2026-07-27  
**Model gate:** Opus recommended for review; implemented as a bounded reorder + tests

## Summary

When a doctor had `instagram_receptionist_paused = true`, an acute emergency DM
from a patient received the pause boilerplate instead of the emergency safety
message. The emergency gate was never evaluated.

## Root cause

`executeDmTurn` evaluated `HEAD_CONTROL_GATES` (revoke + paused) first and
returned early. `EMERGENCY_CONTROL_GATES` ran only if head gates did not fire.
`receptionistPausedGate.fires` had no safety carve-out, so any message to a
paused doctor short-circuited before emergency.

## Fix

Reorder DL-2 head chain to:

```
revoke_consent → emergency_safety → receptionist_paused → stage routing
```

- `CONTROL_GATES` / `HEAD_CONTROL_GATES` = revoke → emergency → paused
- `executeDmTurn` evaluates `HEAD_CONTROL_GATES` once (no separate emergency pass)
- In-collection suppression of non-acute `emergency` intent unchanged

## Tests

- `dm-control-gates.test.ts` — order + paused×emergency matrix
- `handle-turn.test.ts` — pipeline: acute emergency preempts pause; non-emergency pause unchanged
- `dm-stage-router.test.ts` — order pin updated

## Out of scope

Comment surfaces (no emergency path today). Per-conversation handoff / doctor reply.
