# Task rxl-14: Countdown, live expiry flip, pending-save flush

---

## 📋 Task Overview

Tell the doctor how long they have, and hand the window back cleanly when it closes. A note that silently starts refusing writes at minute 16 while the form still looks editable would lose keystrokes at exactly the moment someone is correcting a dose.

The expiry race is the substance of this task: the Rx autosave is debounced, so a save triggered at 14:59 can arrive after the boundary. Flush before flipping.

**Program / Phase:** rx-lifecycle · Phase 3 (revise window)
**Batch:** [`plan-p3-rx-lifecycle-revise-window-batch.md`](../plan-p3-rx-lifecycle-revise-window-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md`](./EXECUTION-ORDER-p3-rx-lifecycle-revise-window.md)
**Estimated Time:** ~4 hours
**Status:** ⏳ **PENDING** (blocked on `rxl-13`)
**Completed:** —

**Change Type:**
- [x] **Update existing** — extends the Phase 1 lock module and the read-only banner; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ `rxl-01` — one lock gate the sections read from context, shaped so its input can be swapped.
- ✅ `rxl-02` — a static read-only banner, written deliberately without any mention of amending or a time window.
- ✅ `rxl-13` — server-side window, exposing a deadline and a distinguishable expiry state.
- ✅ `RxFormContext` — debounced autosave plus a persist step.
- ❌ The lock is evaluated at render time, so nothing flips when a deadline passes while the chart sits open.
- ❌ No countdown. No flush-on-expiry.
- ⚠️ Trusting the client clock for the **display** is acceptable; trusting it for the decision is not — the server already refuses. Drift should degrade gracefully, not permit an edit.

**Scope Guard:** ≤ 6 files, frontend only. Do not re-implement the window rule client-side as a second source of truth. Do not add an "extend" or "reopen" control. No new banner design language — extend `rxl-02`'s.

**Reference:** product plan RXL-DL-7 · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md)

---

## ✅ Task Breakdown

### 1. Pre-flight
- [ ] 1.1 `rxl-13` merged and the deadline is available on the prescription read. Else **STOP**.
- [ ] 1.2 Read `rxl-01`'s lock module and confirm the swap point it was built for.
- [ ] 1.3 Read the autosave scheduling to find where a pending save can be flushed deterministically.

### 2. The gate becomes time-aware
- [ ] 2.1 The lock resolves from the server-supplied deadline, not from a locally computed one.
- [ ] 2.2 It must change **on its own** when the deadline passes with the chart open — a timer, not a render-time check.
- [ ] 2.3 Clock drift degrades toward locked, never toward editable.

### 3. Expiry handling
- [ ] 3.1 On expiry: flush any pending save first, then flip read-only. Order matters.
- [ ] 3.2 A refusal carrying the expiry state from `rxl-13` flips the form read-only rather than surfacing a generic save error.
- [ ] 3.3 Any other save failure keeps its existing error behaviour. Do not swallow unrelated failures into "window closed".

### 4. Display
- [ ] 4.1 Remaining time, visible while the window is open, extending `rxl-02`'s banner.
- [ ] 4.2 On expiry the banner states the note is now locked.
- [ ] 4.3 Per RXL-Q6, an in-window edit that followed a delivery prompts a reprint. A prompt only — never an automatic resend.
- [ ] 4.4 Copy must not offer to extend or reopen. Nothing does.

### 5. Verification
- [ ] 5.1 Countdown renders and decrements while the window is open.
- [ ] 5.2 With the chart open across the deadline, the form flips read-only unprompted.
- [ ] 5.3 A keystroke at 14:59 is persisted, not lost. This is the acceptance test for the whole task.
- [ ] 5.4 A server refusal for expiry flips read-only; an unrelated failure still shows an error.
- [ ] 5.5 A skewed-forward client clock locks early rather than editing late.
- [ ] 5.6 Reprint prompt appears only after a delivery, and never resends by itself.
- [ ] 5.7 `tsc` + lint clean; cockpit suites green.

---

## 📁 Files

```
UPDATE: frontend/components/cockpit/rx/useRxLock.ts (time-aware, timer-driven)
UPDATE: frontend/components/cockpit/rx/RxFormContext.tsx (flush-on-expiry hook)
UPDATE: frontend read-only banner from rxl-02 (countdown + expired copy)
UPDATE: frontend/lib/api or the prescription read mapping (surface the deadline)
UPDATE/CREATE: frontend unit tests (fake timers: boundary, flush, drift, refusal mapping)
```

**Existing Code Status:**
- ⚠️ `useRxLock.ts` — EXISTS from `rxl-01`; needs the time dimension
- ⚠️ `RxFormContext.tsx` — EXISTS; needs a deterministic flush
- ⚠️ banner from `rxl-02` — EXISTS; extend, do not replace

**When updating existing code:**
- [ ] Audit the lock module's consumers before changing its shape — see [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)
- [ ] Map the flush to one deterministic path, not a best-effort timeout
- [ ] Update tests and docs per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **The server owns the rule; the client renders it.** Do not re-derive the window from a local duration constant — two sources of truth here means the UI eventually disagrees with what writes actually succeed.
- **Flush before flip.** Reversing the order loses the doctor's last correction, which is the single worst outcome this phase can produce.
- Degrade toward locked. If the deadline cannot be read, treat the note as locked and let the server be the arbiter.
- Do not conflate error states. Only the expiry state flips to read-only; a network failure is still a network failure.
- Copy makes no promise the system cannot keep: no extend, no reopen, no "ask admin".
- No PHI in logs or telemetry payloads (COMPLIANCE.md).
- Use fake timers in tests. A test that waits on real wall-clock time will be flaky in CI.

---

## 🌍 Global Safety Gate

- [ ] Data touched? **Yes — indirectly.** Changes when the client attempts a write. No schema or RLS change.
- [ ] PHI in logs? No.
- [ ] External API / AI? No.
- [ ] Retention? No.

---

## ✅ Acceptance & Verification Criteria

- [ ] Keystroke at 14:59 persisted.
- [ ] Form flips read-only on its own at the deadline.
- [ ] Countdown accurate and visible.
- [ ] Expiry refusal maps to read-only; other failures unchanged.
- [ ] Drift locks early, never edits late.
- [ ] Reprint is prompted, never automatic.
- [ ] Tests added per [TESTING.md](../../../../../../../Reference/engineering/development/TESTING.md)

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)

---

## 🔗 Related Tasks

- [`task-rxl-13-window-guard.md`](./task-rxl-13-window-guard.md) — supplies the deadline and expiry state
- [`task-rxl-02-read-only-affordance.md`](../../p1-lock-integrity/Tasks/task-rxl-02-read-only-affordance.md) — the banner being extended
- [`task-rxl-16-slip-edit-marker.md`](./task-rxl-16-slip-edit-marker.md) — what the reprint from 4.3 produces

---

**Last Updated:** 2026-08-31
**Completed:** —
