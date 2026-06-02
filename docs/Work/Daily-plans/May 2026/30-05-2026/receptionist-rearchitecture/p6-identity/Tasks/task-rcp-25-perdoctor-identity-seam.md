# rcp-25 · Per-doctor identity resolution seam (compat scaffold)

> **Phase 6, step 1** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md) · order/playbook in [EXECUTION-ORDER-p6-receptionist-identity.md](./EXECUTION-ORDER-p6-receptionist-identity.md). Seam-first, like rcp-03/09/14/20: route **all** Instagram-sender→patient resolution through **one** function and add the per-doctor schema — as a **behavior-preserving compat layer** (still resolves the existing global row until the rcp-29 backfill). Later tasks flip resolution to per-doctor behind this seam.

| **Size** | M | **Model** | **Composer / Auto** | **Wave** | 6 | **Depends on** | Phase 5 (rcp-24) | **Blocks** | rcp-26, rcp-27, rcp-28, rcp-29 | **Status** | done |

---

## Why first

Today a single global row maps an IG account to a patient: `idx_patients_platform_external_id` is **unique on `(platform, platform_external_id)` with no `doctor_id`** (migration `004` :30–33), and `findOrCreatePlaceholderPatient(_doctorId, …)` (`patient-service.ts:1111`) **ignores the doctor** — it resolves via the global `findPatientByPlatformExternalId` (`:1074`). So two clinics that share one IG follower share one `patients` row, one `consent_status`, one revocation. rcp-24 could only firewall *history* at read-time; this phase fixes *identity*. Every later task needs a single resolver + a per-doctor key to migrate behind — land both now, doing nothing yet.

> **Decision (committed): per-doctor `patients` rows, resolved conversation-first — not a junction table.** `conversations` is **already** per-doctor (`UNIQUE(doctor_id, platform, platform_conversation_id)`), and consent is read **only via `conversation.patient_id`** (never by `(doctor, patient)`). So one `patients` row per `(doctor, sender)` makes consent per-doctor **for free, with zero consumer churn**. A `patient_identities` junction would force consent off the patient row and rewrite every consent read — exactly the churn the [efficiency guide](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) says to avoid. (This also matches the existing reality: patients are already doctor-scoped via appointments/conversations; there is no cross-doctor clinical sharing.)

## What to do

- **Migration (additive, no backfill).** Add nullable `patients.doctor_id` (FK `auth.users`) and a **partial** unique index `UNIQUE (doctor_id, platform, platform_external_id) WHERE platform IS NOT NULL`. **Keep** the legacy global `idx_patients_platform_external_id` for now (rcp-29 drops it). No data moves this PR.
- **One resolver** `resolvePatientForChannelSender({ doctorId, channel, senderId, correlationId }): Promise<Patient>` (in `patient-service.ts` or a new `services/patient-identity-service.ts`):
  - **Conversation-first:** `findConversationByPlatformId(doctorId, channel, senderId)` → return that `conversation.patient_id`'s patient (already per-doctor).
  - **Compat fallback (temporary):** if no conversation, fall back to today's global `findOrCreatePlaceholderPatient` so existing shared rows keep resolving until rcp-29. Behavior-identical today.
- **Route the turn entry through it.** `run-conversation-turn.ts:267`–`:285` calls `resolvePatientForChannelSender` instead of `findOrCreatePlaceholderPatient` directly. Same patient resolved today (compat path).
- **Leave consumers alone.** Everything that reads `conversation.patient_id` (booking/consent/slot/notification) is untouched — they already get the right per-doctor patient once resolution flips (rcp-26/29).

## Acceptance gate

- [x] Migration adds `patients.doctor_id` + partial unique `(doctor_id, platform, platform_external_id)`; legacy global unique index still present; `npx tsc --noEmit` + migration apply clean.
- [x] `resolvePatientForChannelSender` is the **only** entry the turn uses for sender→patient; grep shows `findOrCreatePlaceholderPatient` no longer called directly from the worker.
- [x] **Behavior-preserving:** same patient resolved as today for existing rows; `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**.
- [x] Unit tests: conversation-first hit returns `conversation.patient_id`; no-conversation falls back to compat; resolver carries `doctorId` through.

## Anti-goals

- ❌ Don't backfill or split any existing shared row, and don't drop the legacy global index (rcp-29).
- ❌ Don't create per-doctor rows for new contacts yet (rcp-26) — this PR only adds the seam + schema.
- ❌ Don't move consent off the `patients` row (the whole point of per-doctor rows is to avoid that).
- ❌ Don't touch `conversations` schema — it's already per-doctor.

## Risks

- **Silent extra row.** A resolver that creates instead of reusing during the compat window could spawn duplicate patients. Keep creation in the existing `findOrCreatePlaceholderPatient` (with its 23505 race-retry, `:1144`–`:1158`) for now; this PR only *reads* conversation-first then delegates.
- **Partial-index correctness.** `WHERE platform IS NOT NULL` must exclude book-for-other / manual patients (`platform = null`, `createPatientForBooking` `:795`) so they're never caught by per-doctor uniqueness. Pin with a book-for-other row in the migration test.
- **Missed resolution site.** Grep every `findOrCreatePlaceholderPatient` / `findPatientByPlatformExternalId` caller now; any that bypasses the resolver will resolve the wrong (global) row after rcp-29.
