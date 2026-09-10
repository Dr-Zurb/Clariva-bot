# Plan 01 — Staff identity + acting doctor (P1)

> **Parent roadmap:** [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md). Decisions R1, R5, R6, R7 are locked there and are inputs to this plan — do not reopen them here.
>
> **Scope:** backend only. No frontend, no desk UI, no new patient or appointment behaviour. At the end of this batch a receptionist can hold an account and be resolved to their doctor, and **still cannot reach a single endpoint**. That is intentional.

---

## North star

Today the backend has exactly one kind of tenant-bearing actor: a doctor, identified as `req.user.id`. Controllers use that value twice over — once as "which doctor's data is this" and once as "who is asking":

```26:32:backend/src/controllers/availability-controller.ts
export const getAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  const availability = await getDoctorAvailability(userId, correlationId, userId);
  res.status(200).json(successResponse({ availability }, req));
});
```

After this batch those two meanings are separate values — `req.actingDoctorId` (the tenant) and `req.actorId` (the human) — available to any route that opts in, with every route that does *not* opt in behaving exactly as it does today.

---

## Why this is worth doing first

1. **R1 forces it.** The founder chose real staff accounts over a shared doctor login. Every later phase (`POST /patients`, `/desk`, the intake screen) needs to know which doctor a request is acting for. Building those against `req.user.id` and rewriting them two days later is pure rework.
2. **It is far cheaper than it looks.** API authorization lives in the service layer against the service-role client, not in RLS — `getPatientForDoctor(patientId, doctorId, …)` and `validateOwnership(doctorId, userId)` are ordinary function calls taking `doctorId` as a parameter. There is **no RLS rewrite** and **no service rewrite** in this batch.
3. **The precedent already exists.** `middleware/require-admin.ts` reads `app_metadata.role` off the locally-verified JWT and stamps `req.adminActor`. This batch is the same shape with a database lookup added.
4. **The audit defect must be fixed before staff read PHI, not after.** `logDataAccess(correlationId, doctorId, 'patient', patientId)` currently records the *doctor* as the reader. The moment a receptionist can read a patient, that log is actively wrong in the one way a PHI access review cares about. Fixing it later means a window of unattributable access.

---

## Decision locks (DL-1 .. DL-10)

- **DL-1: Opt-in, not a sweep.** `resolveActingDoctor` is applied **per route**. The 33 controllers and ~111 `req.user?.id` call sites are **not** touched in this batch. A route that does not opt in keeps today's exact semantics.

  *Why:* a global sweep is a 5+ file refactor across the whole API for zero pilot value. Only the handful of routes the desk actually needs (P2/P4) will ever opt in.

- **DL-2: Staff are denied by default, at the auth layer.** A JWT whose `app_metadata.role` is a **staff role** is rejected with `ForbiddenError` inside `authenticateToken` unless a preceding route-level marker set `req.staffAllowed = true`. Doctor and admin JWTs are unaffected.

  *Why:* without this, a staff JWT hitting a non-opted route would be treated as a normal user whose `req.user.id` happens to own nothing. Reads would silently return empty lists and writes would create orphaned rows owned by the staff uid. "Fails empty" is not "fails closed".

- **DL-3: Route wiring shape.**

  ```ts
  // doctor-only (unchanged, the overwhelming default)
  router.get('/', authenticateToken, listSomethingHandler);

  // desk-reachable (added in P2 / P4, none in this batch)
  router.post('/', allowStaff, authenticateToken, resolveActingDoctor, createSomethingHandler);
  ```

  `allowStaff` must come **before** `authenticateToken` so the marker is set when the deny check runs. `resolveActingDoctor` must come **after**, because it needs `req.user`.

- **DL-4: The `clinic_staff` row is authoritative; the JWT claim is only a hint** (resolves RQ2). The claim tells the middleware "look this user up" and lets the frontend pick a landing page. Access is granted by an `active` row and revoked by flipping `status` — with **no lookup cache in V1**, so revocation takes effect on the very next request rather than waiting for a token refresh or a TTL.

  *Why no cache:* the doctor path short-circuits on the absent role claim and does **zero** extra queries, so this adds no cost to 99% of traffic. One indexed lookup on the staff path is not worth the revocation-lag correctness risk.

- **DL-5: One staff member maps to exactly one doctor** (R5). Enforced by `UNIQUE (staff_user_id)` on `clinic_staff`, not by application code. Multi-doctor support means dropping that constraint and adding a doctor-switcher — a later program, not a later patch.

- **DL-6: Actor-aware auditing needs no migration.** `audit_logs.metadata JSONB` already exists (migration 001). Audit writes on staff-serviced requests record `user_id = actorId` and `metadata.on_behalf_of_doctor_id = actingDoctorId`. Doctor-serviced requests are byte-identical to today — no `metadata` key added, so existing log queries and fixtures don't shift.

- **DL-7: `role` is a single-value CHECK, not a permissions bitmap.** V1 ships `'receptionist'` only. Per-permission granularity (`can_register`, `can_book`, `can_check_in`) is deliberately deferred — with one role and one portal, a permissions table is speculative schema.

- **DL-8: Staff accounts are provisioned by script in this batch** (resolved RQ1). `backend/scripts/provision-clinic-staff.ts` and `/admin/clinic-staff` still work. **Doctor-facing invite landed 2026-08-23:** Settings → Front desk. One active seat per doctor (`205_clinic_staff_one_active_per_doctor.sql`). Existing auth accounts are never converted — only a new user, or an account already linked to that doctor.

- **DL-9: `clinic_staff` is not a PHI table.** It holds employment linkage (`doctor_id`, `staff_user_id`, `role`, `status`) and an optional staff `display_name`. It carries **no patient data**. It is still personal data — `display_name` never goes to logs or telemetry.

- **DL-10: RLS on `clinic_staff` is deny-all + service role.** Mirrors the `patients` INSERT/UPDATE shape from migration 002. Nothing reads this table except the backend's service-role client; there is no direct-from-browser path, so no permissive policy is needed.

---

## Open questions — answered defaults (locked for batch duration)

- **P1-Q1: What string goes in `app_metadata.role`?** **`'receptionist'`** — the same single-string slot `'admin'` already occupies. *Not* an array, *not* a new claim name, so `supabase-token-verifier.ts` needs no change. A user cannot be both admin and receptionist; if that's ever needed it becomes an array and that's a separate decision.
- **P1-Q2: Does the staff user need `profile_completed`?** **No.** That flag is doctor-onboarding routing. Frontend gating for `/desk` (P3) must not inherit the `/dashboard` `profile_completed` redirect — same carve-out `/admin` already has in `resolveAuthGate`.
- **P1-Q3: What happens to an active session when staff are suspended?** Next request 403s (DL-4). Their Supabase session stays valid but every API call fails; the P3 shell will surface a "your access has been removed" state. Force-signing-out the session is a follow-up, not V1.
- **P1-Q4: Should `clinic_staff` cascade when a doctor is deleted?** **`ON DELETE CASCADE` for `doctor_id`** (the link is meaningless without the doctor) and **`ON DELETE CASCADE` for `staff_user_id`** (same). Neither deletes patient data.
- **P1-Q5: Does this batch wire any route to `allowStaff`?** **No.** Zero routes opt in. The middleware is verified by unit and integration tests plus the smoke-test recipe below, not by exposing surface area.

Deferred, explicitly not in this batch: per-permission flags (DL-7), staff activity log UI, multi-doctor mapping (DL-5), forced session revocation (P1-Q3). Doctor-facing invite (DL-8) landed 2026-08-23.

---

## Scope (S-items → tasks)

### Wave 1 — schema

- **S1.1 — `clinic_staff` table.** → `rp-01`

  New migration `backend/migrations/200_clinic_staff.sql` (200 was the next free number at implementation; `199_billing_usage_ledger.sql` had already landed).

  ```sql
  CREATE TABLE IF NOT EXISTS clinic_staff (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'receptionist'
                    CHECK (role IN ('receptionist')),
    status        TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended')),
    display_name  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_staff_user_id
    ON clinic_staff (staff_user_id);                    -- DL-5
  CREATE INDEX IF NOT EXISTS idx_clinic_staff_doctor_active
    ON clinic_staff (doctor_id) WHERE status = 'active';
  ```

  Plus `ALTER TABLE clinic_staff ENABLE ROW LEVEL SECURITY;` with **no permissive policies** (DL-10), the `updated_at` trigger if this schema uses one (check migration 001's convention), column comments, and a documented rollback in the header — matching the header format used by migration 192.

  > **Hard-rules gate.** This is a new migration. Per [`.cursor/rules/00-agent-contract.mdc`](../../../../.cursor/rules/00-agent-contract.mdc) and [`.cursor/rules/migrations.mdc`](../../../../.cursor/rules/migrations.mdc), it must be written in an **Opus (max-thinking) turn**, following [`MIGRATIONS_AND_CHANGE.md`](../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md). Do not let an Auto model write this file.

### Wave 2 — middleware and audit (parallel-safe: different files)

- **S2.1 — Request types.** → `rp-02`

  Extend `backend/src/types/express.ts` alongside the existing `adminActor` declaration:

  | Property | Type | Meaning |
  |----------|------|---------|
  | `actingDoctorId` | `string \| undefined` | Tenant — whose data this request operates on |
  | `actorId` | `string \| undefined` | The real `auth.users` id of whoever is clicking |
  | `actorKind` | `'doctor' \| 'staff' \| undefined` | Which of the two the actor is |
  | `staffRole` | `string \| undefined` | `clinic_staff.role` when `actorKind === 'staff'` |
  | `staffAllowed` | `boolean \| undefined` | Set by `allowStaff`; read by the DL-2 deny check |

- **S2.2 — `allowStaff` marker + staff deny in `authenticateToken`.** → `rp-03`

  New `backend/src/middleware/allow-staff.ts` exporting a trivial `allowStaff` that sets `req.staffAllowed = true` and calls `next()`.

  In `backend/src/middleware/auth.ts`, after `req.user = user` and before the audit enqueue: if the verified JWT's `app_metadata.role` is a staff role and `req.staffAllowed` is not true, enqueue a `logSecurityEvent(..., 'failed_auth', 'medium', ...)` and throw `ForbiddenError('Staff access is not permitted on this endpoint')`.

  Read the role **only** from `req.user.app_metadata` (already reconstructed by `utils/supabase-token-verifier.ts`) — never from headers or body.

- **S2.3 — `resolveActingDoctor` middleware.** → `rp-04`

  New `backend/src/middleware/resolve-acting-doctor.ts`, `asyncHandler`-wrapped, modelled on `require-admin.ts`. Requires `authenticateToken` to have run.

  | Case | Result |
  |------|--------|
  | No staff role on JWT | `actingDoctorId = actorId = req.user.id`, `actorKind = 'doctor'`. **Zero DB queries.** |
  | Staff role + `active` row | `actingDoctorId = row.doctor_id`, `actorId = req.user.id`, `actorKind = 'staff'`, `staffRole = row.role` |
  | Staff role + no row | `ForbiddenError('Staff account is not linked to a practice')` |
  | Staff role + `suspended` row | `ForbiddenError('Staff access has been suspended')` |

  The lookup goes in a thin `backend/src/services/clinic-staff-service.ts` (`findActiveStaffLink(staffUserId, correlationId)`) using the service-role client, so the middleware stays orchestration-only and the query is unit-testable. Mirror `complaint-master-service.ts` for file structure.

- **S2.4 — Actor-aware auditing.** → `rp-05`

  Add an optional `onBehalfOfDoctorId?: string` to the `logAuditEvent` params in `backend/src/utils/audit-logger.ts`; when present, merge `on_behalf_of_doctor_id` into the existing `metadata` JSONB (DL-6). Add an optional trailing `onBehalfOfDoctorId` argument to `logDataAccess` and `logDataModification` so call sites can adopt it one at a time.

  **Do not** change any existing call site's behaviour in this batch — every current call omits the new argument and must produce a byte-identical row.

### Wave 3 — ops and verification

- **S3.1 — Provisioning script.** → `rp-06`

  `backend/scripts/provision-clinic-staff.ts`, following the conventions of the existing scripts in that folder. Takes a staff email, a doctor id, and an optional display name. Creates or looks up the Supabase user, sets `app_metadata.role = 'receptionist'` via the admin API, upserts the `clinic_staff` row, and prints the resulting linkage. Must be idempotent and must refuse to run against a user who already holds `role = 'admin'`.

  Add a matching `suspend` / `reactivate` path (flip `status`) so revocation is a one-liner during the pilot.

- **S3.2 — Tests.** → folded into each task, gated here.

  - Unit: `resolveActingDoctor` across all four DL-4 cases, with the staff lookup mocked.
  - Unit: `authenticateToken` denies a staff JWT without the marker and allows one with it; doctor and admin JWTs are unaffected.
  - Unit: `logAuditEvent` with and without `onBehalfOfDoctorId` — assert the no-arg case produces an unchanged row.
  - Integration: one route temporarily wired with `allowStaff` + `resolveActingDoctor` in a test-only router, asserting `req.actingDoctorId` resolves to the linked doctor. Not shipped on a real route (P1-Q5).

---

## Acceptance gate

Before declaring this batch shipped:

- [ ] `clinic_staff` exists with the DL-5 unique constraint, the partial active index, RLS enabled and no permissive policies, and a documented rollback in the migration header.
- [ ] **Regression, the important one.** A doctor JWT produces identical behaviour on every endpoint. Full existing backend test suite passes with **zero** changes to existing test files. `resolveActingDoctor` on a doctor JWT issues no database query.
- [ ] A staff JWT is rejected with **403** on any route that has not opted in — verified against at least three representative routes (a GET list, a GET by id, and a POST).
- [ ] A staff JWT on an opted-in test route resolves `actingDoctorId` to the linked doctor and `actorId` to the staff user.
- [ ] Unlinked staff → 403 `'Staff account is not linked to a practice'`. Suspended staff → 403 `'Staff access has been suspended'`, taking effect on the **next request** after the status flip with no re-login (DL-4).
- [ ] An audit row written with `onBehalfOfDoctorId` carries `user_id = actorId` and `metadata.on_behalf_of_doctor_id = actingDoctorId`. An audit row written without it is byte-identical to the pre-batch row.
- [ ] `provision-clinic-staff.ts` creates a working receptionist account end to end, is idempotent on a second run, and refuses an existing admin user.
- [ ] No PHI and no `display_name` in any log line added by this batch.
- [ ] Zero routes ship with `allowStaff` (P1-Q5).
- [ ] Verification gate per [`DEFINITION_OF_DONE.md`](../../../Reference/engineering/development/DEFINITION_OF_DONE.md): `tsc --noEmit` clean, lint clean, tests green.

### Smoke-test recipe

```bash
# 1. provision
npx tsx backend/scripts/provision-clinic-staff.ts \
  --email desk@clinic.test --doctor-id <DOCTOR_UUID> --display-name "Front desk"

# 2. sign in as that user, grab the access token, then:
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  "$API/api/v1/patients"          # expect 403 (no route opts in yet)

curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  "$API/api/v1/patients"          # expect 200, unchanged

# 3. suspend, then re-run the staff call without re-login → still 403
```

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| The DL-2 deny check sits in `authenticateToken`, the hottest path in the API — a mistake here breaks **every** authenticated request | **H** | The check is a single string comparison guarded on a claim that is absent for all existing users, so the doctor path cannot enter it. Land `rp-03` alone, run the full suite, and verify a doctor request before `rp-04` starts. |
| Staff JWT reaches a non-opted route and is silently treated as a doctor with an empty tenant | **H** | Exactly what DL-2 prevents. Acceptance gate tests three representative route shapes, not one. |
| Suspension doesn't take effect because of caching added "for performance" | **M** | DL-4 forbids a cache in V1. If p95 on the staff path later demands one, the TTL and its revocation lag must be an explicit decision in a follow-up, not an implementation detail. |
| Audit change alters existing rows and breaks log queries or compliance fixtures | **M** | DL-6 makes the parameter optional and additive; the acceptance gate asserts byte-identical output for the no-arg case. |
| `UNIQUE (staff_user_id)` blocks a legitimate future multi-doctor case and someone drops it ad hoc | **M** | DL-5 states the constraint is the enforcement point for R5. Dropping it is a roadmap decision requiring a doctor-switcher, and belongs in a new plan. |
| Someone starts the controller sweep "while they're in there" | **M** | DL-1 plus the Scope Guard below. The sweep has no pilot value and is explicitly not authorised. |
| Role claim collides with `admin` on a founder account used for both | **L** | P1-Q1 makes the slot single-valued; `provision-clinic-staff.ts` refuses to overwrite an admin (S3.1). Use a separate email for the desk account. |
| `clinic_staff` gets treated as a PHI table and inherits unnecessary retention/consent machinery | **L** | DL-9 states it plainly; the migration header should repeat it. |

---

## Scope Guard — DO NOT TOUCH

- Any of the 33 controllers or ~111 `req.user?.id` call sites (DL-1).
- RLS policies on any existing table (R6).
- `patients`, `appointments`, or any other PHI table.
- The `walkin: true` path in `appointment-controller.ts` (that's P2/P4, governed by R11).
- `utils/supabase-token-verifier.ts` — P1-Q1 is chosen specifically so it needs no change.
- Frontend — nothing in this batch.

If the work appears to require any of the above, **stop and surface it** rather than expanding scope.

---

## Cost estimate

Six tasks across three waves. `rp-01` is an **Opus** task (new migration, hard-rules list). `rp-03` warrants Opus or a careful review pass despite its size — it edits the auth hot path. `rp-02`, `rp-04`, `rp-05`, `rp-06` are well-spec'd, deterministic, and fine on the mid tier per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

Wave 2's tasks touch different files (`types/express.ts`, `middleware/auth.ts` + `middleware/allow-staff.ts`, `middleware/resolve-acting-doctor.ts` + `services/clinic-staff-service.ts`, `utils/audit-logger.ts`), so `rp-04` and `rp-05` can run in parallel lanes after `rp-03` lands. Sequence `rp-02 → rp-03 → (rp-04 ‖ rp-05) → rp-06`.

**Estimated wall-clock:** ~2 dev-days.

---

## References

- [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md) — parent; decisions R1–R12.
- `backend/src/middleware/require-admin.ts` — the pattern this batch mirrors.
- `backend/src/middleware/auth.ts` — local JWT verification, fail-closed doctrine, audit enqueue.
- `backend/src/utils/db-helpers.ts:92` — `validateOwnership`, the tenant/actor seam.
- `backend/src/utils/audit-logger.ts` — `logAuditEvent` / `logDataAccess` / `logDataModification`.
- `backend/migrations/001_initial_schema.sql:57` — `audit_logs` incl. the `metadata JSONB` column DL-6 relies on.
- `backend/migrations/002_rls_policies.sql` — the deny-all + service-role shape DL-10 copies.
- [`RLS_POLICIES.md`](../../../Reference/engineering/compliance/RLS_POLICIES.md), [`COMPLIANCE.md`](../../../Reference/engineering/compliance/COMPLIANCE.md) — audit and access constraints behind R7.
- [`RECIPES.md`](../../../Reference/engineering/development/RECIPES.md) R-AUTH-001 — auth middleware recipe.

---

**Created:** 2026-08-22
**Owner:** TBD
**Status:** `Drafted` — ready to promote to `Daily-plans/August 2026/<DD-MM-2026>/receptionist-portal/p1-staff-identity/Tasks/`
