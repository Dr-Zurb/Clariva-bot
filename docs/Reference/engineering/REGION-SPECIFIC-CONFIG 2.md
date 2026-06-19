# Region-specific configuration registry

> **Purpose:** One place to find every locale/region-specific value in Clariva.  
> India is the current launch default; global rollout should extend packs under  
> `frontend/lib/config/regions/` rather than grep the whole app.

**Last updated:** 2026-06-08

---

## Active region selector (frontend clinical UI)

| Control | Value |
|--------|--------|
| Env var | `NEXT_PUBLIC_CLINICAL_REGION` — `IN` · `UK` · `US` · `EU` |
| Launch default | `IN` (when env unset) |
| Bootstrap | [`frontend/lib/config/apply-clinical-region.ts`](../../../frontend/lib/config/apply-clinical-region.ts) imported from [`frontend/app/layout.tsx`](../../../frontend/app/layout.tsx) |
| Resolver | [`frontend/lib/config/clinical-region.ts`](../../../frontend/lib/config/clinical-region.ts) |
| Region packs | [`frontend/lib/config/regions/`](../../../frontend/lib/config/regions/) |

### How to add a new region-specific clinical value

1. Add the constant to the relevant region file (e.g. `regions/IN.ts`, `regions/US.ts`).
2. Apply it inside that region’s `apply*ClinicalRegion()` function.
3. Add a row to **Extracted** below (and a test in `frontend/lib/config/__tests__/` if applicable).
4. Do **not** hard-code region checks at call sites — read from the applied config object.

---

## Extracted (region packs)

Values applied at bootstrap via `apply-clinical-region.ts`.

| Domain | India (`IN`) | UK / reference (`UK`) | Pack file | Consumed by |
|--------|--------------|-------------------------|-----------|-------------|
| Social history — hazardous units/week | **21** | 14 | [`regions/IN.ts`](../../../frontend/lib/config/regions/IN.ts) · [`regions/UK.ts`](../../../frontend/lib/config/regions/UK.ts) | [`social-history-thresholds.ts`](../../../frontend/lib/cockpit/social-history-thresholds.ts) → intake hints, hazardous label |
| Social history — binge session threshold | 6 | 6 | (WHO default; shared) | `bingeSessionClinicalHint` |
| Social history — pack-years elevated / LDCT | 20 / 30 | 20 / 30 | (shared) | `packYearsClinicalHint` |
| Social history — AUDIT-C / AUDIT-10 / CAGE | WHO defaults | WHO defaults | (shared) | `auditCScore`, `auditFullSeverity`, `cageScore` |

---

## Inline (not yet extracted — migrate when globalizing)

These are **India-oriented or locale-specific today** but live outside the region pack.  
When adding US/UK/EU behaviour, prefer moving them into `frontend/lib/config/regions/`  
or a backend `clinical-region` mirror.

| Domain | Location | Notes |
|--------|----------|--------|
| **Emergency numbers (112 / 108)** | [`backend/src/utils/safety-messages.ts`](../../../backend/src/utils/safety-messages.ts) | India EMS copy + Hindi/Punjabi/Hinglish variants |
| **Modality fee fallbacks (INR)** | [`backend/src/utils/modality-pricing.ts`](../../../backend/src/utils/modality-pricing.ts) | ₹100 / ₹200 / ₹500 text/voice/video defaults |
| **Substances — India catalog extras** | [`frontend/lib/cockpit/social-history-substances.ts`](../../../frontend/lib/cockpit/social-history-substances.ts) | Bhanga, Rx opioid misuse, inhalants when `NEXT_PUBLIC_CLINICAL_REGION=IN` |
| **Alcohol — peg volume + default spirits ABV** | [`frontend/lib/cockpit/social-history-alcohol-drinks.ts`](../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts) | `SPIRITS_ML_PER_UNIT = 30` (Indian peg size); `STANDARD_SPIRITS_ABV = 40%` when Default strength selected; default amount unit `peg` |
| **Alcohol — “Local” drink type** | [`social-history-alcohol-drinks.ts`](../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts) | India-specific catalog entry |
| **Tobacco — gutka/khaini/paan types** | [`frontend/lib/cockpit/social-history-tobacco-products.ts`](../../../frontend/lib/cockpit/social-history-tobacco-products.ts) | Smokeless catalog tuned for South Asia |
| **Payments — Razorpay** | Frontend `NEXT_PUBLIC_RAZORPAY_KEY_ID`, backend Razorpay adapters | India checkout; PayPal for international (see business plan) |
| **Dictation locale** | [`frontend/components/consultation/TextConsultRoom.tsx`](../../../frontend/components/consultation/TextConsultRoom.tsx) | Per-session dictation locale control |
| **Safety locale detection** | [`backend/src/utils/safety-messages.ts`](../../../backend/src/utils/safety-messages.ts) | Script/heuristic locale for fixed safety strings |

---

## Backend clinical region (future)

Social-history **threshold hints are frontend-only** today (passive UI copy).  
Backend zod validates shapes and bounds only — it does not apply hazardous thresholds.

When server-side CDS or reporting needs region:

- Mirror `ClinicalRegionCode` in backend env (e.g. `CLINICAL_REGION=IN`).
- Add `backend/src/config/clinical-region.ts` and register rows in this doc.

---

## Related docs

- Social history thresholds seam: [`social-history-thresholds.ts`](../../../frontend/lib/cockpit/social-history-thresholds.ts) (SHv3-D4)
- Social history v2 plan: [`plan-social-history-v2.md`](../../Work/Product%20plans/ehr/subjective-tab/plan-social-history-v2.md)
- Global launch strategy: [`BUSINESS_PLAN.md`](../../Archive/business/BUSINESS_PLAN.md)
