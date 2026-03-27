# Plan: Services, consultation modalities & follow-up pricing

**Date:** 2026-03-27  
**Status:** 📋 **PLANNING** — product + engineering spec (not implemented)  
**Scope:** Teleconsultation only for modalities (**text**, **voice**, **video**). **In-clinic** explicitly **out of scope** for this plan until product says otherwise.

---

## 1. Why this exists

Doctors need to:

- Offer **multiple services** (e.g. general checkup, diabetes/HTN, dermatology/skin, bundles like “skin + hair”).
- Restrict **how** each service is delivered: e.g. skin **video only**; another service **text + voice**.
- Set **different fees per modality** for the same service (text ₹X, voice ₹Y, video ₹Z).
- Define **follow-up rules**: how many discounted (or free) follow-ups, **% off / flat off / fixed follow-up price**, and **time windows** — variable by doctor and by service.

The receptionist bot and booking UI must **quote authoritative amounts from this system** (same principle as RBH-13 / fee formatters: **no invented rupees from the LLM**).

---

## 2. Part A — Service catalog & modality grid

### 2.1 Concepts

| Concept | Meaning |
|---------|---------|
| **Service** | One sellable line item the doctor defines: label, optional description, optional internal id. |
| **Modality** | `text` \| `voice` \| `video` (extend later if needed). |
| **Allowed modalities** | Per service: which modes are offered (multiselect). |
| **Index price** | List price for **first visit** in an episode for `(service, modality)`. |
| **Bundle / package row** (optional) | A single service row that represents “skin + hair” at one price table — avoids combinatorial explosion. |

### 2.2 Doctor-facing matrix (UX intent)

For each **service row**:

1. Name + optional description.  
2. **Modality** multiselect: text, voice, video.  
3. For **each selected modality**, a **price** field (currency aligned with practice; today often INR minor units in DB).  
4. **Follow-up policy** block (see Part B) attached to this service.

### 2.3 Example (from discussion)

**Service:** Skin problems  

| Modality | Enabled | Price |
|----------|---------|--------|
| Text | ✅ | ₹1,000 |
| Voice | ✅ | ₹1,500 |
| Video | ✅ | ₹2,000 |

**Follow-up policy (example):** 30% deduction on each follow-up modality price; **`max_followups = 3`** means **three discounted visits after the first completed visit** (UI copy: *“Up to 3 follow-up visits at reduced price after your first completed consultation.”*).

### 2.4 Implementation shapes (later engineering)

| Approach | When to use |
|----------|-------------|
| **Structured JSON** in `doctor_settings` (extend today’s `consultation_types`) | Fast iterate; validate with Zod; admin UI enforces shape. |
| **Normalized tables** `services`, `service_modalities`, `service_prices`, `service_followup_policies` | Reporting, integrity, multi-tenant scale. |
| **Hybrid** | JSON blob v1 → migrate to tables when stable. |

**Today’s codebase:** `consultation_types` is often plain text or compact JSON (`RBH-13`). This plan **supersedes** ad-hoc text for any flow that must quote **per modality** or **follow-ups**.

### 2.5 Bundles (dermatology-style)

Prefer **one service row** per bundle (“Skin + hair”) with its **own** modality matrix, rather than N×M automatic combinations of atomic services — unless you need itemized billing per atomic service.

---

## 3. Part B — Follow-up system

### 3.1 Definitions (defaults locked for v1)

| Term | Definition |
|------|------------|
| **Episode** | A logical course of care: **patient + doctor + service** (+ explicit `episode_id` UUID). Tracks **follow-ups used** and **eligibility window**. Opens when the **index visit completes** (see **Episode open trigger** below). |
| **Index visit** | The **first completed** consultation in the episode for `(patient, doctor, service)`. |
| **Episode open trigger** | **Authoritative:** appointment enters terminal **completed / fulfilled** (tele consult done; doctor or system marks complete). **Do not** open on **booked** alone. **Do not** use **payment alone** as the long-term trigger (timing/refunds vs “care episode”); payment links still attach quote metadata (`index` \| `followup`). **Interim fallback** until the pipeline exposes completion: *payment captured for the index appointment* — replace with **completed** once available. |
| **Follow-up visit** | A later **completed** visit in the **same episode**, satisfying policy (count, window, modality rules). Usage counter increments on the same **completed** event (idempotent). |
| **Service scope** | v1: **same service only**. Patient books a **different** service → **new episode** (full index pricing for that service). |

### 3.2 Policy object (per service)

Configurable fields (conceptual):

| Field | Purpose |
|-------|---------|
| `enabled` | Whether automated follow-up pricing applies. |
| `max_followups` | Max **discounted follow-up visits after** the completed index visit (does **not** count the index). Example: `3` ⇒ index at full price + up to 3 cheaper follow-ups. |
| `eligibility_window_days` | e.g. 90 days from episode start; after that → new index or full price. |
| `discount_type` | `none` \| `percent` \| `flat_off` \| `fixed_price` \| `free`. |
| `discount_value` | Interpretation depends on type (e.g. 30 → 30% off). |
| `apply_to` | `uniform` (same rule every follow-up) vs **tiered** (v2: visit 2 at 50%, 3–4 at 30%). |
| `modality_rule` | v1 default: **`any_allowed`** among modalities enabled for the service — patient may switch modality on follow-up; discount applies to **that visit’s** base from the episode **price snapshot** (see §3.3). v2: optional `same_as_index` or per-modality follow-up overrides. |
| `consumption_on` | **Completed** visit increments `followups_used` (same event as clinical closure). **Cancel** before cutoff: **does not** consume. **No-show:** v1 default **does not** consume; optional per-doctor “no-show consumes slot” in P2. |

### 3.3 Pricing engine (behaviour)

**Inputs:** `patient_id`, `doctor_id`, `service_id`, `modality`, time of booking (for window check).

1. Resolve **active episode** for `(patient, doctor, service)` or classify booking as **new index**.  
2. **Index path:** use modality list price (from Part A).  
3. **Follow-up path:** if episode active, within window, `followups_used < max_followups`, apply `discount_type` to the **locked per-modality base** stored on the episode when the index visit **completed** (snapshot of list prices for that service’s modalities). Avoids disputes if the doctor edits the catalogue mid-episode. **v2:** optional doctor setting “always use current catalogue” if needed.  
4. Output a **quote object**: `{ kind: 'index' \| 'followup', episode_id, visit_index, amount, currency, visits_remaining, … }` for payments + UI + bot.

### 3.4 Episode lifecycle (state machine)

Suggested states:

- `pending` — optional only if product pre-creates an episode before completion; **default v1: omit** — create episode on **index completed**.  
- `active` — index completed; follow-up discounts available until exhausted/expired.  
- `exhausted` — hit `max_followups`.  
- `expired` — past `eligibility_window_days`.  
- `closed` — manual/admin.

**Idempotency:** completing the same appointment twice (webhook retry) must **not** double-increment usage.

### 3.5 Payments

- **Pay per visit:** amount on payment link = `quoted_amount`; metadata stores `episode_id`, `visit_kind: index|followup`, `visit_index`.  
- **Packages / prepaid bundles:** **separate** product (credit ledger); do not pretend a package is only %-off rules.

### 3.6 Edge cases (defaults for v1)

| Scenario | Decision |
|----------|----------|
| Modality switch on follow-up | **Allowed** among service-enabled modalities. Base = **snapshot price for chosen modality**; then apply `discount_type`. |
| Doctor changes catalogue mid-episode | **Locked snapshot** at index completion wins for that episode. |
| Different service booked | **New episode**; index pricing for the new service. |
| Cancel before policy cutoff | **Does not** consume a follow-up slot. |
| No-show | **Does not** consume by default; optional doctor flag later. |
| Doctor lowers `max_followups` | **Grandfather** episodes already `active` with prior cap until exhausted/expired. |

---

## 4. Cross-cutting: bot, dashboard, compliance

### 4.1 Instagram / receptionist bot

- **Understand:** map user language to **service** (+ modality if possible).  
- **Say:** fees and follow-up explanations from **quote engine** / templates — **not** LLM-invented numbers (align RBH-13 / RBH-19).  
- Optional: intent/topic for “follow-up booking” vs “new problem” (later).

### 4.2 Doctor dashboard

- Editor for Part A + Part B per service.  
- Patient view: **active episode**, **remaining follow-ups**, **expiry date** (support + trust).

### 4.3 Privacy & marketing (pointer only)

- **Availability-only** flows (separate initiative): minimize data until user commits to booking; see product/compliance discussion.  
- **Marketing** email/SMS about “slot available” requires **appropriate consent** and purpose — not fully specified here; legal review for DPDP / other markets.

---

## 5. Phased rollout (recommended)

| Phase | Deliverable |
|-------|-------------|
| **P0** | Service + modality + **index prices only** in structured store; bot/dashboard read same source as `consultation_types` evolution. |
| **P1** | **Episodes** + single follow-up rule per service (`max_followups`, one `discount_type`, window, `same_service_only`). |
| **P2** | Tiered discounts, modality rules, cancel/no-show policy, admin episode tools. |
| **P3** | Prepaid packages, bundles as first-class, analytics. |

---

## 6. Metrics

- Quote vs ticket disputes (“wrong price”).  
- Share of visits `index` vs `followup`.  
- Episode exhaustion vs expiry rates.  
- Payment completion on follow-up links.

---

## 7. Related docs & code

- **Fees in DM:** `docs/Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md` (RBH-13).  
- **Hybrid composer:** RBH-19 — authoritative blocks.  
- **Doctor settings:** `consultation_types`, `appointment_fee_*` — migration path to structured services JSON or new tables.

---

## 8. Resolved defaults & remaining open items

### 8.1 Locked defaults (use unless product overrides)

| Topic | Decision |
|-------|----------|
| **Episode / index trigger** | **Appointment completed** (fulfilled tele consult). Not booking-only. Payment is for quotes/settlement; interim fallback = payment captured if “completed” does not exist yet in code. |
| **`max_followups` meaning** | **After** completed index: N discounted **follow-up** visits only (see §2.3 UI copy). |
| **Price base during episode** | **Locked per-modality snapshot** at index completion. |
| **Modality on follow-up** | **Any** modality allowed for that service; discount on chosen modality’s snapshot price. |
| **Different service** | **New episode**. |
| **Cancel / no-show** | Cancel: no consume. No-show: no consume (v1 default). |
| **Policy downgrade** | **Grandfather** active episodes. |
| **Schema first step** | **Hybrid:** validated **JSON v1** in doctor settings for services + policies; **normalize to tables** when reporting/integrity needs it (P2+). |

### 8.2 Still open / deferred

| Item | Notes |
|------|--------|
| **In-clinic modality** | Explicitly **deferred** — not in this doc’s modality enum until product adds it. |
| *Interim vs final “completed” event* | Engineering must align with existing `appointments` status transitions; document the exact status value when shipped. |
| **Pay-after-consult** | If introduced, ensure quote + episode rules still align (episode trigger remains completion; payment may trail). |
| **Tiered discounts** | **P2** in phased rollout — not required for v1 policy object beyond `uniform` rules. |

---

## 9. Next engineering steps — task files

Tracked as **SFU** (services & follow-ups) tasks:

| Step | Task file |
|------|-----------|
| Catalog JSON + Zod + settings API | [tasks/e-task-sfu-01-service-catalog-json-zod-and-settings-api.md](./tasks/e-task-sfu-01-service-catalog-json-zod-and-settings-api.md) |
| Episodes DB + appointment linkage | [tasks/e-task-sfu-02-care-episodes-migration-and-appointment-linkage.md](./tasks/e-task-sfu-02-care-episodes-migration-and-appointment-linkage.md) |
| Quote engine + tests | [tasks/e-task-sfu-03-quote-engine-core-and-tests.md](./tasks/e-task-sfu-03-quote-engine-core-and-tests.md) — **`backend/src/services/consultation-quote-service.ts`** (`quoteConsultationVisit`, `VisitQuote`) |
| Lifecycle on `completed` | [tasks/e-task-sfu-04-episode-lifecycle-appointment-completed.md](./tasks/e-task-sfu-04-episode-lifecycle-appointment-completed.md) |
| Slot selection & payment amount | [tasks/e-task-sfu-05-slot-selection-and-payment-amount-from-quote.md](./tasks/e-task-sfu-05-slot-selection-and-payment-amount-from-quote.md) |
| Dashboard service matrix UI | [tasks/e-task-sfu-06-dashboard-practice-setup-service-matrix-ui.md](./tasks/e-task-sfu-06-dashboard-practice-setup-service-matrix-ui.md) |
| Public `/book` service + modality | [tasks/e-task-sfu-07-public-book-flow-service-modality.md](./tasks/e-task-sfu-07-public-book-flow-service-modality.md) |
| DM / AI catalog fees | [tasks/e-task-sfu-08-dm-bot-and-ai-context-catalog-fees.md](./tasks/e-task-sfu-08-dm-bot-and-ai-context-catalog-fees.md) |
| P2 backlog | [tasks/e-task-sfu-09-p2-tiered-discounts-episode-admin-analytics.md](./tasks/e-task-sfu-09-p2-tiered-discounts-episode-admin-analytics.md) |

Full order and **code anchors**: [tasks/README.md](./tasks/README.md).

---

**Last updated:** 2026-03-28 (§3 / §8 defaults locked; §9 tasks added)
