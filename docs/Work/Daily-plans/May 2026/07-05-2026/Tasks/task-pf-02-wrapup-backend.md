# Task pf-02: Wrap-up backend endpoint

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 1, Lane α step 1 — **S, ~4h**

---

## Task overview

Ships the single transactional endpoint that owns appointment completion: `POST /v1/appointments/:id/wrap-up`. In one transaction it persists wrap-up fields (diagnosis + follow-up), ends the consultation session if still live, and flips `appointments.status` to `completed`. Idempotent — a second call on an already-completed appointment is a 200 no-op.

Also ships a small companion read endpoint `GET /v1/diagnoses/recent?limit=20` that powers the diagnosis-tag autocomplete in the wrap-up dialog (pf-04).

**Estimated time:** ~4h. ~20min Opus transaction-design pass, ~3h Sonnet impl, ~30min smoke + integration.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-01](./task-pf-01-wrapup-migration.md) shipped.

**Source:** [plan-patient-seeing-flow.md § P1.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p12--backend-post-v1appointmentsidwrap-up).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Extra High** for the transaction-design pass, then **Sonnet 4.6 Medium** for impl.

**Why Opus:** the endpoint touches PHI columns (diagnosis), flips a status that downstream cockpit derivation depends on, and dispatches a side-effect (`endSession`) inside a transaction. Three failure modes lurk —
1. `endSession` makes its own DB writes; if we wrap it in our transaction we double-wrap (the facade already handles its own commit). Need to invoke it OUTSIDE our `BEGIN/COMMIT` block, but only after our update succeeds.
2. Idempotency: a second call must NOT re-trigger `endSession` (session is already `ended`).
3. Race condition: doctor sends Rx → 'Done with patient' clicked twice → must not double-end.

One Opus turn nails the truth-table; Sonnet types it out.

**New chat?** **Yes — split:**

1. **Opus design chat (~20min, Plan Mode):**
   - Pre-load: this task file + `backend/src/services/appointment-service.ts` + `backend/src/services/consultation-verification-service.ts` (where `endSession` lives) + `backend/src/controllers/appointment-controller.ts` (existing patterns).
   - Ask: *"Design `wrapUpAppointment(input)` service. Specify: transaction boundaries, where the `endSession` facade call lives relative to BEGIN/COMMIT, idempotency (no-op when already completed), race-safety on double-click. Output a 1-page spec with the SQL and the call sequence."*
   - Lock the spec.

2. **Sonnet impl chat (~3h):**
   - Pre-load: this task file + the locked spec.
   - Implement controller, service, route, validation. Add the `/v1/diagnoses/recent` companion endpoint as a small additional service method.

**Composer-OK sub-steps:** none — this is a security/PHI endpoint, all turns stay in Tier 1/2.

**Estimated turns:** 1 Opus design + 4–5 Sonnet impl turns.

---

## Acceptance criteria

### `POST /v1/appointments/:id/wrap-up`

- [ ] Route mounted in `backend/src/routes/api/v1/appointments.ts` with `requireAuth` + `requireDoctor` middleware (match the existing `appointments` route patterns).
- [ ] Validation schema in `backend/src/utils/validation.ts`:

  ```ts
  export const validateWrapUpBody = z.object({
    diagnosis_text:  z.string().trim().max(2000).optional().nullable(),
    diagnosis_tags:  z.array(z.string().trim().min(1).max(64)).max(20).default([]),
    followup_date:   z.string().date().nullable().optional(),  // ISO YYYY-MM-DD
    followup_kind:   z.enum(['none','in_person','tele']).nullable().optional(),
  });
  ```

- [ ] Controller `wrapUpAppointmentHandler` in `backend/src/controllers/appointment-controller.ts`:
  - Verifies caller's `doctor_id` matches `appointment.doctor_id` (403 otherwise).
  - Returns the **updated full appointment row** (matching shape of existing GET response).
  - Errors mapped to existing `ApiError` patterns (400 / 403 / 404 / 500).

- [ ] Service `wrapUpAppointment(input, correlationId)` in `backend/src/services/appointment-service.ts`:
  1. Looks up the appointment + active session (single read).
  2. **Idempotency short-circuit:** if `appointment.status === 'completed'`, return the appointment as-is with a no-op log line. Do NOT re-fire `endSession`.
  3. Otherwise, in a single transaction:
     - `UPDATE appointments SET diagnosis_text, diagnosis_tags, followup_date, followup_kind, status = 'completed', updated_at = NOW() WHERE id = $1 AND doctor_id = $2 RETURNING *`. Use `WHERE … AND status != 'completed'` to harden against the racy double-click.
  4. **After commit**, if the original session existed AND its `status === 'live'`, call `endSession({ sessionId, reason: 'wrap_up' })` via the existing facade. (Outside the transaction — facade owns its own commit.)
  5. Return the updated appointment row.

- [ ] Audit log row written (match existing `appointment.completed` audit pattern; if none exists, write under event name `appointment.wrap_up`).

### `GET /v1/diagnoses/recent`

- [ ] Route `GET /v1/diagnoses/recent?limit=20` mounted alongside the wrap-up route. Same auth (`requireAuth + requireDoctor`).
- [ ] Service `getRecentDiagnosisTags(doctorId, limit)`:

  ```sql
  SELECT tag, COUNT(*) AS uses
  FROM appointments,
       LATERAL UNNEST(diagnosis_tags) AS tag
  WHERE doctor_id = $1
    AND status = 'completed'
    AND completed_at > NOW() - INTERVAL '90 days'
  GROUP BY tag
  ORDER BY uses DESC
  LIMIT $2;
  ```

  (Adjust `completed_at` to whatever the existing schema names the field — likely `updated_at` filtered on `status = 'completed'`.)
- [ ] Returns `{ tags: Array<{ tag: string; uses: number }> }`.
- [ ] Client-cacheable — sets `Cache-Control: private, max-age=60`.

### Tests / smoke

- [ ] Unit test for the service in `backend/tests/unit/services/appointment-service-wrap-up.test.ts`:
  - Happy path: confirmed appointment with live session → wrap-up flips to completed + ends session.
  - Idempotency: completed appointment → no-op, no endSession call.
  - Forbidden: caller doctor_id ≠ appointment.doctor_id → 403.
  - Cancelled appointment: should refuse (400 — "cannot wrap up a cancelled appointment").

- [ ] Manual curl smoke documented in PR description:

  ```bash
  curl -X POST $API/v1/appointments/$APPT_ID/wrap-up \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"diagnosis_text":"viral fever","diagnosis_tags":["flu","viral"],"followup_date":"2026-06-01","followup_kind":"in_person"}'
  ```

### General

- [ ] Type-check + lint clean.
- [ ] OpenAPI / API doc string updated if the project keeps one (search `routes/api/v1/appointments.ts` for the existing convention).

---

## Out of scope

- **Frontend wiring** — pf-04 builds the dialog that calls this endpoint.
- **Cancelled / no-show wrap-up** — out of scope per source plan P-Q3 (skip the dialog for these states; pf-04 owner enforces).
- **Auto-expire `wrap_up`** — P-Q2 vote was yes but covered in pf-17 (auto-no-show worker can sweep these too).

---

## Files expected to touch

**New:**
- `backend/tests/unit/services/appointment-service-wrap-up.test.ts` (~120 LOC)

**Modified:**
- `backend/src/controllers/appointment-controller.ts` (add `wrapUpAppointmentHandler` + `getRecentDiagnosisTagsHandler`, ~80 LOC additive)
- `backend/src/services/appointment-service.ts` (add `wrapUpAppointment` + `getRecentDiagnosisTags`, ~140 LOC additive)
- `backend/src/routes/api/v1/appointments.ts` (mount two new routes, ~6 LOC)
- `backend/src/utils/validation.ts` (add `validateWrapUpBody`, ~12 LOC)

**Deleted:** none.

**Migrations:** none (pf-01 owns the schema).

---

## Notes / open decisions

1. **`endSession` outside the transaction.** The facade in `consultation-verification-service.ts` writes to `consultation_sessions`, possibly emits a notification, and may call `notification-service`. Wrapping it in our transaction risks deadlock (cross-table writes inside a single tx with a third-party I/O retry) and complicates rollback semantics. After-commit invocation is correct — if it fails, the appointment is still completed and we log a warning.
2. **Why not flip session-end first?** Same reason — keeping the appointment-flip atomic is the contract that downstream cockpit-state derivation depends on. The session-end is best-effort.
3. **`status != 'completed'` in the WHERE.** This is the race-safety guard. Two concurrent wrap-ups: the second's UPDATE returns 0 rows; service detects the no-row case and short-circuits to "already completed" path.
4. **Why a separate `/v1/diagnoses/recent` endpoint instead of returning tags from a profile read?** Cacheability + isolation. The autocomplete fires on every keystroke; we want a tight, indexed query.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P1.2](../../../../Product%20plans/plan-patient-seeing-flow.md#p12--backend-post-v1appointmentsidwrap-up)
- **Batch plan:** [plan-patient-flow-batch.md](../plan-patient-flow-batch.md)
- **Hard-rule for PHI endpoints:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § When to escalate to Opus](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#when-to-escalate-to-opus-the-hard-rules)
- **Existing `endSession` facade:** `backend/src/services/consultation-verification-service.ts`
- **Existing controller patterns:** `backend/src/controllers/appointment-controller.ts`

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
