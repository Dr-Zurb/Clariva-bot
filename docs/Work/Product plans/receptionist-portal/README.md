# Receptionist portal — product plan

Human front-desk staff, with their own logins, doing **offline** (walk-in / phone) patient intake — the counterpart to the AI receptionist that today handles Instagram/Facebook DM intake.

| File | Purpose |
|------|---------|
| [`plan-00-receptionist-portal-roadmap.md`](./plan-00-receptionist-portal-roadmap.md) | Master index — decision locks, phase table, sequencing, out-of-scope, open questions |
| [`plan-01-staff-identity-and-acting-doctor.md`](./plan-01-staff-identity-and-acting-doctor.md) | P1 deep dive — `clinic_staff` table, acting-doctor middleware, actor-aware auditing |
| [`task-p4-desk-edit-patient.md`](./task-p4-desk-edit-patient.md) | P4 follow-up — `PATCH /patients/:id` + Check-in Edit. No delete. Shipped. |
| [`task-p4-desk-archive-patient.md`](./task-p4-desk-archive-patient.md) | P4 follow-up — hide/restore patient. Migration **209**. **Opus.** |
| [`plan-05-desk-day-ops.md`](./plan-05-desk-day-ops.md) | P5 — cancel, reschedule, till reversal, prepaid cancel. Drafted 2026-08-30. |
| [`task-p5-cancel-waiting.md`](./task-p5-cancel-waiting.md) | P5.1 — cancel waiting/booked |
| [`task-p5-reschedule.md`](./task-p5-reschedule.md) | P5.2 — move time / day |
| [`task-p5-left-and-till-reversal.md`](./task-p5-left-and-till-reversal.md) | P5.3 — left after check-in + till return. Migration **225**. |
| [`task-p5-prepaid-cancel.md`](./task-p5-prepaid-cancel.md) | P5.4 — cancel prepaid booked + refund status |

**Status:** P1–P4 plus RQ1/RQ6/RQ7 shipped. Desk walk-in collect at check-in (no Due / Collect on Today). **P5.1–P5.3 shipped** (cancel waiting, move, left + till return). P5.4 prepaid cancel still drafted. Doctor Settings → Front desk: many receptionist logins, one active (migration **205**). They sign in at `/desk`.

**Trigger:** founder is starting a real-patient pilot in his own OPD. Offline intake is the blocker — today the only way a patient enters the system is through the DM bot.

---

## Naming — two different "receptionists"

This codebase already uses "receptionist" for the **AI bot**. Keep them separate when reading or writing code:

| Term | Means | Lives in |
|------|-------|----------|
| **AI receptionist** / receptionist bot | The DM conversation engine that greets, qualifies and books | `docs/Reference/product/receptionist-bot/`, `workers/dm/`, `doctor_settings.instagram_receptionist_paused` |
| **Receptionist portal** (this program) | A human at the front desk with their own login | This folder; `/desk` route; `clinic_staff` table |

Do **not** overload `instagram_receptionist_paused` or the `service_staff_review_*` tables — neither is about human staff accounts.

---

## Related

- Deferred predecessor → [`capture/features/patients/deferred-doctor-ui-add-patient-2026-04.md`](../../capture/features/patients/deferred-doctor-ui-add-patient-2026-04.md) (this program resumes it)
- Roster / MRN semantics → [`PATIENT_REGISTRATION_AND_ROSTER.md`](../../../Reference/product/patients-and-practice/PATIENT_REGISTRATION_AND_ROSTER.md)
- Day-operations surface this feeds → [`plan-opd-slot-hub.md`](../plan-opd-slot-hub.md), `/dashboard/opd-today`
- Clinical spine the intake lands in → [`ehr/plan-00-ehr-roadmap.md`](../ehr/plan-00-ehr-roadmap.md)
- Auth precedent to copy → admin console (`middleware/require-admin.ts`, `frontend/app/admin/layout.tsx`)
