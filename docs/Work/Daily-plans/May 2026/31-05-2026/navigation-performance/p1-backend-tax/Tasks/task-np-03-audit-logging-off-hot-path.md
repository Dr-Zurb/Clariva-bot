# np-03 · Move audit logging off the request hot path

> **Phase 1, step 2** of [navigation-performance](../plan-p1-navigation-performance-backend-tax-batch.md) · follows [np-02](./task-np-02-local-jwt-verification.md) (same file, `auth.ts`). Removes the second serial round-trip from the request floor (product-plan F2) **without dropping a single audit event** (NP-DL-2). Compliance-sensitive.

| **Size** | M | **Model** | Sonnet 4.6 | **Wave** | 1 | **Depends on** | np-02 | **Blocks** | — | **Status** | ✅ DONE |

---

## 📋 Task overview

Today `authenticateToken` (and other read-path call sites) `await` `logAuditEvent(...)` / `logSecurityEvent(...)`, each of which performs an `audit_logs` INSERT over PostgREST **before** the request proceeds. Make audit emission **non-blocking** (the request returns without waiting on the write) while preserving **completeness** — every event that is recorded today is still recorded, with a graceful-shutdown drain so nothing in flight is lost.

**Change type:** **Update existing** — changes how/when audit writes happen. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state (verified in code):**
- ✅ `backend/src/utils/audit-logger.ts` exposes `logAuditEvent`, `logSecurityEvent`, `logDataAccess`, etc.; the core does an `await supabaseAdmin.from('audit_logs').insert(...)`.
- ✅ `auth.ts` `await`s these in the request path (success + failed-auth).
- ✅ The logger already swallows its own failures (logs, doesn't throw) — so callers don't depend on its return for control flow.
- ❌ There is no async/queued emit path and no shutdown drain.

**Scope guard:** expected files touched ≤ 4 (`audit-logger.ts`, `auth.ts`, server bootstrap/shutdown, tests). Keep the public `logAuditEvent`/`logSecurityEvent` signatures so other call sites don't change.

---

## ✅ Task breakdown (hierarchical)

### 1. Choose the lossless async mechanism (NP-Q3 default)
- [x] 1.1 Adopt an in-process async flush (microtask/`setImmediate`-style enqueue + batched insert) — the product plan's leaning default; no external queue for v1. → `setImmediate` flush tick + batched PostgREST insert (50 rows/tick).
- [x] 1.2 Define backpressure behaviour: never silently drop; bound the queue and prefer slowing emit over data loss. → 10 000 cap; producers `await` queue space (slow emit, no drop); disabled during shutdown drain.

### 2. Make emission non-blocking
- [x] 2.1 Change `logAuditEvent` so callers no longer block on the DB insert (preserve the existing function signature + the "never throw" guarantee). → validates sync, enqueues, resolves after enqueue (insert async).
- [x] 2.2 In `auth.ts`, stop `await`ing audit/security logging on the success and failed-auth paths; the request proceeds immediately. → all four call sites use `void log*Event(...)`.
- [x] 2.3 Keep failed-auth `logSecurityEvent` semantically guaranteed (enqueued, not dropped) — security events are compliance-mandatory. → same queue path; shutdown drain flushes them.

### 3. Guarantee completeness on shutdown
- [x] 3.1 Add a graceful-shutdown drain that flushes the pending queue before the process exits (wire into the server bootstrap/SIGTERM handling). → `drainAuditLogQueue()` in `index.ts` `shutdownAsync` after `server.close()` + worker teardown.
- [x] 3.2 Ensure PHI validation (`validateNoPHI`) still runs before any write (unchanged). → still synchronous, before enqueue.

### 4. Remove obsolete + verify
- [x] 4.1 Remove the now-obsolete synchronous `await` on the hot path; confirm no caller relied on the await for ordering/control flow. → auth.ts has zero `await log*Event`; grep confirms no ordering dependency (logger never threw; callers don't branch on return).
- [x] 4.2 Load test: count of `audit_logs` rows == count of authenticated requests for a run (± in-flight flushed by the drain). → **60/60 PASS** — [`../p1-measurement-results.md`](../p1-measurement-results.md).
- [x] 4.3 Measure the request-floor delta vs np-01 baseline; confirm it stacks with np-02 toward the phase's < ~100ms gate. → p50 −196 ms vs np-01; stacks with np-02; <100 ms gate blocked by Supabase DB RTT (documented in results).
- [x] 4.4 `npx tsc --noEmit` clean; existing tests green. → tsc clean; new audit-logger suite **6/6**, auth middleware **12/12** (includes np-03 non-blocking assertion).

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Yes (writes `audit_logs` via service role). → **RLS verified?** Service-role insert path unchanged; batch insert uses same client/table.
- [x] **Any PHI in logs?** **No** — `validateNoPHI` runs synchronously before enqueue; async move does not bypass it.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No change to what's stored or its retention — only *when* the write happens.

---

## ✅ Acceptance & verification criteria

- [x] No `await logAuditEvent` / `await logSecurityEvent` remains on the synchronous request path. → auth.ts uses `void` only; grep confirms zero awaits.
- [x] Audit completeness: rows written == events emitted across a load run; nothing dropped; shutdown drain verified. → 60/60 load test; unit-tested drain; shutdown wired in `index.ts`.
- [x] Failed-auth security events still recorded. → same `logSecurityEvent` → queue path.
- [x] `validateNoPHI` still runs before every write. → tested: PHI metadata never reaches insert.
- [x] Public logger signatures unchanged (other call sites untouched); `npx tsc --noEmit` clean.

## 🚫 Anti-goals

- ❌ Don't make audit logging best-effort-lossy — "off the hot path" must not mean "may be dropped" (NP-DL-2 / NP-R2).
- ❌ Don't change the audit row shape, the `audit_logs` schema, or retention.
- ❌ Don't change the public `logAuditEvent`/`logSecurityEvent` API (would force edits across many call sites).
- ❌ Don't introduce an external queue/broker for v1 (deferred; revisit only if volume demands).

## ⚠️ Risks

- **Event loss on crash/backpressure (highest).** A naive fire-and-forget loses events on process exit. The bounded queue + shutdown drain (step 3) are mandatory, not optional.
- **Hidden ordering dependency.** If any caller assumed the await ordered a subsequent step, removing it could reorder effects — audit (4.1) before removing.

---

---

## 📝 Notes (implementation)

### Mechanism (NP-Q3)
In-process bounded queue in `backend/src/utils/audit-logger.ts`:
- **Enqueue:** `logAuditEvent` validates correlation ID + `validateNoPHI` synchronously, builds the row, pushes to an in-memory queue (max **10 000**), returns. Producers block on queue space when full (slow emit, never drop) unless shutdown drain is active.
- **Flush:** `setImmediate` tick drains up to **50** rows per batch via `supabaseAdmin.from('audit_logs').insert(batch)`.
- **Shutdown:** `drainAuditLogQueue()` (exported) disables backpressure, wakes blocked producers, flushes until empty. Wired in `index.ts` `shutdownAsync` after `server.close()` + worker teardown, before `process.exit`.

### Auth hot path (np-03 + np-02 stack)
`auth.ts` uses `void logSecurityEvent(...)` / `void logAuditEvent(...)` — the middleware does not await audit at all, so the request floor loses the second serial PostgREST round-trip (F2) on top of np-02's removed GoTrue call (F1).

### Contract preservation
- Public signatures of `logAuditEvent`, `logSecurityEvent`, and all helpers **unchanged** — other call sites keep compiling without edits; they now resolve after enqueue instead of after insert (still an improvement for non-auth paths).
- Audit row shape, schema, retention untouched.
- Logger still never throws to callers.

### Files touched (≤ 4)
1. `backend/src/utils/audit-logger.ts` — queue, batch flush, `drainAuditLogQueue`.
2. `backend/src/middleware/auth.ts` — `void` emit, no awaits.
3. `backend/src/index.ts` — shutdown drain hook.
4. Tests: `tests/unit/utils/audit-logger.test.ts` (new), `tests/unit/middleware/auth.test.ts` (+1 non-blocking case).

### Verification
- `npx tsc --noEmit` clean; ESLint clean.
- audit-logger **6/6**, auth middleware **12/12**.
- **Open (Wave 1 gate):** 4.2 load-test row parity, 4.3 prod-build floor delta vs np-01 (shared with np-02 §4.2).

---

## 🔗 Related

- Sibling task (precedes this): [`task-np-02-local-jwt-verification.md`](./task-np-02-local-jwt-verification.md)
- Prior phase baseline: [`../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md`](../../p0-measure/Tasks/task-np-01-baseline-instrumentation.md)
- Code-change rules: [`../../../../../../process/CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
