# rcp-24 · Privacy/identity-scoping hardening + audit + flag flip (Phase 5 closer)

> **Phase 5, step 5 (closer)** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md) · order in [EXECUTION-ORDER-p5-receptionist-returning-memory.md](./EXECUTION-ORDER-p5-receptionist-returning-memory.md). The one task that touches the **sensitive surface** head-on: prove returning-memory can't leak across clinics, prove revoked consent fully suppresses it, audit it cleanly, then **turn it on**. Analogous to rcp-19 in Phase 4 — the focused, well-gated PR where the hard-rule applies.

| **Size** | M | **Model** | **Auto** (optional **1 Opus diff-skim** — privacy/cross-tenant surface) | **Wave** | 5 | **Depends on** | rcp-21, rcp-22, rcp-23 | **Blocks** | — (Phase 5 close) | **Status** | done |

---

## Why this is its own PR

rcp-20..23 each shipped **dark** (behind `RETURNING_PATIENT_MEMORY_ENABLED`, default off) and behavior-neutral when off. Flipping the flag is irreversible-ish in user-trust terms and is exactly the case the [efficiency guide](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)'s "be careful at the boundary" rule covers. The single real hazard in Phase 5 — **one clinic's patient history surfacing in another's DMs** (the global `patients.platform_external_id`, DL-2/DL-6) — gets pinned here, before any patient sees the feature.

## What to do

1. **Cross-tenant isolation (mandatory, the headline gate).** A test where the **same IG sender** (one global `patients` row, one shared `consent_status`) has attended visits under **Dr A** and books with **Dr B**: Dr A's `priorVisits` / `lastServiceKey` / welcome-back **never** surface for Dr B. Pin that every returning read flows through the doctor-scoped `listAppointmentsForPatient(patientId, doctorId)` (`appointment-service.ts:762`) — re-grep for any straggler that reads visit history by `platform_external_id` alone.
2. **Consent-revocation suppression (mandatory).** `consent_status === 'revoked'` ⇒ no welcome-back (rcp-21), no demographic skip (rcp-22), no follow-up offer (rcp-23) — the patient is treated as brand-new and the full data-use consent flow re-runs. Pin both `revoked` and `pending`. (Revocation already anonymizes PHI via `handleRevocation` — assert memory honors it.)
3. **Audit (enum/opaque only).** Emit `returning_patient_recognized` and `collection_skipped` via `logAuditEvent` (`audit-logger.ts:100`) with `redactionApplied: true` and **enums/opaque ids only** (e.g. `recencyBucket`, `skippedFieldKeys`, `attendedCount`) — `validateNoPHI` (`audit-logger.ts:35`) must not throw. No name/phone/reason.
4. **No-new-PHI-in-metadata gate.** Grep the Phase 5 diff: no `patientName`/`lastVisitSummary`/free-text reason key was added to `conversations.metadata`, structured logs, or audit metadata. Phase 5 must not widen the existing `booking.reasonForVisit` PHI footprint.
5. **Flip the flag.** Set `RETURNING_PATIENT_MEMORY_ENABLED=true` in dev; document a staged prod rollout (dev → canary → on) and the single revert (flag off ⇒ exact pre-Phase-5 behavior).

## Acceptance gate

- [x] **Cross-tenant isolation test green** — Dr A's history never appears for Dr B for a shared IG sender.
- [x] **Consent-revocation + pending suppression test green** — returning memory fully off; full consent re-run; PHI honored.
- [x] Audit events emit with `redactionApplied: true`, enum/opaque metadata only; `validateNoPHI` passes; grep confirms no new PHI key in metadata/logs.
- [x] Flag-on: full `dm-routing-golden` + `webhook-worker-characterization` — **non-returning byte-identical**, returning fixtures (rcp-21/22/23) green. Flag-off: identical to pre-Phase-5. `npx tsc --noEmit` clean.
- [ ] (Optional) one Opus diff-skim of the isolation + consent paths recorded.

## Anti-goals

- ❌ Don't flip the flag before the isolation **and** revocation tests pass — they are the gate, not a formality.
- ❌ Don't log or audit any PHI (name/phone/email/reason/message text) — enums/opaque ids only.
- ❌ Don't add new PHI keys to `conversations.metadata` to "make memory easier" — long-term recall belongs in `patients`/`appointments` with consent, read on demand.
- ❌ Don't conflate the **shared** patient row / consent (global) with **doctor-scoped** visit history — the firewall is the appointment query, not the patient row.

## Risks

- **Cross-tenant leak (the one real hazard).** Because the patient row is global, a single missed doctor-scope anywhere leaks Dr A's visits to Dr B. Mitigation: the mandatory isolation test + a grep sweep for `platform_external_id`-only history reads before flipping the flag.
- **Consent race.** A patient who revokes mid-thread must lose memory on the **next** turn (consent re-read each turn from the patient row; don't cache `hasGrantedConsent` across turns).
- **Flag blast radius.** Flipping changes greeting + booking entry + service-match at once. Stage dev-first; keep the off-switch as the instant, total revert. Optional read-path index on `appointments(patient_id, doctor_id, status, appointment_date)` if the per-turn profile read is hot — verify existing indexes first (only add a migration if measured, per the hard-rule).
