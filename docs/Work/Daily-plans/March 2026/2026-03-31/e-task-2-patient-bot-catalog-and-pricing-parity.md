# e-task-2: Patient bot & pricing parity with service catalog + practice currency

## Task overview

**Problem:** Doctor-facing settings now emphasize **`service_offerings_json`** and **practice currency**. The **patient Instagram DM bot** and related helpers still mix **legacy** patterns (`appointment_fee_minor`, `consultation_types` free text) with **SFU-08** catalog formatting. List prices appear in the AI context, but **per-modality follow-up policies** are **not** summarized — the model may under-explain follow-up pricing. Payment / quote paths may still assume a flat fee exists.

**Goal:** After **e-task-1**, ensure all **patient-visible** and **AI** pricing context:

1. Prefers **`service_offerings_json`** when present (labels, `service_key`, text/voice/video list prices in **practice currency**).
2. Includes **concise follow-up policy** lines per modality where `followup_policy.enabled` (max visits, window days, discount type/value) so SYSTEM FACTS match checkout logic (`consultation-quote-service`).
3. Does **not** rely on **`appointment_fee_minor`** for “has pricing” when a non-empty catalog exists.
4. Defines explicit behavior when **catalog is empty** and **fee is null** (quote error, DM copy, onboarding).

**Out of scope:** Rewriting entire booking FSM; WhatsApp/other channels unless they share the same composer.

---

## Reference (code anchors)

| Concern | Location |
|---------|----------|
| Doctor → AI context | `instagram-dm-webhook-handler.ts` → `getDoctorContextFromSettings` |
| Catalog compact line for LLM | `consultation-fees.ts` → `formatServiceCatalogForAiContext` |
| Flat fee line for LLM | `consultation-fees.ts` → `formatAppointmentFeeForAiContext` |
| DM fee body to patient | `consultation-fees.ts` → `formatConsultationFeesForDm` and related |
| Composer passes settings | `dm-reply-composer.ts` |
| AI fee block assembly | `ai-service.ts` → `buildResponseSystemPrompt` (SYSTEM FACTS — FEES) |
| Quote / slot checkout | `consultation-quote-service.ts`, `slot-selection-service.ts` |
| Legacy error | `errors.ts` → `LegacyAppointmentFeeNotConfiguredError` |

---

## Task breakdown

### 1. Enrich `formatServiceCatalogForAiContext`

- [ ] For each service row, after modality list prices, append **short follow-up snippets** where `followup_policy` is enabled on that modality (SFU-12), e.g. `follow-up: 25% off up to 3 visits / 90d` — keep under a **character budget** to avoid blowing context.
- [ ] Ensure **non-INR** display uses `appointment_fee_currency` consistently (already partially done for list prices; verify follow-up text does not hard-code ₹).
- [ ] Unit tests in `backend/tests/unit/utils/consultation-fees.test.ts` (update existing SFU-08 test).

### 2. `getDoctorContextFromSettings` (Instagram worker)

- [ ] Replace or supplement **`hasFeeOnFile`** gating: treat **non-empty catalog** as “has structured pricing” so doctor context is built for catalog-only practices.
- [ ] Keep **`appointment_fee_summary`** only when `appointment_fee_minor` is set **and** product still supports legacy; if legacy is retired, **omit** flat fee block from AI when null (avoid “standard fee” confusion).
- [ ] Verify **`consultation_types`** free-text: document as **optional supplement**; do not let it **contradict** catalog amounts in prompts (AI prompt already says use stored lines; consider deprioritizing or labelling “legacy notes” if catalog present).

### 3. DM reply / patient-visible fee messages

- [ ] Trace `formatConsultationFeesForDm` (and callers) for booking / fee replies: ensure **catalog path** is used when `service_offerings_json` is valid; currency from `appointment_fee_currency`.
- [ ] When catalog empty and fee null: **deterministic** safe message (e.g. “Fees are set per service — please check booking page or message the clinic”) — no invented numbers.

### 4. Quote & payment alignment

- [ ] Confirm `consultation-quote-service` / `slot-selection-service` behavior when **no catalog** and **`appointment_fee_minor` null** — align with product: **hard error** vs allow $0 (unlikely). Update `LegacyAppointmentFeeNotConfiguredError` message for operators.
- [ ] Document for frontend booking page: payment link prerequisites (catalog row selected + episode quote).

### 5. Prompt hygiene (`ai-service.ts`)

- [ ] If only catalog facts exist, adjust fee instructions so model does not say “standard appointment fee” from old mental model.
- [ ] Optional: single sentence “Practice currency: USD” in SYSTEM FACTS when not INR.

### 6. Tests

- [ ] `consultation-quote-service.test.ts` — legacy vs catalog cases after fee removal policy.
- [ ] `dm-reply-composer` / instagram handler — snapshot or unit test for `getDoctorContextFromSettings` with catalog-only, no `appointment_fee_minor`.
- [ ] Any E2E or integration tests touching payment links.

---

## Acceptance criteria

1. With **valid catalog** + **zero** `appointment_fee_minor`, AI still receives **SYSTEM FACTS — FEES** from **`service_catalog_summary_for_ai`** including **follow-up** hints where configured.
2. Currency in AI and DM text matches **`appointment_fee_currency`** (Practice Info).
3. No code path tells the model that a **flat appointment fee** exists when **`appointment_fee_minor` is null** unless product explicitly keeps legacy.
4. **Empty catalog + null fee:** documented + user-visible behavior is safe and tested.

---

## Dependencies

- **e-task-1** (currency moved to Practice Info; Booking Rules stops clobbering currency).

---

## Risks / notes

- **Token budget:** richer catalog strings increase prompt size; truncate services or modalities if `MAX_SERVICE_OFFERINGS` is large.
- **Clinical wording:** follow-up lines are **financial**, not medical — keep labels aligned with `consultation-quote-service` logic to avoid legal inconsistency.

---

**Last updated:** 2026-03-31
