# rcp-29 · Split shared rows, backfill, drop the global index (Phase 6 closer)

> **Phase 6, step 5 (closer)** of [receptionist-rearchitecture](../plan-p6-receptionist-identity-batch.md) · order in [EXECUTION-ORDER-p6-receptionist-identity.md](./EXECUTION-ORDER-p6-receptionist-identity.md). The only task that **rewrites persisted PHI data**: split every shared global `patients` row into per-doctor rows, re-point each doctor's conversations + appointments, then drop the global unique index and retire the compat fallback. Analogous to rcp-19 — the focused, well-gated PR where the "new migration = hard rule" applies.

| **Size** | M–L | **Model** | **Auto** (optional **1 Opus diff-skim** — persisted PHI + cross-tenant) | **Wave** | 6 | **Depends on** | rcp-25, rcp-26, rcp-27, rcp-28 | **Blocks** | — (Phase 6 close) | **Status** | done |

---

## Why this is its own PR

rcp-25..28 kept existing shared rows resolvable via the compat fallback so partial deploys and non-DM readers stayed safe. Converging the data — cloning each shared row per doctor and re-pointing FKs — touches live patient records (PHI, consent) and is irreversible-ish, so it gets one carefully-reviewed, idempotent, dry-runnable migration. This is the single place the efficiency guide's migration hard-rule binds.

## What to do

1. **Backfill / split script** `backend/scripts/backfill-perdoctor-patient-identity.ts` (`--dry-run` first, idempotent):
   - Find each global `patients` row with `platform IS NOT NULL` referenced by **more than one doctor** (via `conversations.doctor_id` / `appointments.doctor_id`).
   - For each *additional* doctor, **clone** a per-doctor `patients` row (copy demographics + that doctor's relevant consent state; set `doctor_id`, keep `platform`/`platform_external_id`), then **re-point that doctor's `conversations.patient_id` + `appointments.patient_id`** to the clone.
   - Leave one doctor on the original row and stamp its `doctor_id`. Single-doctor rows just get `doctor_id` set (no clone).
   - **Consent on clones:** copy the granting doctor's state only where it legitimately applies; default others to `pending` (a follower who consented at Dr A did **not** consent at Dr B — DL-7). Document the rule in the script header.
2. **Drop the global sharing.** Remove the legacy `idx_patients_platform_external_id` unique index (`004` :30–33 / `007`); the partial per-doctor unique (rcp-25) becomes the only identity constraint.
3. **Retire the compat fallback.** `resolvePatientForChannelSender` (rcp-25) drops the global `findPatientByPlatformExternalId` branch; resolution is conversation-first → per-doctor create only. Delete/quarantine `findPatientByPlatformExternalId` as a resolution path.
4. **Docs.** Update migration `004`/`007` superseded notes + `types/database.ts` `Patient.doctor_id` and the identity model description.

## Acceptance gate

- [x] Split script is **idempotent**, dry-runnable, and verified: a shared PSID across N doctors ⇒ N per-doctor rows, each doctor's conversations + appointments re-pointed to *their* row, demographics intact, consent per the documented rule.
- [x] **Migration/load test** runs real-shaped shared rows (and single-doctor rows, and book-for-other `platform=null` rows) through the split and asserts FK integrity + per-doctor isolation + no orphaned/cross-linked appointments.
- [x] Legacy global unique index dropped; per-doctor partial unique enforced; compat fallback removed; `findPatientByPlatformExternalId` no longer a resolution path (grep-clean).
- [x] Full `dm-routing-golden` + `webhook-worker-characterization` **byte-identical**; notification + consent + merge tests (rcp-27/28) green; `npx tsc --noEmit` clean. (Optional 1 Opus diff-skim of the split script recorded.)

## Anti-goals

- ❌ Don't drop the global index **before** the split completes — converge first, then drop (an early drop strands resolution for unmigrated rows).
- ❌ Don't copy a granting consent across doctors — re-derive per doctor; over-copying consent is a DL-7 violation worse than re-asking.
- ❌ Don't touch book-for-other (`platform=null`) rows or merge their identity — they're not part of the PSID-sharing problem.
- ❌ Don't re-point another doctor's appointments to the wrong clone — scope every re-point by `doctor_id`.

## Risks

- **In-flight PHI corruption (the one real hazard).** A wrong split cross-links a patient's appointments to another clinic or mis-copies consent. Mitigation: idempotent + dry-run with counts, the load test over real-shaped rows, and re-pointing strictly by `doctor_id`. Stage behind a deploy where rcp-27 (readers ready for duplicates) is already live.
- **Consent over/under-copy.** Copying too liberally re-grants consent a patient never gave (privacy breach); copying too little forces a known patient to re-consent (mild UX). Bias to **under-copy** (default `pending`) — re-asking is the safe failure (DL-2/DL-7).
- **Orphan rows from rcp-26 races.** The mixed-mode window may have produced stray placeholder rows; the split must tolerate/clean them (idempotent re-run).
- **Single-tenant rows.** Most followers belong to one doctor — those just get `doctor_id` stamped (no clone). Verify the common case is a cheap no-op, not a needless clone.
