# rcp-27 · Doctor-scope the global PSID readers (notifications + search)

> **Phase 6, step 3** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md) · follows the **[identity-migration playbook](./EXECUTION-ORDER-p6-receptionist-identity.md#identity-migration-playbook-shared-recipe)**. Once a PSID can map to **multiple** patient rows (rcp-26 + the rcp-29 backfill), any code that assumes **one** global row breaks. Sweep those readers and make them doctor-scoped — **before** the backfill creates duplicates.

| **Size** | M | **Model** | **Auto** | **Wave** | 6 | **Depends on** | rcp-25 | **Blocks** | rcp-29 | **Status** | done |

---

## Why this slice

The dangerous reader is `findPatientByPlatformExternalId` (`patient-service.ts:1074`): a global `.eq('platform_external_id').single()` that **throws / mis-resolves** the moment two doctors share a PSID. It must stop being a resolution path before rcp-29. The good news (verified): the **notification** recipient resolver reads the patient **by `appointment.patient_id`** (`notification-service.ts:159`–`:167`), which is already per-doctor — so its tier-1 stays correct; only the *global PSID lookup* and *handle search* need attention.

## What to do

Per the playbook — grep the §"change surface" list in the execution-order doc and doctor-scope each:

- **Retire global resolution.** Ensure nothing except compat/backfill calls `findPatientByPlatformExternalId`. The engine resolves via rcp-25's `resolvePatientForChannelSender` (conversation-first); other callers move to a doctor-scoped `findPatientByChannelSender(doctorId, channel, externalId)` (uses the partial unique index).
- **Notification recipient resolution** (`notification-service.ts` :156–188, :287–320, :424–459, :1105–1138, :1757–1784). Confirm each resolves recipient via `appointment.patient_id` (per-doctor) → doctor-scoped `conversations.platform_conversation_id` (already filters `doctor_id`, `:172`–`:174`) → `appointment.conversation_id`. Remove any reliance on a *globally-unique* `platform_external_id`. Book-for-other (no platform on the booked patient) must still reach the **booker** via `appointment.conversation_id` (migration `017`).
- **Patient search / list** (`fetchLinkedPatientRows` `:255`–`:320`, `patient-service.ts:667`, `patient-list-segment-sql.ts:57`). These are already doctor-scoped via appointment/conversation links — verify a shared PSID surfaces **only that doctor's** patient row (no other clinic's row leaks into search).

## Acceptance gate

- [x] No engine/runtime path resolves a sender via the global `findPatientByPlatformExternalId().single()`; callers use the doctor-scoped resolver/lookup (grep-clean except compat/backfill in rcp-29).
- [x] **Notification tests** (existing `notification-service*.test.ts`): payment-confirmation, consult-link, prescription, and book-for-other recipients all resolve correctly when a PSID maps to multiple per-doctor rows; targeted test added for the multi-row case.
- [x] **Search isolation test:** doctor-scoped patient search for a shared PSID returns only the calling doctor's row.
- [x] `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change notification *content* or the 3-tier fallback *order* — only the doctor-scoping of each tier.
- ❌ Don't change book-for-other recipient logic (it already routes via `appointment.conversation_id`).
- ❌ Don't drop the legacy index or run the backfill (rcp-29) — this PR makes readers *ready* for duplicates.

## Risks

- **Cross-service blast radius (highest in Phase 6).** Notifications run outside the DM golden corpus; a missed doctor-scope sends a payment/prescription DM to the **wrong clinic's** thread. The targeted multi-row notification tests are mandatory, not optional.
- **`.single()` landmines.** Any remaining `.eq('platform_external_id').single()` will start throwing after the backfill. Grep for `platform_external_id` across `backend/src` and confirm each is either removed, doctor-scoped, or a search `LIKE` (multi-row OK).
- **Book-for-other regressions.** The booked patient has no platform identity by design; only `appointment.conversation_id` reaches the booker. Pin a book-for-other payment-confirmation fixture.
