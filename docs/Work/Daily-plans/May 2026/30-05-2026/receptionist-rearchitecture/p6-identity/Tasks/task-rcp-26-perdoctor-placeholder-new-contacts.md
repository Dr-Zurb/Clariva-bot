# rcp-26 · Per-doctor placeholder creation (isolate new contacts)

> **Phase 6, step 2** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md) · follows the **[identity-migration playbook](./EXECUTION-ORDER-p6-receptionist-identity.md#identity-migration-playbook-shared-recipe)**. Flip *new* first-contacts to per-doctor rows behind the rcp-25 seam, while existing shared rows keep working via the compat fallback until rcp-29. This makes the isolation guarantee true going forward; the backfill (rcp-29) makes it true retroactively.

| **Size** | M | **Model** | **Auto** | **Wave** | 6 | **Depends on** | rcp-25 | **Blocks** | rcp-29 | **Status** | done |

---

## Why this slice

`findOrCreatePlaceholderPatient(_doctorId, platform, externalId)` (`patient-service.ts:1111`–`:1174`) looks up purely by `(platform, externalId)` and reuses whatever global row exists — so the **second** doctor a follower DMs inherits the **first** doctor's patient + consent. Fixing creation is the smallest change that stops *new* cross-doctor bleed immediately, and it's safe because the rcp-25 compat fallback still handles already-shared rows.

## What to do

Per the playbook:

- **Make creation doctor-aware.** `findOrCreatePlaceholderPatient` (rename to `findOrCreatePerDoctorPlaceholder` or keep the name) now keys on `(doctorId, platform, externalId)`:
  - Look up an existing **per-doctor** row (`doctor_id = doctorId AND platform AND platform_external_id`), using the new partial unique index (rcp-25).
  - On miss, **insert a fresh row with `doctor_id` set** (`name: 'Placeholder'`, synthetic phone, `platform`, `platform_external_id`, `doctor_id`).
  - Keep the 23505 race-retry (`:1144`–`:1158`) but re-query **per-doctor**.
- **Wire the resolver.** rcp-25's `resolvePatientForChannelSender` no-conversation branch now calls the per-doctor create (not the global one). Conversation-first stays the primary path.
- **Stop using the global lookup for resolution.** `findPatientByPlatformExternalId` (`:1074`, global `.single()`) is no longer how the engine resolves a sender — leave it for the compat/backfill code only (rcp-29 retires it).
- **Don't touch consent or booking** — a fresh per-doctor placeholder has `consent_status: 'pending'` (default), so a brand-new contact under a second doctor correctly runs the full consent flow (no inherited grant).

## Acceptance gate

- [x] New first-contact under `doctorA` and `doctorB` for the **same IG sender** ⇒ **two** `patients` rows, each with its own `doctor_id` and independent `consent_status` (the headline isolation test).
- [x] Existing shared rows (no per-doctor row yet) still resolve via the rcp-25 compat fallback — no break for in-flight conversations; `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**.
- [x] Per-doctor create respects the partial unique index (no `platform = null` collisions with book-for-other); 23505 retry re-queries per-doctor. `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't backfill/split existing shared rows (rcp-29) — only new contacts go per-doctor here.
- ❌ Don't drop the legacy global index or `findPatientByPlatformExternalId` yet (rcp-29).
- ❌ Don't change book-for-other (`createPatientForBooking` `:795`) — those stay `platform: null`, consent-granted, unaffected by identity.
- ❌ Don't let a new per-doctor placeholder inherit consent from any other doctor's row.

## Risks

- **Mixed-mode window.** Between this PR and rcp-29, some senders resolve per-doctor (new) and some via the global compat row (existing). That's intended and safe (conversations disambiguate), but tests must cover **both** an existing-shared and a new-per-doctor sender in the same suite.
- **Race across doctors.** Two doctors' first DMs from the same sender arriving together must each create their own row — the partial unique is on `(doctor_id, …)`, so they don't collide; pin a concurrent-create test.
- **Search/list duplicates.** Once a PSID can map to multiple rows, doctor-scoped patient search (`fetchLinkedPatientRows`, `patient-list-segment-sql.ts:57`) should still only surface *that doctor's* row — verify in rcp-27.
