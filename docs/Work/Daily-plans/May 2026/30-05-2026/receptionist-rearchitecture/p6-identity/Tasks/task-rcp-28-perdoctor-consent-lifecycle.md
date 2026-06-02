# rcp-28 · Per-doctor consent lifecycle (revocation · deletion scrub · merge)

> **Phase 6, step 4** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md) · follows the **[identity-migration playbook](./EXECUTION-ORDER-p6-receptionist-identity.md#identity-migration-playbook-shared-recipe)**. Per-doctor rows (rcp-26) make consent per-doctor *for free* — but the **write/lifecycle** paths still act globally. Scope revocation, account-deletion scrub, and merge so an action under one clinic never touches another's record. This is the privacy-correctness core of the phase.

| **Size** | M | **Model** | **Auto** | **Wave** | 6 | **Depends on** | rcp-26 | **Blocks** | rcp-29 | **Status** | done |

---

## Why this slice

Two real bugs the shared row created, both fixed by per-doctor rows **only if the lifecycle paths cooperate**:

- **Global revocation.** `handleRevocation` (`consent-service.ts:138`–`:169`) anonymizes the patient and sets `consent_status: 'revoked'` — but it operates on whatever row `conversation.patient_id` points to and **leaves `platform`/`platform_external_id` intact**. On the shared row, a revoke under Dr A revoked the follower for **every** doctor; with per-doctor rows it's naturally scoped, but the retained identity means the same sender re-enters onto the **revoked** row.
- **Global deletion scrub.** `account-deletion-pii-scrub.ts:104`–`:126` nulls `platform_external_id` on the patient, breaking the IG re-link for **all** doctors sharing it.

## What to do

Per the playbook — grep `consent_status`, `handleRevocation`, `platform_external_id`, `mergePatients`:

- **Revocation (`consent-service.ts:138`).** Confirm it acts on the **per-doctor** `conversation.patient_id` row only (it does, post-rcp-26). Decide identity handling on revoke: keep the per-doctor identity link but reset `consent_status` so re-contact re-runs consent on the *same* per-doctor row (preferred — clean re-grant), and document it. Verify `revokeConsentGate` (`control-gates.ts:64`) uses `ctx.patientId` = the per-doctor patient.
- **Account-deletion scrub.** Scope the scrub to the **per-doctor** patient row for the deleting doctor; never null another doctor's identity for a shared PSID. (Post-backfill there's one row per doctor, so this becomes "scrub this doctor's row" — assert it.)
- **`mergePatients` (`patient-service.ts:940`–`:1007`).** It already moves appointments + conversations doctor-scoped and anonymizes the source. Confirm it operates **within one doctor** (per-doctor rows make "merge two rows of the same patient for the same doctor" the only valid case) and that `doctor_id` + identity columns on the surviving row stay correct. Add the missing merge test.
- **Returning-patient privacy test.** `returning-patient-privacy.test.ts` currently *models the shared row* across doctors (the bleed rcp-24 worked around). Update it: per-doctor rows mean consent is **independent** per doctor — assert grant under Dr A does **not** grant under Dr B.

## Acceptance gate

- [x] **Revocation isolation test:** revoke under Dr A leaves Dr B's per-doctor row (and consent) untouched; re-contact under Dr A re-runs consent cleanly on the same per-doctor row.
- [x] **Deletion-scrub isolation test:** scrubbing for Dr A nulls only Dr A's per-doctor identity; Dr B's IG re-link still works.
- [x] `mergePatients` has tests (currently none) covering appointment+conversation move, source anonymization, and per-doctor identity integrity.
- [x] `consent-service.test.ts` + updated `returning-patient-privacy.test.ts` green; `dm-control-gates.test.ts` (revoke gate) green; `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't move consent to a separate table — it lives on the per-doctor `patients` row (the decision in rcp-25).
- ❌ Don't change the consent *copy*, parsing, or the revoke/grant DM semantics — only the **scoping** of the writes.
- ❌ Don't widen PHI: scrub/anonymize fields stay exactly as today (`[Anonymized]`, `revoked-${id}`).

## Risks

- **Consent re-grant UX.** After revoke, re-contact must land on a clean consent ask, not a half-anonymized row that looks "ready." Pin the revoke→re-contact→consent sequence.
- **Merge correctness (no test today).** `mergePatients` has zero coverage (per the audit) yet moves real appointments/conversations. Land the test with the scoping change so a per-doctor merge can't strand or cross-link records.
- **Deletion + shared row during the migration window.** Before rcp-29 backfill, a delete could still hit a shared row. Sequence/document that the scrub-scoping change is safe pre-backfill (it scopes by the per-doctor row that the deleting doctor's conversation points to).
