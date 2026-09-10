# Task rxl-13: Server-side 15-minute window

> **Model: Opus (max thinking). Auto must not run this task.** Deliberately weakens the Phase 2 enforcement boundary.

---

## 📋 Task Overview

Relax the Phase 2 guard by exactly 15 minutes. An attested prescription accepts content writes while it is within the window measured from its attest stamp, and refuses them afterwards. Fixed, non-rolling, computed on the server.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~4 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-12`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — narrows an existing refusal; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `rxl-06` — refuses all content writes to an attested prescription, with a typed error.
- ✅ `rxl-12` — snapshot on first post-attest edit. **This must be in place first** or the window would permit untraced edits, breaching RXL-DL-8.
- ✅ `config/env.ts` — the only permitted route to configuration.
- ❌ No notion of a window anywhere.
- ⚠️ The client's autosave is debounced, so a legitimately-started save can arrive slightly after the boundary. A hard cut at exactly 15:00.000 server-side would discard the doctor's last keystrokes.

**Scope Guard:** ≤ 5 files. Server only — the countdown and the read-only flip are `rxl-14`. Do not make the window rolling, per-doctor configurable, or extendable. Do not touch the snapshot mechanism.

**Reference:** product plan RXL-DL-7, RXL-DL-8 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-12` merged **and** its snapshot tests green. If snapshots are not proven, **STOP** — RXL-DL-8 forbids opening the window first.
- [ ] 1.2 Re-read the `rxl-06` guard so the window narrows one condition rather than adding a parallel path.

### 2. The window
- [ ] 2.1 Measured from the attest stamp. Fixed duration. Never recomputed from the last edit.
- [ ] 2.2 Computed server-side from server time. No client-supplied timestamp participates in the decision.
- [ ] 2.3 The duration comes from `config/env.ts` with the agreed default. **Never** read `process.env` directly (agent contract).
- [ ] 2.4 A small tolerance for a save that was legitimately started before expiry, sized and justified in Notes. This is not an extension of the window; it is acknowledgement that a debounced request takes time to arrive.
- [ ] 2.5 Ambiguity refuses: unknown or null stamp, unreadable clock, or a missing snapshot when one should exist.
- [ ] 2.6 Historical null-stamp rows keep the `rxl-06` fallback behaviour. The window does not silently open them.

### 3. The response
- [ ] 3.1 A refusal after expiry must be distinguishable by the client from other failures, so `rxl-14` can flip to read-only rather than showing a generic error.
- [ ] 3.2 Expose enough for a client to render a countdown without guessing — the deadline, not a duration the client has to add to its own clock.

### 4. Verification
- [ ] 4.1 Edit at minute 14 accepted.
- [ ] 4.2 Edit at minute 16 refused — **with a client whose clock claims minute 2**. This is the test that matters.
- [ ] 4.3 Editing at minute 5 and again at minute 14 does not extend the window past its original deadline.
- [ ] 4.4 A save started at 14:59 and arriving just after expiry is honoured within the tolerance; one starting after expiry is not.
- [ ] 4.5 Null-stamp historical row behaves as under `rxl-06`.
- [ ] 4.6 `tsc` + lint clean; backend suites green.

---

## 📁 Files

```
UPDATE: backend/src/services/prescription-service.ts (narrow the guard)
UPDATE: backend/src/config/env.ts (window duration)
UPDATE: backend/src/types/prescription.ts (deadline on the response)
UPDATE: docs/Reference/engineering/architecture/CONTRACTS.md (distinguishable expiry state)
UPDATE/CREATE: backend tests (boundary, lying clock, non-rolling, tolerance, null stamp)
```

**Existing Code Status:**
- ⚠️ `prescription-service.ts` — EXISTS; `rxl-06`'s guard needs narrowing, not supplementing
- ✅ `config/env.ts` — EXISTS (the only permitted config route)

**When updating existing code:**
- [ ] Audit the guard and every caller that handles its error — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Remove the unconditional refusal rather than leaving both paths reachable
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Server time only.** A stale tab, a skewed laptop clock, or a crafted request must not be able to buy a minute. This is the entire reason the window is enforced here rather than in the UI.
- **Non-rolling.** Recomputing from the last edit lets a note stay open indefinitely by touching it every fourteen minutes, which defeats the point of a boundary.
- **Fail closed.** Every ambiguous case refuses. A window that opens on uncertainty is worse than no window, because the record then contains untraced edits.
- Never read `process.env` directly — use `config/env.ts` (agent contract).
- Throw typed `AppError` subclasses, never raw `Error` (agent contract).
- Do not add a per-doctor setting. RXL-DL-7 fixes the duration deliberately; a configurable clinical-record boundary is a policy decision, not a preference.
- No PHI in logs; the refusal log line carries ids and timing only.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes** — narrows a write guard on a PHI table. No schema or RLS change. **RLS verified unchanged?**
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Minute-14 accepted, minute-16 refused, with an untrusted client clock.
- [ ] Window provably non-rolling.
- [ ] Tolerance honours only saves started before expiry.
- [ ] Ambiguity refuses in every case listed in 2.5.
- [ ] Expiry is distinguishable in the response contract (see [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md))
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 📝 Notes

Record at implementation time: the tolerance chosen and why, and confirmation that no client-supplied time participates in the decision.

---

## 🔗 Related Tasks

- [`task-rxl-12-snapshot-and-revision-bump.md`](./task-rxl-12-snapshot-and-revision-bump.md) — hard dependency (RXL-DL-8)
- [`task-rxl-14-window-ui.md`](./task-rxl-14-window-ui.md) — consumes the deadline and the expiry state
- [`task-rxl-06-attest-and-write-guard.md`](../../p2-append-notes/Tasks/task-rxl-06-attest-and-write-guard.md) — the guard being narrowed

---

**Last Updated:** 2026-08-31
**Completed:** —
