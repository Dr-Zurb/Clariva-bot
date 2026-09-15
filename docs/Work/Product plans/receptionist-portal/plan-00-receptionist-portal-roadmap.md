# Plan 00 — Receptionist portal roadmap (master index)

## Give the clinic's front desk its own login and its own intake flow, so offline patients land in the same chart spine as bot patients

> **Why this exists now.** The founder is starting a real-patient pilot in his own OPD. Today the **only** way a patient enters Clariva is the DM bot: inbound Instagram/Facebook message → AI receptionist → consent → slot → payment → appointment. A patient who walks in, or phones the clinic, has no path in. That makes the pilot impossible to run honestly and starves the EHR of the real-world usage it needs to improve.
>
> **What this is NOT.** Not a clinic-management / HIS product. Not billing, not inventory, not staff attendance. The desk exists to get a real patient onto the day board with a real chart, and nothing more.
>
> **Related:** resumes [`deferred-doctor-ui-add-patient-2026-04.md`](../../capture/features/patients/deferred-doctor-ui-add-patient-2026-04.md) · roster rules in [`PATIENT_REGISTRATION_AND_ROSTER.md`](../../../Reference/product/patients-and-practice/PATIENT_REGISTRATION_AND_ROSTER.md) · clinical spine in [`ehr/plan-00-ehr-roadmap.md`](../ehr/plan-00-ehr-roadmap.md)

---

## Goal

A receptionist sitting at the front desk can, with their own credentials and without touching the doctor's clinical dashboard:

1. **Find** an existing patient by phone in one search.
2. **Register** a new patient in under 30 seconds if not found.
3. **Book** them into today (or a future day) — slot or queue, whichever mode the doctor runs.
4. **Check them in** when they physically arrive, so the doctor's day board reflects the waiting room.

The make-or-break framing:

> The desk is a **speed surface**, not a data-entry surface. If registering a walk-in takes longer than writing their name in a paper register, the receptionist will keep using the paper register and the pilot produces no data.

---

## Product context (so phase deep dives don't re-derive it)

### What already exists — do not re-propose

Substantially more of this is built than it looks. All of the following ships today:

| Capability | Where | Notes |
|------------|-------|-------|
| Doctor-authenticated appointment create | `POST /api/v1/appointments` → `createAppointmentHandler` (`controllers/appointment-controller.ts:91`) | Accepts three shapes: existing `patientId`, ad-hoc `patientName`+`patientPhone`, or `walkin: true` |
| Walk-in fast path (pf-16) | same handler, lines 107–124 | Creates an appointment with **no `patients` row**; forces `confirmed` + `freeOfCost` |
| Walk-in provenance | `appointments.booking_origin` (migration 192) | CHECK already allows `booked \| walk_in \| overflow \| return_after_completed \| rebooked` |
| Arrival stamp | `appointments.patient_checked_in_at` (migration 193) | Exists; the desk's "arrived" action writes here |
| Slot availability | `getAvailableSlots()` (`services/availability-service.ts`) | Weekly availability + `blocked_times`, excludes booked |
| Queue vs slot day modes | `services/opd/opd-mode-service.ts`, `opd-policy-service.ts` | Desk must respect `doctor_settings.opd_mode` |
| Day operations board | `/dashboard/opd-today` (`components/opd/OpdTodayClient.tsx`) | Status chips, search, 30s poll, hotkeys |
| Doctor-side add appointment / add slot UI | `components/appointments/AddAppointmentModal.tsx`, `components/opd/AddSlotDialog.tsx` | Desk-shaped booking already prototyped |
| Patient dedup + merge | `findPossiblePatientMatches()` (`patient-matching-service.ts:91`), `GET /patients/possible-duplicates`, `POST /patients/merge` | Doctor-scoped fuzzy match on last-10 phone + name similarity |
| Idempotent MRN assignment | RPC `assign_patient_mrn(p_patient_id)` (migration 046), `ensurePatientMrnIfEligible()` | Safe to call repeatedly |
| Per-doctor patient ownership column | `patients.doctor_id` (migration 113, nullable + indexed) | Currently NULL for manual / book-for-other rows |
| Role-gated second portal precedent | `middleware/require-admin.ts`, `frontend/app/admin/layout.tsx`, `components/admin/AdminShell.tsx` | JWT `app_metadata.role` read server-side only |
| Full clinical cockpit | `components/patient-profile/PatientProfilePage.tsx` + `ehr/` roadmap | Rx, SOAP panes, chart, vitals, diagnoses |

### The four real gaps

| Gap | Evidence | Phase |
|-----|----------|-------|
| **No non-doctor identity.** Every doctor-scoped controller does `const doctorId = req.user.id`. Only `admin` exists as a role. | `appointment-controller.ts:100`; `middleware/require-admin.ts:39–48` | **P1** |
| **No manual patient registration API.** `routes/api/v1/patients.ts` has no `POST /`. `createPatient()` exists but is unusable here (see R9). | `routes/api/v1/patients.ts:46–54` | **P2** |
| **No front-desk surface.** `/dashboard/*` is doctor-clinical throughout; nothing a receptionist can safely be given. | Frontend route tree | **P3** |
| **Walk-ins have no chart.** The `walkin: true` path deliberately skips the `patients` row, so the cockpit renders a stripped 2-pane view with "no chart data". | `lib/patient-profile/v3/cockpit-tabs.ts` (`WALK_IN_TAB_IDS`), `components/opd/OpdSlotRowExpanded.tsx` | **P2 + P4** |

### The load-bearing architectural finding

**Doctor scoping is enforced in the service layer, not by RLS.** The backend reads and writes patients through the service-role client (which bypasses RLS entirely) and checks ownership in code — `getPatientForDoctor(patientId, doctorId, correlationId)` (`patient-service.ts:108`) and the shared `validateOwnership(doctorId, userId)` helper (`utils/db-helpers.ts:92`).

Every doctor-scoped service already takes `doctorId` as an **explicit parameter**. Controllers pass `req.user.id` into it twice — once as the tenant, once as the actor:

```26:32:backend/src/controllers/availability-controller.ts
export const getAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  const availability = await getDoctorAvailability(userId, correlationId, userId);
  res.status(200).json(successResponse({ availability }, req));
});
```

That double-pass is the seam. Introducing staff means splitting it into `actingDoctorId` (tenant) and `actorId` (who is really clicking), which is a **middleware + controller change with no service rewrites and no RLS migration**. This is why P1 is a ~2-day batch rather than a two-week one.

---

## Decisions LOCKED 2026-08-22

Founder-answered at roadmap creation. Phase deep dives MUST respect these or explicitly reopen them.

| ID | Decision | Implication |
|----|----------|-------------|
| **R1** | **Real staff accounts from day one.** Not a shared doctor login, not a PIN-gated desk mode. | P1 comes first and is a prerequisite for P3/P4. Adds ~2 days before any desk UI exists. |
| **R2** | **MRN is assigned immediately on manual create.** | Desk-registered patients appear in the Patients list at once — the MRN gate in `listPatientsForDoctor` no longer means "has paid". Requires R10 so the two populations stay distinguishable. |
| **R3** | **The desk lives at top-level `/desk`, not under `/dashboard`.** | Mirrors `/admin`. A receptionist URL can never accidentally render a prescription. New middleware matcher entry + layout gate. |
| **R4** | **Front-desk walk-ins always create a real `patients` row.** | The pf-16 no-row fast path is no longer the desk's path. Walk-ins get a durable chart the doctor can prescribe against later. See R11 for what happens to the old path. |
| **R5** | **Tenancy stays doctor-shaped. One staff member maps to exactly one acting doctor in V1.** | No clinic/org entity. `clinic_staff` is a link table, not a tenant table. Multi-doctor clinics are explicitly out of scope (see below). |
| **R6** | **No RLS rewrite.** API authorization stays in the service layer against the service-role client. | RLS policies keep their `auth.uid() = doctor_id` shape as defense-in-depth for direct client access. Staff never get a direct-to-Postgres path. |
| **R7** | **Audit records the real actor, not the acting doctor.** | `logDataAccess(correlationId, doctorId, …)` currently attributes staff reads to the doctor. That is a PHI-access-review defect and must be fixed **in P1**, before staff can read any chart. |
| **R8** | **`patients.doctor_id` is the ownership anchor for desk-created patients.** | Migration 113 already added the column (nullable, indexed) and its partial unique index deliberately excludes `platform IS NULL` rows, so two doctors can each hold the same phone. `getPatientForDoctor` gains a third linkage branch. |
| **R9** | **Do not build `POST /patients` on the legacy `createPatient()`.** | It calls `findPatientByPhone` **globally** and throws `ConflictError` on any existing phone — which contradicts migration 113's deliberate per-doctor allowance. Model on `createPatientForBooking()` + `findPossiblePatientMatches()` instead. |
| **R10** | **Stamp provenance on the patient row.** `patients.registered_via` (`bot \| front_desk \| booking_for_other \| import \| doctor`) plus `created_by` (auth user). | Channel + actor so doctor vs front-desk entry is not an argument. See [`ANALYTICS_INTAKE_VS_REGISTERED.md`](../../../Reference/product/patients-and-practice/ANALYTICS_INTAKE_VS_REGISTERED.md). |
| **R11** | **The pf-16 no-patient-row walk-in path is kept but demoted.** | It stays reachable from the doctor's own `AddSlotDialog` for true one-offs. It is **not** exposed on the desk. Removing it entirely is a follow-up once desk usage proves nobody needs it — deleting it now would also delete `buildWalkInCockpitTabs` and its tests mid-pilot. |
| **R12** | **Deep dives one phase at a time.** This file stays the index. | P1 is spec'd; P2–P4 are sketches until committed. |

## Decisions LOCKED 2026-09-13 — job-shaped desk UI

Founder-agreed after the seat split (`237`). Phase work MUST respect these or explicitly reopen them. Complements R3 (desk stays at `/desk`) and RQ1 (one active login per ticked job).

| ID | Decision | Implication |
|----|----------|-------------|
| **R13** | **One portal. A job is a panel, not an app.** Every staff login stays on `/desk`. Do not add `/desk/vitals`, `/desk/labs`, or a new JWT role per job. | Shared shell, Today list, and acting-doctor. `clinic_staff.capabilities` decide which panels mount. A later job is “append to prep order + add a panel.” |
| **R14** | **Two families.** `front_desk` is the counter (check-in, Today, collect, move, left). `vitals` / `history` / `internal_labs` / `papers` are per-visit prep on a selected patient. | Registration is never a stepper step. Counter-only logins never see prep forms. Prep-only logins never see register / collect / hisab. Mixed logins: counter first, then their prep slots after arrive/collect. |
| **R15** | **Prep order is clinic flow, hardcoded.** `vitals → history → internal_labs → papers`. Filter that list by the seats this login holds. Never sort by assignment time, alphabet, or what’s still empty. Not doctor-configurable in V1. | Source of truth: `PREP_CAPABILITIES` / `WORK_SLOTS`. History + papers → `Health record → Patient files`. Labs-only → labs panel only. Completeness may badge a patient as needed; it must not reshuffle tabs. |
| **R16** | **One held prep slot = that panel, no stepper.** Two or more = existing Next chrome (`Save and next`, last button `Done`). | `DeskPrepPanel` stays one mapper. Hide the stepper chrome when `slots.length === 1`. |
| **R17** | **Today completeness dots do not decide job order.** Splitting the old `reports` glance into labs + papers is a later polish. | Dots follow the same filter-not-reorder rule if they split. |

Landing: only `front_desk` → Check-in; only prep → Today (Check-in hidden; open an arrived/seen visit for that login’s panel); both → Check-in, then prep after collect.

---

## Phase overview

| Phase | Theme | Surface | Effort | Migration | Status |
|-------|-------|---------|--------|-----------|--------|
| **P1 — Staff identity + acting doctor** | `clinic_staff` table, `receptionist` role claim, `resolveActingDoctor` middleware, actor-aware audit, invite/revoke ops path | Backend only | ~2 days | 1 (`200_clinic_staff.sql`) | **Implemented** 2026-08-22 → [`plan-01`](./plan-01-staff-identity-and-acting-doctor.md) |
| **P2 — Manual patient registration** | `POST /api/v1/patients` with doctor-scoped phone dedup, immediate MRN, `registered_via`, `doctor_id` ownership + linkage branch in `getPatientForDoctor` | Backend only | ~1.5 days | 1 (`201_patients_registered_via.sql`) | **Implemented** 2026-08-22 |
| **P3 — `/desk` portal shell** | Route group, middleware matcher, `requireDeskAuth()`, `DeskShell`, staff-scoped `lib/api` surface, 403/no-link empty states | Frontend only | ~1 day | None | **Implemented** 2026-08-22 |
| **P4 — Intake + desk day board** | Phone-first search → register → book → check in; today's list with arrival state; queue/slot aware | Frontend + thin API | ~2.5 days | None | **Implemented** 2026-08-22 |
| **P5 — Desk day-ops** | Cancel waiting, reschedule, left-after-check-in, till reversal, prepaid cancel status | `/desk` + staff appointment writes | ~3–4 days | 1 (till reversal — **225**) | **P5.1–P5.3 implemented** 2026-08-31. P5.4 drafted. → [`plan-05`](./plan-05-desk-day-ops.md) |

**Total (P1–P4):** ~7 dev-days, 2 small additive migrations. **P5** is extra; do not fold it into P4.

---

## Sequencing

```
P1 ──────────► P2 ──────────► P3 ──────────► P4
staff identity  patient API    /desk shell    intake + day board
(backend)       (backend)      (frontend)     (frontend)

    └── both backend-only and independently testable by curl ──┘
                  ship these before any UI exists
```

**Rationale:**

1. **P1 first, forced by R1.** Every later phase needs to know who the acting doctor is. Building P2's `POST /patients` against `req.user.id` and then rewriting it two days later is pure rework.
2. **P2 before P3/P4.** The desk UI is a thin client over this endpoint. Having it curl-able first means the UI phase is pure presentation, and it lets the founder register his first real patients from the terminal before the portal exists — useful if the pilot starts early.
3. **P3 before P4** only because P4 needs somewhere to mount. P3 is a shell with no domain logic; it can be a half-day if the `AdminShell` copy goes cleanly.
4. **P1 and P2 are the risky ones** — they touch the auth path and a PHI table. Both are backend-only, so they can be verified with tests and curl before anyone builds pixels on top.

---

## Cross-cutting principles

These flow from the locked decisions. Phase plans reference this section rather than restating it.

1. **Default behaviour for doctors is byte-identical.** A JWT with no staff role resolves `actingDoctorId = req.user.id` — exactly today's behaviour. Every existing endpoint, test and RLS policy must pass unchanged. This is the single most important regression guard in the program.
2. **Tenant and actor are always separate values.** Once P1 lands, `req.user.id` is the *actor*. Any new code that uses it as a doctor id is a bug. Services keep taking `doctorId` explicitly.
3. **Fail closed on staff resolution.** A JWT carrying a staff role with no active `clinic_staff` row → 403, never a silent fallback to "acts as self". A revoked or suspended staff member loses access on their next request, not on next login.
4. **Roles are read only from the verified JWT.** Never from body, query, or a client-supplied header. Same doctrine as `require-admin.ts`.
5. **PHI hygiene.** Patient name, phone, DOB and MRN never reach logs, Sentry or telemetry. Desk telemetry carries counts and IDs only.
6. **Least privilege at the desk.** A receptionist can read demographic + scheduling data and write intake/booking/check-in. They must not read prescriptions, clinical notes, consult transcripts, or chart panes. Enforce this at the **route** level, not just by hiding UI.
7. **Speed is the acceptance criterion.** If phone-search → registered → booked → checked in takes more than ~30 seconds of typing for a new patient, the phase has not met its bar regardless of feature completeness.

---

## Explicitly out of scope

| Idea | Why not |
|------|---------|
| Multi-doctor clinics / one receptionist serving several doctors | R5. Needs a real clinic/org entity and a doctor-switcher. Revisit only when a multi-doctor customer signs. |
| Billing, cash drawer, receipts, day-end reconciliation | Online booking payments already exist. Walk-in **collect at check-in** shipped after RQ4. Drawer count / receipts still out. **Cancel / reschedule / till return** are P5, not this row. |
| Insurance, TPA, claims | Not in the India pilot's path at all. |
| Printed queue tokens / display board | Paper-parity is a nice-to-have; the day board on a screen is enough for one clinic. |
| Patient photo capture, ID/Aadhaar scan, document upload at desk | Adds DPDP surface area for no pilot value. Capture in `capture/features/patients/` if asked for. |
| Offline-first / PWA desk that survives internet loss | Real clinic concern, wrong time. Revisit after the pilot proves the flow. |
| Staff scheduling, shifts, attendance | Not a clinical product. |
| Desk-initiated WhatsApp/SMS to patients | Notification fan-out is owned by the integrations roadmap. |
| Editing clinical content from the desk | Violates principle 6. Hard no. |
| Merging the desk into `/dashboard/opd-today` | R3. Considered and rejected — that page is doctor-clinical. |
| Per-job portals (`/desk/vitals`, `/desk/labs`) or a JWT role per seat | R13. Same login, same shell, capability-filtered panels. |
| Doctor-configurable prep order | R15. Revisit only if a real clinic does papers before vitals. |

---

## Open questions

Answer during the relevant phase deep dive; update this table when resolved.

| ID | Question | Affects | Default if unanswered |
|----|----------|---------|----------------------|
| **RQ1** | How does a staff account get created — founder-run script, admin console screen, or doctor-facing invite in settings? | P1 ops path | **Revised 2026-09-13.** Doctor Settings → Staff. Many logins. **One active login per ticked job** (`front_desk`, `vitals`, `history`, `internal_labs`, `papers`; migration `237`). Combined-role people occupy every seat they hold. A second login for the same seat starts suspended. Delete removes the link (auth user kept so the email can be re-added). Admin + CLI follow the same seat rule. |
| **RQ2** | Is the role claim (`app_metadata.role = 'receptionist'`) authoritative, or is the `clinic_staff` row? | P1 middleware | **The row is authoritative**; the claim is only a routing hint so the frontend can pick a landing page. Revocation must not depend on a token refresh. |
| **RQ3** | What does the desk see of a patient's history — nothing, or last-visit date + upcoming appointments? | P4 scope, principle 6 | **Scheduling facts only** (last visit date, next appointment, MRN, tags). No diagnoses, no Rx, no notes. |
| **RQ4** | Should the desk be able to collect a fee / mark "paid at desk"? | P4, out-of-scope boundary | **Superseded 2026-08-30.** Walk-in collect at check-in (Cash / UPI / Card / No charge). No Collect / Due on Today. Reversal / prepaid refund = P5. |
| **RQ5** | On a dedup hit, does the desk auto-merge, prompt, or always create new? | P2 | **Prompt.** Show the candidate matches from `findPossiblePatientMatches` and make the receptionist pick "this is them" or "new patient". Never auto-merge PHI. |
| **RQ6** | Does check-in belong on the desk only, or should the doctor's OPD board also expose it? | P4 | **Both** — desk Today + doctor `/dashboard/opd-today` (⋯ → Arrive). Same `patient_checked_in_at`. Desk-only stamps show **Arrived**, not a false lobby Stepped away. |
| **RQ7** | Do desk-created appointments notify the patient (DM/email) the way bot bookings do? | P4 | **Resolved 2026-08-23.** Walk-ins stay silent. Phone pre-bookings (`booking_origin = booked`) fan out SMS / email / DM via `sendDeskBookingConfirmationToPatient` — same confirmed-time copy as the bot payment DM, without "Payment received". |
| **RQ8–RQ10** | Token keep vs new; Left vs Cancelled chip; clinic-caused cancel | P5 | Defaults in [`plan-05`](./plan-05-desk-day-ops.md). |
| **RQ11** | If one login holds more than one job, what UI do they get, and in what order? | Desk prep chrome | **Locked 2026-09-13.** R13–R17. One `/desk`. Filter `vitals → history → internal_labs → papers`. One slot = no stepper; many = Next. `front_desk` is a sibling surface. |

---

## How to use this doc

1. This file is the SoT for receptionist-portal sequencing until a phase is promoted.
2. When a phase is committed → its deep dive lives in this folder as `plan-0N-<slug>.md`, then promotes to `Daily-plans/<date>/receptionist-portal/p{N}-<slug>/Tasks/` per [`PHASED-PLANS-GUIDE.md`](../../process/PHASED-PLANS-GUIDE.md).
3. Both migrations in this program are on the **hard-rules list** (new migration + PHI table). Per [`.cursor/rules/00-agent-contract.mdc`](../../../../.cursor/rules/00-agent-contract.mdc), surface them for an Opus turn rather than letting an Auto model write them.
4. Drive-by ideas go to [`capture/inbox.md`](../../capture/inbox.md), not into this file.

---

**Created:** 2026-08-22
**Owner:** Founder (product)
**Status:** `Drafted` — P1 spec'd, P2–P4 sketched
**One-liner:** Staff identity → patient registration API → `/desk` shell → intake and day board. Four phases, ~7 dev-days, two additive migrations, no RLS rewrite.
