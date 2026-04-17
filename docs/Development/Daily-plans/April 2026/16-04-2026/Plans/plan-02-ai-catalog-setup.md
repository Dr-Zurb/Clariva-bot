# Plan 02 — AI-assisted catalog setup

## Auto-fill service cards, quality checks, guided onboarding

**Goal:** Minimize cognitive load for doctors setting up service cards. Assume the doctor has the attention span of a 5-year-old: maximize AI assistance, show draft results for review, never require the doctor to manually fill keywords or routing hints. AI is clinically intelligent — it understands the doctor's specialty, location, modality appropriateness, and pricing norms.

**Companion plans:**
- [plan-01-service-matching-accuracy.md](./plan-01-service-matching-accuracy.md) — Matcher fixes, learning loop, scope mode
- [plan-03-single-fee-vs-multi-service-mode.md](./plan-03-single-fee-vs-multi-service-mode.md) — Single-fee / multi-service mode architecture

**Depends on:** Plan 01 Tasks 01–05 have shipped (2026-04-16). Plan 02 builds on the hardened matcher (`scope_mode`, strict prompt, learning-from-corrections loop, mixed-complaint clarification) those tasks established.

---

## Why this matters

The root cause of the NCD incident (see [Plan 01](./plan-01-service-matching-accuracy.md)) was **empty `matcher_hints`**. The doctor created a service with just a label and left everything else blank.

Plan 01 hardened the matcher itself — strict prompt, `scope_mode`, deterministic empty-hints fix, learning loop on every reassign, and a clarification turn for genuinely mixed complaints. **But the matcher still depends on having good hints in the first place — and the doctor still won't fill them by hand.** Plan 02 closes that gap by generating the hints (and the rest of the card) for them.

Doctors won't fill detailed service cards. They'll create a label, maybe a one-liner, and move on. The only way to get good routing data is to **generate it for them and let them approve it.** With `scope_mode = strict` now the default for new services (Plan 01 Task 04), an empty card is *worse* than before — it will match almost nothing — making AI auto-fill effectively a prerequisite for any new service.

---

## Design principles

1. **AI assist is always available, at every stage** — Creating a new card, editing an existing card, generating a starter catalog, correcting a mis-route in the review inbox. Same underlying capability, four trigger points.

2. **AI should be clinically intelligent** — Modality selection must be condition-appropriate (video for visual assessment, text for refills), pricing should reflect a sensible ladder (text < voice < video), and terminology should be regionally relevant (Hindi terms for India, Arabic for Gulf). The AI uses the full doctor profile — specialty, location, country, fees — not just the service label.

3. **Catch problems before patients do** — The catalog should be reviewed by AI before it goes live: overlapping services, missing coverage gaps, modality mismatches, pricing anomalies. Suggest fixes, never block saves.

4. **Draft content, never auto-save** — All AI-generated content appears as editable draft. The doctor always has the final say.

5. **One API, three modes** — Keep the backend simple. One endpoint handles single-card fill, starter catalog generation, and full catalog review.

---

## Task files

| # | Task | Effort | Risk |
|---|------|--------|------|
| 01 | [task-06-ai-autofill-service-cards.md](../Tasks/task-06-ai-autofill-service-cards.md) | Medium–Large | Low — one endpoint, three modes, frontend triggers |
| 02 | [task-07-catalog-quality-checks.md](../Tasks/task-07-catalog-quality-checks.md) | Medium | Low — per-card nudges + catalog-level AI review |

**Suggested order:** Task 06 first (the auto-fill API and all four frontend trigger points), then Task 07 (quality checks use the same API's `review` mode).

---

## Task 06: AI auto-fill for service cards

### Backend: single endpoint, three modes

**Endpoint:** `POST /api/v1/catalog/ai-suggest`

| Mode | When | Input | Output |
|------|------|-------|--------|
| `single_card` | Doctor creates/edits one service | `{ mode, label?, freeformDescription?, existingHints? }` | One card: `{ description, keywords, include_when, exclude_when, modalities, scope_mode }` |
| `starter` | Doctor has zero services (first-time setup) | `{ mode }` | Full catalog: 3–5 complete service cards with all fields **including `scope_mode`** |
| `review` | Doctor wants AI to audit their catalog | `{ mode }` | List of issues: overlaps, gaps, modality mismatches, pricing anomalies, **scope-mode mismatches**, card suggestions |

> **Scope-mode in AI output (post Plan 01 Task 04):** every generated card includes `scope_mode`. Defaults: specific clinical services → `strict`; general / catch-all rows ("General Consultation", "Other") → `flexible`. The doctor can flip it in the draft review step.

### Doctor profile context (hydrated from DB, not sent by frontend)

The backend loads the full `doctor_settings` row for the authenticated doctor and passes it to the LLM. The frontend call is minimal — the backend knows everything.

| Field from `doctor_settings` | Used for |
|------------------------------|----------|
| `specialty` | Primary driver — what services and conditions to generate |
| `practice_name` | Tone and naming in descriptions |
| `address_summary` | Regional context — terminology, common conditions, pricing tier (Tier-1 vs Tier-2 city) |
| `country` | Teleconsultation regulations, currency norms, language/terminology |
| `consultation_types` | Which modalities are globally available (AI won't enable video if doctor hasn't set up video) |
| `appointment_fee_minor` / `appointment_fee_currency` | Base pricing to build a price ladder from |
| `service_offerings_json` (existing catalog) | Mutual exclusion — AI generates `exclude_when` that references other services. Also reads each sibling card's `scope_mode` so generated `exclude_when` lines up with how strictly each sibling will actually match (a `flexible` sibling needs less defensive `exclude_when` than a `strict` one). |

**Example calls:**

```
POST /api/v1/catalog/ai-suggest
{ "mode": "starter" }
```
Backend hydrates from DB, builds context, calls LLM — doctor gets a full catalog.

```
POST /api/v1/catalog/ai-suggest
{ "mode": "single_card", "label": "NCD", "freeformDescription": "for hypertension, diabetes, hypothyroidism" }
```
Backend adds doctor profile + existing catalog as context, generates one card.

---

### AI intelligence: modality selection

The AI must be **clinically smart about which modalities to enable per service** — not just copy the doctor's global settings. Different conditions need different consultation types:

| Modality | Good for | Not suitable for |
|----------|----------|------------------|
| **Text** | Medication refills, lab result discussion, stable chronic follow-ups, prescription renewals, certificate requests | Anything needing physical/visual exam, acute symptoms needing assessment |
| **Voice** | History taking, medication counseling, chronic disease check-ins, mental health follow-ups | Skin conditions (need to see), wounds, anything needing visual confirmation |
| **Video** | Skin issues, wound follow-ups, post-surgical checks, pediatric assessments, mental health, most initial consultations | Conditions needing physical palpation, auscultation, procedures |

**AI prompt rules:**
- "Enable modalities based on clinical appropriateness for the condition, not just what the doctor has globally enabled."
- "Text is appropriate for follow-ups and documentation-based services; voice for conversation-based; video when visual assessment is needed."
- "Only enable modalities the doctor has globally configured (`consultation_types`). If the doctor hasn't set up video, never enable it."

**Examples:**

- **Dermatology — "Acne & Skin Care":** video: enabled (must see skin), text: enabled (follow-up photos), voice: disabled (can't assess skin over voice).
- **Psychiatry — "Therapy Session":** voice: enabled, video: enabled (both work), text: disabled (therapy over text is poor experience).
- **GP — "Prescription Refill":** text: enabled (sufficient), voice: enabled (quick clarification), video: disabled (overkill).

---

### AI intelligence: `scope_mode` selection (post Plan 01 Task 04)

Every generated card needs a `scope_mode` value. The AI picks it based on how narrowly the service is defined:

| Card character | `scope_mode` | Rationale |
|----------------|--------------|-----------|
| Specific condition / specialty (e.g., "Acne & Skin Care", "Diabetes Management", "Therapy Session") | **`strict`** | Doctor wants ONLY these conditions routed here; matcher will treat `keywords` + `include_when` as exhaustive |
| Broad / category (e.g., "General Consultation", "Internal Medicine Visit") | **`flexible`** | Doctor wants the matcher to fall back here for anything in the category, even if not explicitly listed |
| Catch-all "Other" row (auto-created by schema) | **`flexible`** | Always — this is the last-resort bucket |

**AI prompt rules:**
- *"When you mark a card `scope_mode: 'strict'`, treat `keywords` and `include_when` as the entire allowlist for that service — nothing outside those signals will match. Make them exhaustive: list every common condition, common synonym (incl. regional terminology), and common patient phrasing for the conditions the doctor described."*
- *"Default new specific clinical services to `strict`. Only generate `flexible` for cards that are explicitly broad (general consultation, multi-condition follow-up, catch-all)."*
- *"`exclude_when` is still useful in `strict` mode for the rare conditions the matcher might confuse with the keyword set (e.g., 'skin allergy' → exclude 'food allergy without rash')."*

**Examples:**

- **GP — "Acute Illness" card** (strict): `keywords: fever, cold, cough, flu, sore throat, bukhar, sardi, khansi`, `include_when: respiratory infections, viral fevers, mild GI illness`, `exclude_when: chronic disease management, lab refills, mental health`.
- **GP — "General Consultation" card** (flexible): broader `keywords`, broader `include_when`, no narrow `exclude_when` — this is the doctor's general-purpose row.
- **Dermatology — "Acne & Skin Care"** (strict): exhaustive list of skin terms; `exclude_when: internal medicine, lab work, hair loss without scalp condition`.

**Scope-mode + modality interaction:** a `strict` card with empty modalities or a single inappropriate modality is also flagged in `review` mode (see Task 07 below) — strict + empty hints + bad modality is the worst-case combo for the matcher.

---

### AI intelligence: pricing by modality and location

The AI generates a **sensible price ladder** per service, not a flat copy of the default fee:

- **Text** < **Voice** < **Video** (generally: text ~60% of base, voice ~80%, video ~100%)
- For services where only one modality makes sense (e.g., derm → video only), price at full rate
- Location-aware: ₹500 text in India is normal; $500 text in the US is absurd
- Service-type-aware: "Quick Follow-up" should cost less than "Initial Consultation"

**Example output for a Bangalore dermatologist (base fee ₹800):**

```
"Acne & Skin Care":
  text:  ₹400, enabled  (follow-up, sharing photos)
  voice: disabled        (can't assess skin over voice)
  video: ₹800, enabled  (primary — need to see skin)

"Prescription Refill":
  text:  ₹300, enabled  (sufficient for meds review)
  voice: ₹400, enabled  (quick call if clarification)
  video: disabled        (overkill for a refill)
```

---

### AI intelligence: teleconsultation regulations

The AI prompt includes country-specific regulatory context:

- **India (Telemedicine Practice Guidelines 2020):** First consultation can be via any modality; certain controlled substances need video; follow-ups for stable patients can be text.
- **US (state-by-state):** Some states require video for initial psychiatric consultations; audio-only accepted for established patients in most states.
- **UAE/Gulf:** Many jurisdictions require video for initial visits.

The AI doesn't need to be a legal expert, but encodes sensible defaults: "In India, text is acceptable for follow-ups; for initial consultations, prefer video or voice."

---

### AI intelligence: regional terminology

The AI uses the doctor's `country` and `address_summary` to generate **regionally relevant keywords:**

- **India:** "bukhar" (fever), "sardi" (cold), "khansi" (cough), "sugar" (diabetes), "BP" (hypertension)
- **US:** standard English medical terminology
- **Middle East:** Arabic transliterations where common in clinical context

This means a GP in Bangalore gets keywords that match how their actual patients talk, not just textbook English terms.

---

### Frontend trigger points (four entry points, same API)

1. **Empty catalog — starter catalog prompt:**
   When the doctor has zero services, the catalog page shows:
   > *"You're a [Cardiologist] in [Bangalore]. Want AI to set up your service catalog? It'll create common consultation types with routing hints, pricing, and modalities pre-filled."*
   > [Generate starter catalog] [I'll set it up myself]
   
   One tap → `{ mode: 'starter' }` → full catalog appears as draft.

2. **New service creation — inline banner:**
   Doctor clicks "+ Add Service" → blank card with an inline banner:
   > *"What is this service for? Describe it in your words and let AI fill in the details."*
   > [text input: "NCD — for hypertension, diabetes, hypothyroidism"] [Generate with AI]
   
   Banner collapses if the doctor starts typing manually. Non-blocking.
   
   AI generates: description, keywords, include_when, exclude_when, modalities with per-modality pricing.
   All fields appear as **draft** (yellow background, "AI-suggested" badge).

3. **Existing card with empty hints — inline prompt in detail drawer:**
   > *[sparkle icon] Auto-fill with AI based on your service name and specialty*
   
   One tap → fills empty fields as draft.

4. **Re-runnable any time:**
   Even if hints are already filled, the "Fill with AI" option stays available. Shows a diff: "AI suggests changing `include_when` from [current] to [suggested]. [Apply] [Keep mine]"

---

### Design guardrails

- All AI-generated content appears as **draft** — never auto-saved. Doctor must explicitly save. `scope_mode` is part of the draft and visible in the diff (so the doctor sees "this card will be strict — patients only match these listed conditions").
- AI prompt is narrow: "generate hints based on what the doctor described and their specialty; do not add conditions not mentioned for single-card mode." In starter mode, the AI can be broader because it's generating from specialty alone.
- Modality hallucination guard: AI never enables a modality the doctor hasn't globally configured in `consultation_types`.
- Pricing guard: AI-suggested prices are always within a reasonable range of the doctor's `appointment_fee_minor` (e.g., 30%–150% of base fee). Never generates ₹0 or absurdly high prices.
- Scope-mode guard: AI can only emit `'strict'` or `'flexible'` (validated against `serviceOfferingV1Schema`); the catch-all `'other'` row is always forced to `'flexible'` server-side regardless of LLM output.
- Cost-conscious: Use GPT-4o-mini (cheap, fast). Starter mode is one call for the whole catalog, not per-card. Monitor cost per doctor.

**Files touched:**
- `backend/src/routes/api/v1/` — new endpoint
- `backend/src/services/` — new service for AI catalog suggestions (loads `doctor_settings` for profile context, reads existing `scope_mode` per card)
- `backend/src/utils/service-catalog-schema.ts` — referenced for validation only; no schema changes (already has `scope_mode` from Plan 01 Task 04)
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — inline AI button per card
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — starter catalog prompt + new-card banner
- `frontend/lib/service-catalog-drafts.ts` — draft-mode visual state for AI suggestions, including `scope_mode` field

---

## Task 07: Catalog quality checks & guided onboarding

**Two layers:** per-card nudges (frontend-only) + catalog-level AI review (uses Task 06's `review` mode).

---

### Layer 1: Per-card nudges (frontend only, no AI call)

1. **Save-time warning:** When a doctor saves a service card with all hint fields empty, show a soft toast. Severity escalates with `scope_mode`:
   - `scope_mode === 'strict'` (default for new cards): **error-style toast** — *"This card is set to strict matching but has no hints. The bot will route almost nothing here. [Fill with AI] [Switch to flexible] [Save anyway]"*
   - `scope_mode === 'flexible'`: **soft toast** — *"Routing hints are empty — the bot may struggle to match patients correctly. [Fill with AI] [Dismiss]"*

2. **Card-level health badge:** On the catalog editor page, show a small badge per card indicating hint quality. Strict cards have a stricter rubric:
   - Green: hints filled (keywords + include_when)
   - Yellow: partial (only keywords, or only include_when), OR strict card with thin coverage
   - Red: empty hints — for `strict` cards say *"Bot will not route to this service"*; for `flexible` cards say *"Bot is guessing for this service"*

> **What was here before:** an earlier draft of this plan included a third nudge that fired when a doctor reassigned a service in the staff-review inbox. **That nudge has moved to [Plan 01 Task 03](../Tasks/task-03-hint-learning-from-corrections.md)** — the reassign dialog now auto-proposes pre-filled `include_when` / `exclude_when` updates on every reassign with one-tap accept. Plan 02 no longer needs to duplicate that surface.

---

### Layer 2: AI catalog review (uses `POST /api/v1/catalog/ai-suggest { mode: 'review' }`)

**Trigger:** "Review my catalog" button on the catalog editor page + auto-prompted on save when the AI detects issues.

The AI audits the **full catalog** (all services together) and flags issues that no individual card check would catch:

| Check | What it catches | Example |
|-------|----------------|---------|
| **Overlap detection** | Two services with similar keywords/include_when that would confuse the matcher | "NCD" has `keywords: diabetes` and "Chronic Follow-up" has `keywords: diabetes, sugar` |
| **Gap detection** | Common consultation types for the doctor's specialty that are missing | A GP with no service for acute illness (fever, cold, cough) |
| **Contradiction detection** | One service includes what another excludes inconsistently | Service A: `include_when: headache`, Service B: `exclude_when: headache` but no other service covers headache |
| **Modality mismatch** | Clinically inappropriate modality for the service type | Skin consultation with only text; therapy with only text |
| **Empty hints warning** | Services that still have no matcher hints after setup | "Procedure Consultation" — label only, no hints |
| **Strict + empty hints (CRITICAL)** | A `scope_mode: 'strict'` card with no `keywords` and no `include_when` — the matcher will route nothing to it, so the doctor silently loses bookings | "NCD" set to strict, label only, hints all blank → bot only ever falls back to "other" for these patients. Auto-fix: [Fill with AI] OR [Switch to flexible] |
| **Strict + thin keywords** | Strict card with <3 keywords *and* short `include_when` (<40 chars) — matcher will under-match | "Diabetes Management" (strict): `keywords: diabetes` only — misses "BP sugar", "DMT2", regional terms. Auto-fix: [Expand hints with AI] |
| **Flexible should be strict** | A narrow specific-condition card still on `flexible` (likely defaulted during the Task 04 migration) — it's quietly over-matching | "Acne & Skin Care" (flexible) with `keywords: acne, pimples` → matches "rash on baby", "hair loss". Auto-fix: [Switch to strict] (often paired with [Expand hints with AI]) |
| **Missing catch-all** | No "Other" / general service for unmatched complaints | Doctor has 3 specific services but no fallback |
| **Pricing anomalies** | A follow-up costing more than an initial consultation, or text costing more than video | "Quick Follow-up" at ₹800 but "Full Consultation" at ₹500 |
| **Service suggestion** | Recommend adding services common for the specialty | Psychiatrist without a "Medication Review" service; GP without "Lab Review" |

> **Severity recap (post Plan 01):** "strict + empty hints" is **error** (silently breaks routing for that service). "Strict + thin keywords" and "flexible should be strict" are **warning**. Plain "empty hints" on a `flexible` card is **suggestion** (matcher still copes via label and `other` fallback).

**UX:**

On save or manual "Review" click, show a review panel:

> **Catalog health check** (2 issues, 1 suggestion)
> 
> **Warning:** "Diabetes Management" and "Chronic Disease Follow-up" overlap — patients with diabetes could match either. Consider merging or adding `exclude_when` to one. [Fix with AI]
> 
> **Warning:** "Skin Consultation" has only text enabled but dermatology conditions usually need visual assessment. Consider enabling video. [Fix]
> 
> **Suggestion:** You don't have a service for acute/urgent consultations (fever, cold, infections) — common for General Medicine. [Add one with AI]
> 
> [Save anyway] [Fix all with AI]

**Key UX principles:**
- **Never blocks the save.** Always advisory — "Save anyway" is always available.
- **Prioritize:** Show top 2–3 most impactful issues. "Show all" expander for the rest.
- **Severity tiers:** Error (will cause mis-routes) > Warning (might cause confusion) > Suggestion (could improve).
- **One-tap fixes:** Each issue has an action button — [Fix with AI] applies the suggestion as a draft edit, [Add one with AI] creates a new card draft.

**API response shape:**
```json
{
  "issues": [
    {
      "type": "strict_empty_hints",
      "severity": "error",
      "services": ["ncd"],
      "message": "\"NCD\" is set to strict matching but has no keywords or include_when. The bot will not route any patients to this service.",
      "suggestions": [
        { "action": "fill_with_ai",      "label": "Fill hints with AI" },
        { "action": "switch_to_flexible", "label": "Switch scope to flexible" }
      ],
      "autoFixAvailable": true
    },
    {
      "type": "overlap",
      "severity": "warning",
      "services": ["diabetes-management", "chronic-follow-up"],
      "message": "These services overlap on diabetes-related keywords...",
      "suggestion": "Add 'exclude_when: newly diagnosed diabetes' to Chronic Follow-up",
      "autoFixAvailable": true
    },
    {
      "type": "flexible_should_be_strict",
      "severity": "warning",
      "services": ["acne-skin-care"],
      "message": "\"Acne & Skin Care\" is flexible but reads like a specific condition card — likely over-matching unrelated dermatology complaints.",
      "suggestion": "Switch to strict and expand hints",
      "autoFixAvailable": true
    },
    {
      "type": "gap",
      "severity": "suggestion",
      "message": "Common for General Medicine: acute illness service",
      "suggestedCard": { "label": "Acute Illness", "keywords": "...", "scope_mode": "strict" },
      "autoFixAvailable": true
    }
  ]
}
```

---

**Files touched:**
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — card-level health badge, scope-aware save warning
- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` — card badges, save warning, review panel, "Review my catalog" button
- `backend/src/services/` — `review` mode handler in AI catalog suggestions service (same endpoint as Task 06)
- *(reassign-dialog learning surface lives in Plan 01 Task 03 — not touched here)*

---

## Open questions

1. **AI auto-fill model cost:** Each auto-fill is an LLM call. If a doctor creates 8 services, that's 8 calls. **Recommendation:** Use GPT-4o-mini (cheap, fast). Starter mode generates the whole catalog in one call. Monitor cost per doctor.

2. **AI hallucinating medical conditions:** The AI might suggest conditions the doctor didn't mention. **Recommendation:** Narrow prompt for `single_card` mode — "generate hints based only on what the doctor described." For `starter` mode, the AI can be broader since it's generating from specialty alone. Always show as draft, never auto-save.

3. **Modality intelligence accuracy:** The AI may misjudge which modalities suit a condition. **Recommendation:** AI never enables modalities the doctor hasn't globally configured. The draft review step lets the doctor correct. Over time, learn modality preferences from booking data.

4. **Pricing ladder calibration:** AI-generated pricing might not match local market rates. **Recommendation:** Keep prices within 30%–150% of the doctor's `appointment_fee_minor`. Always show pricing as draft. Consider a "pricing guide" tooltip if we accumulate enough data.

5. **Teleconsultation regulation depth:** How detailed should the AI's regulatory awareness be? **Recommendation:** Start with broad country-level defaults. Don't attempt per-state compliance — that's a legal product decision. Add a disclaimer: "Please verify modality selection per your local teleconsultation regulations."

6. **Cross-card awareness during single-card mode:** When AI fills a single card, should it read the other existing services? **Yes.** The backend hydrates `service_offerings_json` so the AI can generate `exclude_when` that references sibling services and avoid keyword overlap. This is already planned in the context-hydration section.

7. **Default `scope_mode` for AI-generated cards (post Plan 01 Task 04):** Should AI default new specific clinical cards to `strict` (matching Task 04's "new services default to strict" policy) or to `flexible` (matching the wider "existing services default to flexible" migration policy)? **Recommendation:** `strict` for specific clinical cards, `flexible` for general/category cards and the catch-all — i.e., AI uses *clinical character* to pick, which aligns with Task 04's intent. The doctor can flip in the draft review step.

---

## Future ideas (parked)

| Idea | When to revisit |
|------|-----------------|
| **Batch re-generate hints for all cards** — "Regenerate all my service hints with AI" button | When single-card mode is stable |
| **Learning-informed AI fills** — AI uses learning examples to improve hint generation | After Plan 01's learning pipeline has enough data |
| **Patient-facing service descriptions** — AI generates patient-friendly descriptions alongside clinical ones | After basic catalog setup flow is validated |
| **Mixed-complaint signal in catalog review** — flag services that frequently trigger Plan 01 Task 05's `awaiting_complaint_clarification` state and suggest splitting them | After Task 05 has shipped to enough doctors to produce telemetry |

---

## References

- **Doctor settings:** `backend/src/services/doctor-settings-service.ts`, `backend/src/types/doctor-settings.ts`
- **Frontend catalog:** `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx`, `ServiceCatalogEditor.tsx`
- **Catalog page:** `frontend/app/dashboard/settings/practice-setup/services-catalog/page.tsx`
- **Schema:** `backend/src/utils/service-catalog-schema.ts`

---

## Changelog

- **2026-04-16 (post Plan 01):** Reconciled with shipped Plan 01 Tasks 01–05.
  - Added `scope_mode` to all AI output modes (`single_card`, `starter`, `review`) and gave the AI a dedicated selection rubric (specific clinical → `strict`, general/catch-all → `flexible`).
  - Added two new high-value `review`-mode checks: **strict + empty hints** (error) and **flexible should be strict** (warning).
  - Removed the redundant Layer 1 reassign-inbox nudge — that surface now lives in Plan 01 Task 03's training-interface reassign dialog.
  - Updated severity rubric: empty hints on a `strict` card is now an error, not a warning, because the matcher will silently route nothing.
  - Added open-question #7 (default `scope_mode` for AI-generated cards) and a parked future-idea linking catalog review to Task 05's mixed-complaint telemetry.
  - Renumbered task files to **06** and **07** to extend the day's global Tasks/ sequence (Plan 01 used 01–05) and re-pointed the links from `./` to `../Tasks/`.

---

**Last updated:** 2026-04-16
