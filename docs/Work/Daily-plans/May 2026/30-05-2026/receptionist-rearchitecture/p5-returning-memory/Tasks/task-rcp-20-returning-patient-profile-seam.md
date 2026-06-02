# rcp-20 · Returning-patient profile read seam (dormant scaffold)

> **Phase 5, step 1** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md) · order/playbook in [EXECUTION-ORDER-p5-receptionist-returning-memory.md](./EXECUTION-ORDER-p5-receptionist-returning-memory.md). Seam-first, like rcp-03/rcp-09/rcp-14: stand up **one** PHI-safe, doctor-scoped read of "who is this returning patient" and hang it on the turn context — **consumed by nothing yet** (identity pass-through, zero behavior change). rcp-21..23 are its consumers; rcp-24 turns it on.

| **Size** | M | **Model** | **Composer / Auto** | **Wave** | 5 | **Depends on** | Phase 4 (rcp-19) | **Blocks** | rcp-21, rcp-22, rcp-23, rcp-24 | **Status** | done |

---

## Why first

Phase 5 is the first **behavior-changing** phase (welcome-back + skip re-collection), so the riskiest thing isn't a refactor — it's reading the wrong person's history or leaking one clinic's visits into another (DL-2 Safety, DL-6 Privacy). Landing a single, correct, **doctor-scoped, consent-aware, PHI-free** read seam now means every consumer (rcp-21..23) inherits that correctness instead of re-deriving identity rules per stage. The seam does nothing this PR — it just computes a profile and makes it available.

The identity layer it reads already exists (DL-12 was designed for this): a `patients` row keyed by `(platform, platform_external_id)` carries consent (`patients.consent_status`), and `listAppointmentsForPatient(patientId, doctorId)` (`appointment-service.ts:762`) is **already scoped by both `patient_id` and `doctor_id`** — the safe prior-visit source.

## What to do

- **New engine-side module** `backend/src/workers/dm/returning-patient.ts` (channel-free; no `instagram` imports):
  - `loadReturningPatientProfile(input: { doctorId: string; patientId: string; correlationId: string }): Promise<ReturningPatientProfile>`.
  - Reads **consent + demographic presence** from the patient row (`findPatientByIdWithAdmin`, used today at `booking-entry.ts:433`) — store **booleans, never values** (`hasName`, `hasPhone`, `consentStatus`). Real name/phone are read at compose-time by consumers, not carried in the profile.
  - Reads **prior visits** via `listAppointmentsForPatient(patientId, doctorId, correlationId)` — derive `attendedCount` (status `completed`/`confirmed`; see `AppointmentStatus` `database.ts:32`), `lastVisitAt`, `lastServiceKey` (`appointments.catalog_service_key`), `lastModality` (`consultation_type`), and a coarse `recencyBucket`.
  - **Feature flag** `RETURNING_PATIENT_MEMORY_ENABLED` (default **off**, matching the `WHATSAPP_ENABLED` convention) — when off, return `{ isReturning: false }` immediately (no DB reads).
- **Target type** in `types/conversation.ts` (or a new `types/returning-patient.ts`):

```ts
export type ReturningRecencyBucket =
  | 'within_1_month' | 'within_3_months' | 'within_1_year' | 'over_1_year';

/** PHI-safe: no names, phones, emails, or free-text reasons. Enums/booleans/opaque keys/timestamps only (DL-6). */
export interface ReturningPatientProfile {
  isReturning: boolean;              // attendedCount > 0 with THIS doctor
  hasGrantedConsent: boolean;        // patients.consent_status === 'granted'
  consentStatus: 'pending' | 'granted' | 'revoked';
  hasName: boolean;                  // presence only, value never copied here
  hasPhone: boolean;
  knownFieldKeys: PatientCollectionField[];  // names only (e.g. ['name','phone','age'])
  priorVisits: {
    attendedCount: number;
    lastVisitAt?: string;            // ISO timestamp
    lastServiceKey?: string;         // opaque catalog_service_key
    lastModality?: 'video' | 'in_clinic' | 'text' | 'voice';
    recencyBucket?: ReturningRecencyBucket;
  };
}
```

- **Hang it on the turn (dormant):** add `returningProfile?: ReturningPatientProfile` to `DmTurnContext` (`stage-router.ts:38`). Build it in `run-conversation-turn.ts` right after conversation/patient resolution (`:267`–`:296`), pass it into the `turnCtx`, and **stop there** — no stage, predicate, gate, or composer reads it in this PR.

## Acceptance gate

- [x] `loadReturningPatientProfile` exists, is **doctor-scoped** (visit history only ever from `listAppointmentsForPatient(patientId, doctorId)`), and returns a profile with **no PHI** (no name/phone/email/free-text — grep the type).
- [x] Flag **off** ⇒ `{ isReturning: false }` with zero DB reads; flag on + new sender ⇒ `isReturning: false`; flag on + prior attended visit + consent ⇒ `isReturning: true, hasGrantedConsent: true`.
- [x] `consent_status === 'revoked'` ⇒ `hasGrantedConsent: false` (profile still computed; suppression is the consumers' job + rcp-24).
- [x] **Cross-doctor isolation unit test:** same `patientId` under `doctorA` and `doctorB` returns each doctor's visits only — Dr A's history never appears for Dr B.
- [x] `DmTurnContext.returningProfile` is populated but **consumed by nothing**; `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**. `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't consume the profile anywhere yet (rcp-21..23). This PR is the seam only.
- ❌ Don't add new persisted columns or a new table — compute on read. (An optional read-path index is a rcp-24 note, not here.)
- ❌ Don't put any name/phone/email/free-text reason on the profile — enums/booleans/opaque keys/timestamps only (DL-6).
- ❌ Don't read visit history by the **global** `patients.platform_external_id` — only via the doctor-scoped appointment query.

## Risks

- **Global `platform_external_id` (the structural hazard).** The patient row (and thus `consent_status`) is shared across doctors for the same IG account (`patient-service.ts` `findPatientByPlatformExternalId` has no `doctor_id` filter). **Consent may be shared, but visit history must not be** — the doctor-scoped appointment query is the firewall; the cross-doctor isolation test pins it. rcp-24 hardens this end-to-end.
- **"Attended" semantics.** Decide explicitly which `AppointmentStatus` counts as a real prior visit (`completed` = attended; `confirmed` = upcoming/booked). Don't count `cancelled`/`no_show`/`pending` as "returning." Note the dead `'scheduled'`/`'tentative'` strings in `patient-service.ts:395` — don't reuse them.
- **Placeholder patients.** A brand-new sender has a `patients` row with `name: 'Placeholder'` and a synthetic `placeholder-…` phone (`patient-service.ts:1131`). `hasName`/`hasPhone` must treat placeholders as **absent**, not present.
