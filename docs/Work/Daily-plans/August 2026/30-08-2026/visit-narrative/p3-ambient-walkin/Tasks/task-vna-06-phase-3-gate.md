# Task vna-06: Erasure, consent-absence tests + Phase 3 gate

> **Filename:** `task-vna-06-phase-3-gate.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).
> **Model: Opus (max thinking). Auto must not run this task.**
> ⛔ **BLOCKED — needs `vna-05` green.** §0 is expected to STOP.
> 🔍 **Kind-of-work change: verify, don't build.** A feature added in this task is a scope breach.

---

## 📋 Task Overview

Close Phase 3 by proving the two claims the phase was allowed to exist on: **a patient who did not consent cannot be recorded**, and **a patient who asks to be erased actually is** — including the audio of their physical consultation.

Both proofs must be **standing CI tests**, not a one-time manual check. `vnt-05` set the precedent: `backend/tests/unit/migrations/224-visit-narrative-provenance-erasure.test.ts` parses the migration and simulates the FK so that any later migration loosening the erasure anchor fails the build. Copy that shape. A compliance property that is only true on the day it was verified is not a property.

**Program / Phase:** visit-narrative · Phase 3 (ambient walk-in)
**Batch:** [`plan-p3-visit-narrative-ambient-walkin-batch.md`](../plan-p3-visit-narrative-ambient-walkin-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md)
**Estimated Time:** ~4 hours
**Status:** ⛔ **BLOCKED — not started**
**Completed:** —

**Change Type:**
- [x] **New feature** — standing tests
- [x] **Update existing** — docs, plans, and the `tracks.md` L9 outcome

**Current State:** (checked against the codebase, 2026-08-31)
- ✅ **What exists:** the standing-test pattern — `backend/tests/unit/migrations/224-visit-narrative-provenance-erasure.test.ts` (`vnt-05`). It parses the migration SQL, asserts `ON DELETE CASCADE`, simulates the FK in memory, and asserts that later migrations do not loosen the anchor. Built this way because there is **no live Postgres in this environment** — no `psql`, no `DATABASE_URL`, no logged-in Supabase CLI.
- ✅ **What exists:** `recording-erasure-service.ts`, the recording archival worker, `account-deletion-worker.ts`, and `archival_history`.
- ⚠️ **What is known-broken and inherited (`vnt-01` §1.3):** **no production path deletes a `consultation_transcripts` row.** Archival and erasure operate on `recording_artifact_index` + storage objects; account deletion scrubs PII and calls `auth.admin.deleteUser`. The only SQL route is CASCADE from `consultation_sessions`, and `061`'s header says session rows are deliberately retained through the regulatory window. So transcript erasure is **correct-but-inert** today.
- 🔴 **Why that matters more here than it did in Phase 2.** A teleconsult transcript sits under a disclosed recording mandate with a stated retention policy. Audio and transcript of a **walk-in** exist only because a patient said yes to a specific wording — which, per DPDP, comes with a withdrawal and erasure expectation. **An inert erasure path is a documented residual in Phase 2 and a possible STOP in Phase 3.** Determine which, in §2, and surface it rather than absorbing it.
- ❌ **What's missing:** every test in this task.

**Scope Guard:**
- Expected files touched: ≤ 10 (tests + docs + plan status).
- **No new feature code.** If a gate item fails, the fix belongs in the task that owns the surface, not here.
- **Do not build a transcript prune worker in this task.** If §2 concludes one is required, that is a **STOP and surface** — it is a retention-policy decision with a regulatory dimension, and it is not a gate-task's call.
- No change to Phase 1 / Phase 2 behaviour.
- Any expansion requires explicit approval.

**Reference Documentation:**
- Batch acceptance gate + risk register; VNA-D1…D8
- [`task-vnt-05-phase-2-gate.md`](../../p2-transcript-amendment/Tasks/task-vnt-05-phase-2-gate.md) — the gate-task precedent
- [COMPLIANCE.md](../../../../../../../Reference/engineering/compliance/COMPLIANCE.md)
- [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- `docs/Work/Business/tracks.md` L9 — where the outcome is recorded

---

## ✅ Task Breakdown (Hierarchical)

### 0. Pre-flight — **expected to STOP**
- [ ] 0.1 `vna-05` gate green? If not → **STOP**.
- [ ] 0.2 Re-read the batch acceptance gate. Every item traces to a task; any orphan is a planning bug to surface now.
- [ ] 0.3 Re-read `224-visit-narrative-provenance-erasure.test.ts` — the shape to copy, including how it asserts that later migrations cannot loosen the property.

### 1. Standing test — consent absence
- [ ] 1.1 No consent record ⇒ arming is impossible. Route-level, not UI-level.
- [ ] 1.2 Declined ⇒ impossible. Stale policy version ⇒ impossible. `DRAFT-*` version ⇒ impossible. Retired `v1.0` ⇒ impossible.
- [ ] 1.3 Written so that a **later** refactor that moves the check into the client fails the build. Assert on the server boundary, not on a helper that could be bypassed.
- [ ] 1.4 No audio object and no partial upload exists in any of the above cases.

### 2. Standing test — erasure
- [ ] 2.1 Trace, in writing, the erasure path for: the room-audio object, its `recording_artifact_index` row, its `archival_history` row, and its transcript. **Write the table, as `vnt-01` §1.3 did.**
- [ ] 2.2 Standing test: room audio is reachable and removable by the **existing** erasure path. Every worker unmodified.
- [ ] 2.3 Confront the inherited inert-transcript-prune finding. **Decide and surface:** is a walk-in transcript erasable in practice? If the honest answer is no → **STOP and surface to the owner** (and to counsel, via `tracks.md` L9). Do not paper over it with a comment, and do not build the prune worker here.
- [ ] 2.4 Retention parity: room audio's archival timeline is the `rec-*` timeline, or the divergence is documented and owner-accepted. A different clock for room audio is a decision, not a default.

### 3. Standing test — the safety invariants
- [ ] 3.1 A test that fails the build if `use-speech-recognition` becomes reachable from the capture module (VNA-D7).
- [ ] 3.2 A test that fails the build if a stored audio object can exist without a `recording_artifact_index` row (VNA-D4).
- [ ] 3.3 A test that fails the build if the duration cap becomes configurable (VNA-D3).
- [ ] 3.4 A grep-style assertion that the AI route / prompt / service count is unchanged from Phase 2 (VNA-D5).

### 4. The batch gate
- [ ] 4.1 Run every acceptance-gate item in the batch plan. Tick only what actually passed; **do not tick by inspection.**
- [ ] 4.2 Full backend + frontend suites. **Record pre-existing failures separately from anything this phase introduced** — `vnt-05` found a pre-existing frontend `tsc` failure and full-suite flakes, and conflating them would have hidden a real regression.
- [ ] 4.3 Telemetry: counts only, Phase-1/2 shapes byte-identical, VNA-Q2's answer reflected.
- [ ] 4.4 Any residual gets an owner and a home — this file, the batch plan, or `tracks.md`. Nothing lands in "we'll remember".

### 5. Documentation
- [ ] 5.1 Batch plan status updated with the outcome, including what did **not** get done.
- [ ] 5.2 Program [`README.md`](../../README.md) phase table + [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) phase table updated.
- [ ] 5.3 `tracks.md` L9 updated with the counsel outcome and what shipped under it. Keep L9 to **one** next action (business-cadence rule).
- [ ] 5.4 `DB_SCHEMA.md` / `RLS_POLICIES.md` reflect the new bucket + any new table.
- [ ] 5.5 If the phase forked into its own program (unblock condition 4), record the hand-off in both plan docs.

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/tests/… — consent-absence standing test
CREATE: backend/tests/… — erasure standing test (room audio + transcript)
CREATE: tests — import-graph, registration-required, cap-is-constant, AI-surface-count
UPDATE: the batch plan, program README, product plan phase table
UPDATE: docs/Work/Business/tracks.md (L9 outcome)
UPDATE: DB_SCHEMA.md · RLS_POLICIES.md
```

**Existing Code Status:**
- ✅ `backend/tests/unit/migrations/224-visit-narrative-provenance-erasure.test.ts` — EXISTS. The pattern; **not modified**.
- ✅ `backend/src/services/recording-erasure-service.ts` — EXISTS. **Consumed, not modified.**
- ✅ `backend/src/workers/account-deletion-worker.ts` — EXISTS. **Consumed, not modified.**

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **A compliance property needs a test that fails the build when someone loosens it.** Otherwise it is a comment.
- **Verify, don't build.** A failing gate item is routed to its owning task.
- **Do not absorb a STOP.** §2.3 exists because the tempting move is to note the inert prune path and move on. Phase 2 could do that; Phase 3 may not.
- **Pre-existing failures are recorded separately** from anything this phase introduced.
- **Honest ticks only.** A gate that lies is worse than no gate.

**DO NOT include:** code, pseudo-code, function signatures, or DDL in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** — tests and docs only.
- [ ] **Any PHI in logs?** Must be **no**. Test fixtures use synthetic data — never a real transcript.
- [ ] **External API or AI call?** No.
- [ ] **Retention / deletion impact?** **This task verifies it.** §2.3 may escalate.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [ ] Consent-absence standing test green, asserting at the server boundary.
- [ ] Erasure standing test green for the room-audio object and its index rows, with no worker modified.
- [ ] §2.1's erasure table written; §2.3 decided and, if negative, escalated in writing.
- [ ] The four invariant tests (§3) exist and fail the build when the invariant is broken.
- [ ] Every batch acceptance-gate item is ticked honestly, with residuals listed and owned.
- [ ] Full suites run; pre-existing failures recorded separately from new ones.
- [ ] Batch plan, program README, product plan, `tracks.md` L9, and schema docs updated.
- [ ] Type-check + lint clean.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

⟨fill as executed⟩

---

## 📝 Notes

- Phase 2's gate produced its most valuable output in exactly this slot: the erasure test, which turned "CASCADE is declared in the DDL" into "CASCADE cannot be removed without breaking CI". Aim for the same conversion here on consent.
- The likely awkward finding: room audio will be erasable (it is a storage object in the `rec-*` machinery) while its **transcript** is not (nothing prunes `consultation_transcripts`). Erasing the audio and keeping the text is not erasure. That asymmetry is §2.3's whole point.

---

## 🔗 Related Tasks

- [`task-vna-05-reuse-phase-2-spine.md`](./task-vna-05-reuse-phase-2-spine.md) — the last build task
- [`task-vna-01-in-room-consent-surface.md`](./task-vna-01-in-room-consent-surface.md) — the claim §1 verifies
- [Phase 2 `vnt-05`](../../p2-transcript-amendment/Tasks/task-vnt-05-phase-2-gate.md) — the gate-task precedent

---

**Last Updated:** 2026-08-31
**Completed:** —
**Pattern:** Standing CI tests for compliance properties; honest gate ticks
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
