# Program — Patient health hub

> **Prefix:** `phh`
> **Started:** 2026-08-13
> **One-line intent:** A patient can get their own visits, prescriptions, and reports on request — without an account, scoped to one doctor.

---

## Why

Twelve patient-facing routes exist today and every one of them is scoped to a single appointment or session by a 24-hour token. There is no durable place a patient can return to, so "I lost the prescription DM" becomes a staff task.

The move is **not** a login-based portal. See [`plan-patient-health-hub-charter.md`](./plan-patient-health-hub-charter.md) § *Why not patient accounts* — the short version is that the schema has no concept of a person (only a person-per-doctor), there is no patient-read authorization anywhere in the RLS, and an account contradicts the "install nothing, sign up for nothing" wedge the whole product rests on.

Instead: the DM is the login, the hub is per-doctor, and clinical tabs sit behind an SMS OTP we have already built and shipped for video replay.

---

## Phase table

| Phase | Folder | Status | Ships |
|-------|--------|--------|-------|
| **p1** DM retrieval | _(not planned yet)_ | — | "Send my prescription" / "when is my next visit" / "send my receipt" intents. **No new surface** — reuses `sendPrescriptionToPatient` and the existing `/r/[id]` share page. No migration, no new token. |
| **p2** Hub token + OTP + shell | _(not planned yet)_ | — | Patient-scoped revocable token, OTP gate, `/my-health` tabbed shell, `/my-visit` folded in as the Now tab. **Migration + auth surface → Opus design turn required.** |
| **p3** Records read | _(not planned yet)_ | — | Visits, prescriptions (PDF links), lab reports, vitals trends, transcripts/replay, payment receipts, follow-up due. Read-only. |
| **p4** Accounts | _(not planned yet)_ | — | Only on a PHH-D13 trigger, with the demand documented. Default is that this never ships. |

Execute phases in order. Later phases inherit the [charter decision lock](./plan-patient-health-hub-charter.md) (PHH-D1…D13).

> **p1 before p2 is deliberate.** p1 is the cheapest phase and the only one that produces a demand signal. If patients do not use DM retrieval, that is a cheap answer about whether p2's migration and auth work are worth doing at all.

---

## Blocked on

This program starts **after** [`consult-room-checkin`](../../12-08-2026/consult-room-checkin/) closes (p2 → p3 → p4). Finishing the room comes first: it is where the doctor's time and the patient's trust are actually spent, and `crc` p4 also delivers the Facebook fan-out that PHH-D12 depends on for channel-agnostic link delivery.

---

## Related code (anchors)

| Concern | Path |
|---------|------|
| OTP primitive to reuse (PHH-D3) | `backend/src/services/video-replay-otp-service.ts`; tables from migrations 070, 074 |
| Recording registry + replay contract (p3 consumes) | [`recording-governance-v2` p5 hand-off](../../17-08-2026/recording-governance-v2/p5-access-and-retention/PHH-HAND-OFF.md) |
| Existing patient token (contrast for PHH-D4) | `backend/src/utils/consultation-token.ts` |
| Revocation precedent (PHH-D8) | `backend/src/workers/account-deletion-worker.ts`; `signed_url_revocation` (migration 054) |
| Prescription send + share (p1 reuses whole) | `backend/src/services/notification-service.ts` → `sendPrescriptionToPatient`; `backend/src/routes/api/v1/public-prescription-routes.ts`; `frontend/app/r/[id]/page.tsx` |
| Intents to extend (p1) | `backend/src/types/ai.ts` → `Intent`, `INTENT_VALUES` |
| Clinician-only fields to never expose (PHH-D6) | `prescriptions.assessment_note`, `assessment_acuity` — see `backend/src/types/prescription.ts` |
| Data the hub would project (p3) | `backend/src/services/patient-overview-service.ts` (doctor-scoped today) |
| Now tab (PHH-D7) | `frontend/app/my-visit/`, `frontend/components/opd/PatientVisitSession.tsx` |
| Per-doctor identity constraint (PHH-D2) | `backend/migrations/113_patients_doctor_id_per_doctor_identity.sql`; `backend/src/services/perdoctor-identity-backfill.ts` |
| Rate-limiter patterns (PHH-D11) | `backend/src/middleware/rate-limiters.ts` |

---

**Created:** 2026-08-13.
