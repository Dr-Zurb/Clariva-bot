# SFU-12: Per-modality follow-up policies (catalog + quote + snapshot + UI)

## 2026-03-29 — Follow-up rules differ by text / voice / video

---

## 📋 Task Overview

**Problem:** Today each **service offering** has a **single** `followup_policy` (and the dashboard stamps one shared form onto every service). Follow-up quotes use the **current booking modality’s list price** from the episode snapshot, but apply **one** discount policy regardless of channel. Many practices need **different follow-up behavior per modality** (e.g. text follow-up 50% off, video follow-up 20% off or fixed amounts), including cases where the **index** visit was one channel and a **later** visit is another—the list price already reflects the channel; the **rule** must be able to differ too.

**Goal (phase 1 — required):**

1. **Catalog JSON:** Attach **`followup_policy`** (same `FollowUpPolicyV1` shape as today) to **each enabled modality** (`text` / `voice` / `video`), or an equivalent normalized structure (e.g. optional `followup_policy` nested beside `enabled` + `price_minor` per modality slot).
2. **Backward compatibility:** Legacy rows with **service-level** `followup_policy` only → **normalize on read/save**: copy into each **enabled** modality’s slot (document behavior when some modalities are disabled).
3. **Episode `price_snapshot_json`:** Snapshot **per-modality** list prices **and** **per-modality** `followup_policy` (or explicit “no follow-up discount for this modality”) so quotes stay stable when the live catalog changes.
4. **`consultation-quote-service`:** On follow-up path, resolve **`baseMinor`** from snapshot for **current `modality`**, then select **`followup_policy` for that modality** and run existing `applyFollowUpDiscount` / tier logic.
5. **Eligibility (product default):** Keep **`max_followups`** and **`eligibility_window_days`** **episode-level** (single source of truth on the episode row / snapshot meta) unless product explicitly chooses per-modality windows—**default avoids conflicting “is patient eligible?” rules.** Only **discount terms** vary per modality unless a follow-up task expands scope.
6. **Frontend:** Extend `service-catalog-drafts` + Practice Setup editor so each modality can carry **its own** follow-up form (or Notion-style row panel / popover per modality). Remove reliance on one global `FollowUpFormDraft` for save (or derive export from per-modality state).

**Goal (phase 2 — optional / backlog):** Cross-modality **upgrade** rules (e.g. index text → follow-up video surcharge matrix). **Do not** block phase 1 on this.

**Estimated Time:** 4–8 days (schema + normalize + snapshot + quote + dashboard + tests)  
**Status:** ✅ **IMPLEMENTED** (2026-03-29) — compact table UI / Notion row panel deferred; DM per-modality fee lines optional (§5)

**Change Type:**

- [x] **Update existing** — `service-catalog-schema` (BE + FE), merge/normalize hydration, `care-episode-service` snapshot v2, `consultation-quote-service`, `service-catalog-drafts.ts`, `ServiceCatalogEditor`
- [ ] **Docs** — `PRACTICE_SETUP_UI.md` one-line refresh optional; master PLAN optional

**Dependencies:** **SFU-01** (catalog), **SFU-03** (quote engine), **SFU-04** (episode snapshot), **SFU-06/11** (editor + `service_id`).  
**Related:** **SFU-09** (tiers)—tiers remain valid **inside** each per-modality policy.

**Reference:**

- `backend/src/utils/service-catalog-schema.ts` — `FollowUpPolicyV1`, `serviceOfferingV1Schema`, modality slots  
- `backend/src/services/consultation-quote-service.ts` — `quoteConsultationVisit`, `baseMinorFromSnapshotModalities`, `effectiveFollowUpPolicy`  
- `backend/src/services/care-episode-service.ts` — `buildEpisodePriceSnapshotJson`, snapshot parse  
- `frontend/lib/service-catalog-drafts.ts` — `draftsToCatalogOrNull`, `catalogToFollowUpDraft` (to be replaced/superseded by per-modality drafts)

---

## Design summary

| Concept | Role |
|---------|------|
| **Per-modality `followup_policy`** | Optional (or null) per `text` / `voice` / `video`. When missing, normalize from legacy service-level policy or “no follow-up discount for this channel.” |
| **Follow-up quote** | `base` = snapshot list price for **current** modality; **policy** = that modality’s policy; `visit_index` / tiers unchanged. |
| **Episode eligibility** | **Default:** `followups_used`, `max_followups`, `eligibility_ends_at` remain **episode-level**; not duplicated per modality in v1 of this task. |
| **Legacy catalog** | Service-level `followup_policy` → duplicated into each enabled modality on hydrate/normalize. |

---

## ✅ Task breakdown

### 1. Schema & normalization

- [x] 1.1 Extend Zod + TS types: each modality object may include `followup_policy: FollowUpPolicyV1 | null` (exact nesting per chosen JSON shape).
- [x] 1.2 **Refine:** shared `max_followups` / `eligibility_window_days` across enabled per-modality policies (+ root when present).
- [x] 1.3 **Hydration:** `hydrateCatalogPerModalityFollowUp` on DB read, `parseServiceCatalogV1`, `mergeServiceCatalogOnSave`.
- [x] 1.4 Frontend Zod mirror.

### 2. Episode snapshot

- [x] 2.1 `buildEpisodePriceSnapshotJson`: **v2** + per-modality `followup_policy` (+ top-level clone when root set).
- [x] 2.2 `parseEpisodePriceSnapshotV1`: `snapshotVersion`; v1 legacy vs v2 per-modality (see `consultation-quote-service.ts` comments).
- [x] 2.3 New index visits write **v2**.

### 3. Quote engine

- [x] 3.1 `resolveFollowUpPolicyForFollowUpQuote` + modality-aware catalog replay.
- [x] 3.2 No policy / disabled → **full list price** on eligible follow-up visit.
- [x] 3.3 Unit tests (SFU-12 + legacy + tiers).

### 4. Frontend drafts & editor

- [x] 4.1 Shared eligibility + per-modality discount under each channel in `ServiceCatalogEditor`.
- [x] 4.2 `draftsToCatalogOrNull`: policies on modalities; **`followup_policy: null`** at offering root on save.
- [ ] 4.3 **Compact table / Notion panel** — deferred.
- [x] 4.4 `offeringToDraft` maps root + per-modality legacy data.

### 5. Bot / DM / AI context (if needed)

- [ ] 5.1 Deferred (optional).

### 6. Docs & verification

- [ ] 6.1 Optional doc pass (`PRACTICE_SETUP_UI.md` / PLAN).
- [ ] 6.2 Manual QA recommended.
- [x] 6.3 Legacy v1 snapshot quoting preserved in tests.

---

## 🔮 Out of scope for SFU-12 phase 1

- Cross-modality **upgrade matrix** (index modality × follow-up modality surcharges).
- Per-modality **different** `eligibility_window_days` / **separate** `max_followups` counters (would need episode model change).
- DB columns beyond JSON snapshot / existing `care_episodes` fields (unless required for analytics).

---

## 📁 Files (expected touch list)

| Layer | Paths |
|--------|--------|
| Schema | `backend/src/utils/service-catalog-schema.ts`, `frontend/lib/service-catalog-schema.ts` |
| Settings | `backend/src/services/doctor-settings-service.ts`, `service-catalog-normalize.ts` (if present) |
| Episodes | `backend/src/services/care-episode-service.ts`, `backend/src/types/care-episode.ts` |
| Quotes | `backend/src/services/consultation-quote-service.ts` |
| Tests | `backend/tests/unit/services/consultation-quote-service.test.ts`, episode snapshot tests |
| FE | `frontend/lib/service-catalog-drafts.ts`, `frontend/components/practice-setup/ServiceCatalogEditor.tsx` |
| Docs | `docs/Reference/PRACTICE_SETUP_UI.md`, `../PLAN-services-modalities-and-follow-ups.md` |

---

**Last updated:** 2026-03-29
