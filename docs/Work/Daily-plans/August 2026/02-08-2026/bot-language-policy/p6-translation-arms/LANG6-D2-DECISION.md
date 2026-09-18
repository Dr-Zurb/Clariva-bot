# LANG6-D2 decision — build-time generation (B)

**Decided:** 2026-08-03  
**Decision:** **B — build-time generation** (LLM drafts offline; reviewed arms committed)  
**Who:** Founder (accepted engineering recommendation)

---

## One-page comparison (PHI first)

| | **A — Runtime pass** | **B — Build-time generation** ✅ |
|---|---|---|
| PHI | Rendered name/age/phone/MRN leave the system unless masking is perfect | **Never** — templates only at generation time |
| Latency | +500–1500 ms on cache miss | Zero |
| Review | Reviewing a distribution | Diffable PR; reviewer reads exact bytes that ship |
| Failure | English fallback path required | Cannot fail at send time |
| New copy | Auto-translated | Regeneration step (mitigated by script + CI) |

### Option A exposure (concrete)

From `DM_COPY_PHI_REGISTRY` / LANG5-D3, builders with `phi: true` include (non-exhaustive at decision time):

- `buildConfirmDetailsMessage` — name, age, gender, phone, reason, email  
- `buildPaymentConfirmationMessage` — MRN + appointment datetime  
- `buildStatusSelfOnlyOtherPatientMessage` / status list builders — patient names  
- `buildPatientMatchConfirmMessage` — patient name(s)  
- `buildWelcomeBackSegmentMessage` — first name  

Under A, each booking confirmation turn would send those fields (or a buggy unmasked render) to a translation model. Masking must be complete; an unset registry entry would have to **throw** — a production footgun.

### Honest cost of B

New English copy is not auto-translated. Someone can add an arm and forget to regenerate. Mitigation (lang-25 §4):

1. `npm run locale-arms:generate` produces draft JSON (templates only).  
2. Reviewer approves in-repo (`approved/` + manifest).  
3. `npm run locale-arms:apply` lands arms.  
4. `locale-arm-coverage.test.ts` fails if an enrolled family is neither translated nor `enByPolicy`.

---

## Locked decisions

| ID | Outcome |
|----|---------|
| **LANG6-D2** | **B — build-time generation** |
| **LANG6-D3** | Holds: no PHI to a translation service (templates-only under B) |

§2 of `task-lang-25` (runtime pass) is **N/A**. §3 is the implemented path.

---

## Walkthrough (proof family)

1. Generate draft: `npm run locale-arms:generate -- --family non-text-ack`  
2. Reviewer edits `backend/locale-arms/drafts/non-text-ack.draft.json`  
3. Approve: copy to `approved/` + set `reviewedAt` / `reviewer` in manifest  
4. Apply: `npm run locale-arms:apply -- --family non-text-ack`  
5. Snapshots + coverage test green  

First shipped family: `buildNonTextAckMessage` (lang-25 proof).
