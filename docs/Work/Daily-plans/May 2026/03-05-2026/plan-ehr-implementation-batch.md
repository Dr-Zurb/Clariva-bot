# EHR — implementation batch (2026-05-03)

## The 26 EHR items committed for implementation, pulled from T1 + T2 + T3 + T4 + T5

> **Source plans (single source of truth for each item):**
> - [EHR T1 — Foundation](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)
> - [EHR T2 — Speed](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)
> - [EHR T3 — Output](../../../Product%20plans/ehr/plan-t3-ehr-output.md)
> - [EHR T4 — Safety](../../../Product%20plans/ehr/plan-t4-ehr-safety.md)
> - [EHR T5 — Vitals & trends](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)
> - [EHR roadmap index](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md)
>
> **Foundation context (already shipped, do not re-implement):**
> - [Plan F01 — Prescription V1](../../../Product%20plans/ehr/plan-f01-prescription-foundation-status.md) (status: ✅ fully shipped — `<PrescriptionForm>` + migrations 026 / 027 + send pipeline)
>
> **Per-sub-batch execution checklists:** [Sub-batch A](./tasks-subbatch-A-foundation.md) · [Sub-batch B1](./tasks-subbatch-B1-speed.md) · [Sub-batch B2](./tasks-subbatch-B2-output.md) · [Sub-batch C](./tasks-subbatch-C-safety.md) · [Sub-batch D](./tasks-subbatch-D-trends.md)
>
> Each item below is implemented per the contract spelled out in its source plan. This file is the **batch backlog and sequencing doc** — it does not redefine items; it commits them.

---

## What this is

A user-curated cross-tier slice of the EHR roadmap, selected on 2026-05-03. Spans **all of T1, T2, T3, T4, T5** — every foundation item, every speed item, every output item, every safety item, every vitals/trends item.

**Explicitly NOT in this batch:** T6 (AI assist — 5 items, deferred per Decision E3 in [plan-00-ehr-roadmap.md](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md). Parked on V1 GA + AI budget approval + PHI/compliance review).

This is a **commitment**, not a wish-list. Each item below has its source plan, its effort estimate, and its dependencies. The sequencing in this doc respects those dependencies so we don't build things twice.

> **EHR-vs-consult-channel framing.** This batch ships the **clinical artifact** (Rx, vitals, allergies, dx, follow-up). The **conversation channel** (text / voice / video) is owned by the [text-consult](../../../Product%20plans/text-consult/), [voice-consult](../../../Product%20plans/voice-consult/), and [video-consult](../../../Product%20plans/video-consult/) roadmaps. The text-consult batch from 2026-04-28 is a parallel commitment — they don't overlap on files except at three host-mount points (`<VideoRoom>` / `<VoiceConsultRoom>` / `<TextConsultRoom>` quick-actions panels) where the prescription form is already mounted today.

---

## Status

`Drafted, awaiting commit start` — 2026-05-03.

Once implementation starts, this file is updated in-place: items move from `pending` → `in-progress` → `shipped` (with dated check-marks). Each tier source plan keeps its own `[SELECTED 2026-05-03]` markers so the cross-reference is always traceable in either direction.

---

## What's NOT in this batch (explicitly deferred)

So we don't accidentally pull these in:

| Tier / Item | Why excluded |
|-------------|--------------|
| **T6 — entire tier (5 items)** | All 5 items hard-block on (a) V1 GA + telemetry, (b) AI budget approval, (c) PHI/compliance review for sending consult bodies to LLM. Parked per Decision E3 LOCKED. Unpark conditions documented in [plan-t6-ehr-ai-assist.md](../../../Product%20plans/ehr/plan-t6-ehr-ai-assist.md). |
| **Specialty modules** (pediatric growth, OB LMP/EDD, derm body-mapping, ECG interpretation) | Decision E1 LOCKED — generalist-first. V2 line. |
| **ICD-10 / SNOMED structured diagnosis** | Decision E4 — defer until billing/insurance arrives. |
| **Patient-portal login + cross-doctor chart sharing (FHIR / ABDM)** | Decision E4 — defer. |
| **Templates clinic-wide sharing** | Per-doctor only in V1 (Decision T2-D2). V2. |
| **Cross-medication interaction (chronic meds × new Rx)** | T4 only checks within-Rx pairs (Decision T4-D4). Needs structured chronic-meds data, not in this batch. |

If priorities shift, we move items from this excluded list into a future batch — we don't redefine the source plans.

---

## The 26 selected items

Grouped by tier; sequencing is below in [§ Implementation order](#implementation-order).

### Tier 1 — Foundation (6 of 6 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T1.1 | Schema: `patient_allergies` + `patient_chronic_conditions` + `patient_vitals` (3 additive tables, doctor-only RLS, soft-delete via `archived_at`) | M (~4h) | [T1 §T1.1](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md) |
| T1.2 | Backend service + REST routes (`/api/v1/patients/:patientId/chart/{allergies,conditions,vitals}`) | S (~4h) | T1 §T1.2 |
| T1.3 | `<PatientChartPanel>` component (left rail desktop / accordion mobile / compact in-call) + 4 section sub-components | L (~1 day) | T1 §T1.3 |
| T1.4 | Mount `<PatientChartPanel>` in appointment-detail page (12-col grid restructure on `lg+`, accordion on `<lg`) | XS (~2h) | T1 §T1.4 |
| T1.5 | Mount `<PatientChartPanel>` in in-call quick-actions panel (tabbed: "Patient chart" / "Prescription") | M (~4h) | T1 §T1.5 |
| T1.6 | Previous-Rx history section (last 3 visits, expandable; backend `listRecentPrescriptionsByPatient`) | M (~4h) | T1 §T1.6 |

**Tier-1 subtotal:** ~3 days. **One migration** (3 additive tables + RLS + indexes). Frontend-heavy; new backend service file. No changes to existing prescription tables.

### Tier 2 — Speed (7 of 7 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T2.7 | Schema + seed: `drug_master` (~500 hand-curated Indian drugs, trigram search, RLS read-all) + backend search endpoint | M (~4h) | [T2 §T2.7](../../../Product%20plans/ehr/plan-t2-ehr-speed.md) |
| T2.8 | `<DrugAutocomplete>` component (combobox, 200ms debounce, prefill of strength + route) — replaces medicine-name `<input>` in `<MedicineRow>` | M (~6h) | T2 §T2.8 |
| T2.9 | Schema: 4 additive nullable cols on `prescription_medicines` (`drug_master_id`, `frequency_code`, `duration_value`, `duration_unit`, `route_code`) with CHECK constraints | XS (~2h) | T2 §T2.9 |
| T2.10 | Structured frequency / duration / route pickers (dropdowns + custom escape; legacy free-text cols still populated) | M (~4h) | T2 §T2.10 |
| T2.11 | Schema: `doctor_rx_templates` (per-doctor saved Rx blueprints; `medicines_json` JSONB; `use_count` + `last_used_at`) + backend service | M (~4h) | T2 §T2.11 |
| T2.12 | `<TemplatePicker>` UI (bottom-sheet on mobile, side-panel on desktop) + "Save as template" + Apply / Archive | L (~6h) | T2 §T2.12 |
| T2.13 | Auto-save (1.5s debounce; replaces "Save draft" button per Decision E5; `useAutoSave` hook + `<SaveStatus>` indicator) | M (~4h) | T2 §T2.13 |
| T2.14 | "Copy from last visit" one-tap (CTA appears only when prior Rx exists in same episode; "Copy all" / "Pick fields..." chooser) | S (~4h) | T2 §T2.14 |

**Tier-2 subtotal:** ~4 days. **Two migrations** + seed: `drug_master` + structured columns + `doctor_rx_templates`. T2.13 (autosave) is the highest-leverage item per dev-day spent and ships first inside this sub-batch after T2.7.

### Tier 3 — Output (5 of 5 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T3.15 | PDF generation service (`@react-pdf/renderer`; bucket `prescription-pdfs`; 24h-TTL signed URLs; multi-page flow; graceful letterhead degradation) | L (~1 day) | [T3 §T3.15](../../../Product%20plans/ehr/plan-t3-ehr-output.md) |
| T3.16 | Patient-facing Rx page (`/r/[id]?t=hmac`; HMAC-token auth; mobile-first; download PDF + chat / book deep links) | M (~6h) | T3 §T3.16 |
| T3.17 | Send-pipeline upgrade (`sendPrescriptionToPatient` → generates PDF + mints token + IG-DM media attachment + email PDF attachment + view-online link) | M (~4h) | T3 §T3.17 |
| T3.18 | "Patient view" preview before send (modal mounting same React tree as `/r/[id]/page.tsx`; reads form snapshot, no token) | M (~4h) | T3 §T3.18 |
| T3.19 | "Resend" + "Regenerate PDF" + "Copy share link" actions on past prescriptions (kebab menu on appointment-detail) | XS (~2h) | T3 §T3.19 |

**Tier-3 subtotal:** ~3 days. **No DB tables** (one Storage bucket only). New env var: `RX_SHARE_TOKEN_SECRET` (32-byte hex). New npm dep: `@react-pdf/renderer` (~150KB gz on backend bundle — verify size budget on Vercel/Render before commit).

### Tier 4 — Safety (4 of 4 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T4.18 | Allergy clash banner (`matchAllergens` pure fn with unit tests; substring match across canonical generic + brand + free-text allergen, normalized lowercase; red banner above medicines section) | M (~5h) | [T4 §T4.18](../../../Product%20plans/ehr/plan-t4-ehr-safety.md) |
| T4.19 | Schema + seed: `drug_interactions` (~200 hand-curated dangerous pairs; ordered-pair UNIQUE constraint; severity enum) + backend `/check` endpoint | S (~4h) | T4 §T4.19 |
| T4.20 | DDI warning chips in `<MedicineRow>` (severity-color-coded; tap-to-detail modal; per-Rx in-memory acknowledgement) | M (~4h) | T4 §T4.20 |
| T4.21 ✅ | Pre-send soft guards modal (aggregates allergy + DDI + empty-Rx + no-diagnosis warnings; "Send anyway" never disabled; telemetry counts by warning type, no PHI) [Shipped 2026-05-04] | S (~4h) | T4 §T4.21 |

**Tier-4 subtotal:** ~2 days. **One migration** + seed (`drug_interactions`). Hard-deps on T1.1 (`patient_allergies`) and T2.7 (`drug_master_id` for canonical match) — sequence T4 **after** B1 + A.

### Tier 5 — Vitals & trends (4 of 4 items, all)

| ID | Item | Effort | Source |
|----|------|--------|--------|
| T5.22 | `<VitalsCapture>` widget (modal/sheet; all-fields-optional; auto-BMI; saves `patient_vitals` row) + `<VitalSparkline>` (pure SVG, no chart-lib dep) in `<VitalsSection>` | M (~6h) | [T5 §T5.22](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md) |
| T5.23 | `<VitalTrendModal>` (full-chart view with reference-range bands, recent-readings list, per-data-point tooltip) | S (~4h) | T5 §T5.23 |
| T5.24 | Schema: `prescriptions.episode_id` additive nullable FK to `care_episodes` + backfill SQL + service auto-populates from parent appointment | XS (~2h) | T5 §T5.24 |
| T5.25 | `patient_problem_list_v` SQL view (UNION ALL of chronic conditions + active episodes + recurring diagnoses) + `<ProblemListSection>` in chart panel | M (~4h) | T5 §T5.25 |

**Tier-5 subtotal:** ~2 days. **One column add** (`prescriptions.episode_id`) + **one SQL view** (`patient_problem_list_v`). Hard-deps on T1.1 (`patient_chronic_conditions`, `patient_vitals`).

---

## Total effort estimate

| Tier | Items | Effort |
|------|-------|--------|
| T1 | 6 | ~3 days |
| T2 | 7 | ~4 days |
| T3 | 5 | ~3 days |
| T4 | 4 | ~2 days |
| T5 | 4 | ~2 days |
| **Total** | **26** | **~14 dev-days** (~3 calendar weeks at solo pace; ~1.5 weeks at 2-dev pace running B1 + B2 in parallel) |

This is a **multi-week commitment**. Recommend slicing into 5 deliverable sub-batches (A → B1 ‖ B2 → C → D) so we can validate each before moving to the next.

---

## Implementation order

Sequencing respects:

1. **Hard dependencies** between selected items (T2 + T4 + T5 all need T1's chart-context tables; T4 needs T2's `drug_master`; T5 problem-list view reads from prescriptions which already exist).
2. **Risk locality** — ship T1 (smallest schema footprint) first so we can iterate without re-rolling migrations.
3. **User-visible step changes spread across the batch** — T1 lands "the chart panel exists"; B1 lands "writing Rx feels fast"; B2 lands "patients get a real PDF"; C lands "we caught the allergy clash"; D lands "vitals trends are visible".
4. **Schema co-location** — T1's migration ships first standalone (clean rollback). T2 ships its 2 migrations together. T3 ships only a Storage bucket. T4 + T5 each ship one migration. Total migrations = 6.

### Sub-batch A — "Foundation" (~3 days) — must ship first

Patient chart context spine. Everything above depends on this. **Single migration; new backend service; new component family.**

Detailed checklist: [tasks-subbatch-A-foundation.md](./tasks-subbatch-A-foundation.md).

1. T1.1 — schema: 3 patient-chart-context tables (one migration, doctor-only RLS mirroring 026, soft-delete via `archived_at`)
2. T1.2 — backend service `patient-chart-service.ts` + 3 resource controllers/routes
3. T1.3 — `<PatientChartPanel>` component + 4 section sub-components (responsive: desktop / mobile / in-call layouts)
4. T1.4 — mount in appointment-detail page (12-col grid restructure)
5. T1.5 — mount in in-call quick-actions panel (tabbed UI)
6. T1.6 — previous-Rx history section + backend `listRecentPrescriptionsByPatient`

**Sub-batch A acceptance:** all 6 source-plan acceptance criteria; chart panel mounts cleanly in all three host surfaces; doctor-A cannot see doctor-B's rows for shared patient (RLS verified with two test users); soft-delete works (`UPDATE ... SET archived_at = now()` removes from default queries); empty states work (new patient → "No allergies recorded — Add" CTA).

### Sub-batches B1 + B2 — run in parallel after A (each ~3-4 days)

**Two parallel tracks** — different developers / different files. They share `<PrescriptionForm>` only at the top. Internal sub-trees diverge.

#### Sub-batch B1 — "Speed" (T2; ~4 days)

Detailed checklist: [tasks-subbatch-B1-speed.md](./tasks-subbatch-B1-speed.md).

7. T2.7 — `drug_master` schema + ~500-row seed + backend `/api/v1/drugs/search` (trigram-fuzzy + prefix-priority ordering)
8. T2.13 — auto-save hook + `<SaveStatus>` indicator + remove "Save draft" button (highest-leverage; ships early to de-risk)
9. T2.8 — `<DrugAutocomplete>` component (combobox; replaces medicine-name input in `<MedicineRow>`)
10. T2.9 — structured columns migration (4 nullable cols on `prescription_medicines` with CHECK enums)
11. T2.10 — structured pickers UI (frequency / duration / route dropdowns; custom escape hatch)
12. T2.11 — `doctor_rx_templates` schema + `rx-template-service.ts`
13. T2.12 — `<TemplatePicker>` UI (bottom-sheet mobile / side-panel desktop) + "Save as template" + Apply / Archive
14. T2.14 — "Copy from last visit" CTA + backend `getLastPrescriptionInEpisode`

**Sub-batch B1 acceptance:** all 7 T2 source-plan acceptance criteria; "Save draft" button is gone everywhere; drug autocomplete returns within 250ms; templates picker shows recent-use sort; copy-from-last-visit CTA only appears on follow-ups; legacy free-text Rx (created before B1 ships) still display correctly.

#### Sub-batch B2 — "Output" (T3; ~3 days)

Detailed checklist: [tasks-subbatch-B2-output.md](./tasks-subbatch-B2-output.md).

15. T3.15 — `prescription-pdf-service.ts` + `<PrescriptionDocument>` React-PDF tree + `prescription-pdfs` bucket migration + 24h-TTL signed URLs
16. T3.18 — "Patient view" preview modal (ships second so doctors get to see the output even before the delivery upgrade lands)
17. T3.16 — patient-facing route `/r/[id]?t=hmac` + `prescription-token-service.ts` (HMAC-SHA256, `RX_SHARE_TOKEN_SECRET`)
18. T3.17 — send-pipeline upgrade in `notification-service.ts` (PDF media attachment on IG-DM; PDF attachment + view-online link in email; backwards-compatible)
19. T3.19 — "Resend" + "Regenerate PDF" + "Copy share link" kebab on past prescriptions

**Sub-batch B2 acceptance:** all 5 T3 source-plan acceptance criteria; PDF renders correctly with sample data including multi-page; doctor without logo gets text-only header (no broken image); patient page loads without auth, expired tokens show friendly error; email send + IG-DM send fail independently; PDF cache hits on rapid resend (≤5min).

### Sub-batch C — "Safety" (~2 days; needs A + B1)

Detailed checklist: [tasks-subbatch-C-safety.md](./tasks-subbatch-C-safety.md).

20. T4.18 — `matchAllergens` pure function + unit tests + `<AllergyClashBanner>` (mountable independent of T4.19; ships first)
21. T4.19 — `drug_interactions` schema + ~200-pair seed + `/api/v1/drug-interactions/check` endpoint
22. T4.20 — `<InteractionChips>` + per-Rx acknowledgement state hook
23. T4.21 — `<PrescriptionPreSendCheck>` modal (aggregates all warnings; "Send anyway" never disabled; telemetry by warning type)

**Sub-batch C acceptance:** all 4 T4 source-plan acceptance criteria; allergy banner appears on Amoxicillin × Penicillin allergy and on Crocin × Paracetamol allergy; DDI chips appear on Warfarin + Aspirin; pre-send modal aggregates all warning types; "Send anyway" always works; no warning is ever a blocker.

### Sub-batch D — "Vitals & trends" (~2 days; needs A)

Detailed checklist: [tasks-subbatch-D-trends.md](./tasks-subbatch-D-trends.md).

24. T5.22 — `<VitalsCapture>` widget + `<VitalSparkline>` (pure SVG) + replace placeholder `<VitalsSection>`
25. T5.23 — `<VitalTrendModal>` with line chart and recent readings list
26. T5.24 — `prescriptions.episode_id` additive FK + backfill SQL + service auto-populate
27. T5.25 — `patient_problem_list_v` SQL view + `getProblemList` service + `<ProblemListSection>` in chart panel

**Sub-batch D acceptance:** all 4 T5 source-plan acceptance criteria; vitals capture works mid-call; sparklines appear with ≥2 readings; problem list returns chronic + active-episode + recurring-diagnosis rows for a seeded patient; episode FK backfilled to 0 NULL count for legacy Rx attached to episode-bearing appointments.

---

## Dependency graph (selected-items only)

```
Sub-batch A (T1) — foundation; everything depends
   T1.1 (schema) ──→ T1.2 (backend) ──→ T1.3 (component) ──┬──→ T1.4 (mount appt-detail)
                                                            ├──→ T1.5 (mount in-call)
                                                            └──→ T1.6 (previous-Rx)

Sub-batch B1 (T2) — runs in parallel with B2 after A
   T2.7 (drug_master) ──→ T2.8 (DrugAutocomplete) ──→ T2.9 (cols) ──→ T2.10 (pickers)
                          T2.11 (templates schema) ──→ T2.12 (picker UI) ──→ T2.14 (copy-from-last)
                          T2.13 (autosave)  ← independent; ships early

Sub-batch B2 (T3) — runs in parallel with B1 after A
   T3.15 (PDF) ──→ T3.18 (preview)
              ──→ T3.16 (patient page) ──→ T3.17 (send pipeline) ──→ T3.19 (resend/regen)

Sub-batch C (T4) — needs A + B1
   T1.1.patient_allergies ─┐
   T2.7.drug_master      ─┼──→ T4.18 (allergy banner)
   T2.10.structured cols ─┘
   T4.19 (DDI schema) ──→ T4.20 (chips) ──→ T4.21 (pre-send modal)

Sub-batch D (T5) — needs A
   T1.1.patient_vitals ─→ T5.22 (capture + sparklines) ─→ T5.23 (trend modal)
   T5.24 (episode FK) ─→ T5.25 (problem-list view + section)

Foundation invariants (every sub-batch respects):
   F01 Decision: doctor-only RLS via `auth.uid() = doctor_id`     (A + B1 + C + D)
   F01 Decision: MIME allow-list for attachments stays JPEG/PNG/WebP/PDF  (B2)
   F01 Decision: PHI hygiene in logs — no body, dx, drug names    (every sub-batch)
   E5 Decision:  no "Save draft" button after T2.13 ships         (B1 → enforced thereafter)
   E6 Decision:  three-mount-surface invariant (appt-detail / in-call / post-call read-only)  (every UI item)

Cross-batch coordination:
   text-consult batch (Apr 28) is independent — it ships polish to <TextConsultRoom>
     while we ship the prescription form alongside it. The two only meet at
     in-call quick-action panels (where both are mounted), which already
     handle modality switching cleanly.
   <PatientChartPanel> from T1.5 mounts inside in-call quick actions —
     verify the in-call panel host (InCallActionPanel.tsx) has space for
     a new tab BEFORE T1.5 starts.
```

---

## Cross-cutting decisions needed before commit-start

These are decisions the source plans flagged as "decide at commit time". For this batch, we owe answers before sub-batch boundaries:

### Before Sub-batch A starts

1. **Chart panel collapsibility on desktop** (Q1 in plan-00) — recommended: collapsible (icon-only rail when collapsed; state persists in `localStorage`).
2. **Vitals snapshot model** (Q7 in plan-00) — confirmed: history (one row per recording). T1.1 schema already encodes this.
3. **In-call panel arrangement for chart vs Rx** (T1 §T1.5) — recommended (a): tabbed (`Patient chart` / `Prescription` toggle). More room for whichever is active at a 768px-wide laptop side panel.
4. **Vitals "appointment_id" association** when entered from chart panel vs in-call surface — recommended: chart-panel-entered vitals have `appointment_id = NULL` (patient-level); in-call-entered vitals carry the current appointment's id. UI in T5.22 propagates the right value.
5. **Soft-delete UX** — recommended: kebab menu shows "Archive" (not "Delete") to set expectations.

### Before Sub-batch B1 starts

6. **Drug DB seed source** (Q2 in plan-00) — recommended: hand-curated ~500 most-prescribed Indian generics + brand names. Owner picks the seed list (recommend `Indian Drug Index` open-data subset). RxNorm import deferred.
7. **Auto-save debounce window** (Q4 in plan-00) — confirmed: **1.5 seconds** (Decision T2-D3 LOCKED).
8. **Templates clinic-wide sharing** (Q6 in plan-00) — confirmed: per-doctor only in V1 (Decision T2-D2 LOCKED).
9. **Structured frequency enum set** (T2 §T2.9) — confirmed: `OD / BID / TID / QID / QHS / PRN / STAT / CUSTOM` (8 values).
10. **Frequency `CUSTOM` UX** — recommended: selecting `CUSTOM` reveals the legacy free-text input below the dropdown; `frequency_code = 'CUSTOM'` and `frequency` carries the free text.
11. **Save-as-template snapshot fields** — recommended: include `cc / hopi / dx / inv / follow-up / edu / notes` + `medicines_json`. Patient name / age / vitals are NOT snapshotted (per-patient).
12. **Templates picker default sort** — confirmed: `last_used_at DESC NULLS LAST` then name ASC.

### Before Sub-batch B2 starts

13. **PDF runtime** (Q3 in plan-00) — confirmed: **`@react-pdf/renderer`** (Decision T3-D1 LOCKED). No Chromium dep.
14. **Patient share link format** (T3 §T3.16) — recommended: `clariva.health/r/<short-id>?t=<token>`. Short-id is the prescription UUID truncated to 8 chars; URL is unguessable because of the HMAC token, not the path.
15. **Token TTL** (T3 §T3.16) — recommended: **24 hours** on initial mint; the email/IG body link is a "request a fresh token" endpoint that re-mints on click (so patient revisiting next week gets a working PDF without re-sending).
16. **Letterhead fallback strategy** (T3 §T3.15) — recommended: text-only header if logo URL is missing or fails to load (no broken image markers). Signature block uses typed name if no signature image.
17. **Send-pipeline channel-failure semantics** (T3 §T3.17) — recommended: each channel succeeds or fails independently; aggregate result is `{ instagram?: boolean, email?: boolean }`. If both fail, UI shows "Failed — Retry"; if one succeeds, UI shows "Sent (1 of 2 channels)".
18. **PDF cache TTL** (T3 §T3.17) — recommended: 5 minutes server-side. Resends within 5 min reuse the PDF. Beyond 5 min, regenerate.

### Before Sub-batch C starts

19. **Allergy substring match strictness** (Q5 in plan-00) — confirmed: substring on canonical generic + brand names + free-text allergen, all normalized lowercase. `includes` in either direction (catches "PCN" vs "Penicillin").
20. **DDI severity scale** (T4 §T4.19) — confirmed: `minor / moderate / major / contraindicated` (4 values).
21. **DDI seed source** (T4 §T4.19) — **NEEDS ANSWER**: owner curates DDI seed list; tracked separately from coding tasks; blocks C.2 only.
22. **Acknowledgement persistence scope** — confirmed v1: per-Rx in-memory only (lost on refresh). If telemetry shows pain, add `prescription_warning_acknowledgements` table in T4-v2.
23. **Telemetry payload for warning ack/edit/send-anyway** — **LOCKED**: v1 telemetry payload shape `{ doctor_id, rx_id, warning_kind, outcome }`. `warning_kind` enum: `allergy` | `ddi` | `high_dose` | `duplicate_drug`. `outcome` enum: `acknowledged` | `edited_rx` | `sent_anyway` | `dismissed`. Emit helper added in C.4 only; no real receiver wired yet — logs structured JSON until analytics pipeline exists. Per-Rx in-memory acks per §22; events fire on each user action without server persistence in v1.

### Before Sub-batch D starts

24. **Sparkline rendering threshold** (T5 §T5.22) — confirmed: **≥2 readings** (1 reading = no sparkline; show only count).
25. **Trend modal time window default** (T5 §T5.23) — recommended: last 90 days, OR all readings if fewer than 90 days exist. User can switch to "last year" / "all time" via a pill row at modal top.
26. **BMI persist vs compute-on-read** — confirmed: persist (T1.1 schema includes `bmi` col). Computed client-side on save; sparkline reads it directly without a JOIN.
27. **Reference range source** — recommended (V1, fixed): BP 90-120/60-80, HR 60-100, Temp 36.5-37.5°C, SpO₂ 95-100, BMI 18.5-25. Demographic-adjusted ranges deferred to V2.
28. **Recurring diagnosis grouping** (T5 §T5.25) — confirmed: `LOWER(TRIM(provisional_diagnosis))` grouping; ≥2 occurrences in last 6 months.
29. **Episode FK backfill** (T5 §T5.24) — confirmed: one-shot SQL during migration deploy: `UPDATE prescriptions p SET episode_id = a.episode_id FROM appointments a WHERE p.appointment_id = a.id AND p.episode_id IS NULL AND a.episode_id IS NOT NULL`. Verify post-deploy with `SELECT COUNT(*) FROM prescriptions WHERE episode_id IS NULL AND appointment_id IN (SELECT id FROM appointments WHERE episode_id IS NOT NULL)` should return 0.

---

## Files expected to touch (consolidated across all 26 items)

### Frontend (~16 new files, ~3 extends)

**New components (`frontend/components/ehr/`):**
- `PatientChartPanel.tsx` — T1.3 (root)
- `sections/AllergiesSection.tsx` — T1.3
- `sections/ChronicConditionsSection.tsx` — T1.3
- `sections/VitalsSection.tsx` — T1.3 (placeholder; T5.22 fills it in)
- `sections/PreviousRxSection.tsx` — T1.3 / T1.6
- `sections/ProblemListSection.tsx` — T5.25
- `DrugAutocomplete.tsx` — T2.8
- `TemplatePicker.tsx` — T2.12
- `VitalsCapture.tsx` — T5.22
- `VitalSparkline.tsx` — T5.22
- `VitalTrendModal.tsx` — T5.23
- `AllergyClashBanner.tsx` — T4.18
- `InteractionChips.tsx` — T4.20

**New components (`frontend/components/consultation/`):**
- `PrescriptionPatientPreview.tsx` — T3.18
- `PrescriptionPreSendCheck.tsx` — T4.21

**New routes:**
- `frontend/app/r/[id]/page.tsx` — T3.16

**New hooks / lib:**
- `frontend/lib/hooks/useAutoSave.ts` — T2.13
- `frontend/lib/ehr/match-allergens.ts` — T4.18 (with unit tests)
- `frontend/lib/ehr/use-acknowledgements.ts` — T4.20

**New API client wrappers (`frontend/lib/api/`):**
- `patient-chart.ts` — T1.2 (allergies / conditions / vitals)
- `drug-master.ts` — T2.7
- `rx-templates.ts` — T2.12
- `prescription.ts` — extend with `getRecentByPatient`, `getLastInEpisode`, `regeneratePdf`, `mintShareLink`

**New types (`frontend/types/`):**
- `patient-chart.ts` — T1.3
- `drug-master.ts` — T2.7
- `rx-template.ts` — T2.11

**Extends:**
- `frontend/components/consultation/PrescriptionForm.tsx` — every B1/B2/C item touches this. Major refactor mid-B1 to consume autosave + templates + drug autocomplete; mid-B2 to add preview button; mid-C to wrap send with pre-send-check.
- `frontend/components/consultation/MedicineRow.tsx` — T2.8 + T2.10 replace inputs with structured pickers; T4.18 + T4.20 read this row's state for warnings.
- `frontend/components/consultation/InCallActionPanel.tsx` — T1.5 adds "Patient chart" tab.
- `frontend/app/dashboard/appointments/[id]/page.tsx` — T1.4 restructures to 12-col grid; T3.19 adds kebab on past Rx.

### Backend (~7 new files, ~3 extends)

**New services:**
- `backend/src/services/patient-chart-service.ts` — T1.2
- `backend/src/services/drug-master-service.ts` — T2.7
- `backend/src/services/rx-template-service.ts` — T2.11
- `backend/src/services/prescription-pdf-service.ts` — T3.15
- `backend/src/services/prescription-token-service.ts` — T3.16

**New controllers + routes:**
- `backend/src/controllers/patient-chart-controller.ts` + `routes/api/v1/patient-chart-routes.ts` — T1.2
- `backend/src/controllers/drug-master-controller.ts` + `routes/api/v1/drug-master-routes.ts` — T2.7
- `backend/src/controllers/rx-template-controller.ts` + `routes/api/v1/rx-template-routes.ts` — T2.11
- `backend/src/controllers/drug-interactions-controller.ts` + `routes/api/v1/drug-interactions-routes.ts` — T4.19
- `backend/src/controllers/public-prescription-controller.ts` + `routes/api/v1/public-prescription-routes.ts` — T3.16

**New PDF templates:**
- `backend/src/templates/prescription-pdf/PrescriptionDocument.tsx` — T3.15
- `backend/src/templates/prescription-pdf/{Header,Footer,MedicineTable}.tsx` — T3.15

**Extends:**
- `backend/src/services/prescription-service.ts` — T1.6 adds `listRecentPrescriptionsByPatient`; T2.14 adds `getLastPrescriptionInEpisode`; T5.24 auto-populates `episode_id` from parent appointment on create/update.
- `backend/src/services/notification-service.ts` — T3.17 upgrades `sendPrescriptionToPatient` to attach PDF + share link.
- `backend/src/utils/dm-copy.ts` — T3.17 verifies `buildPrescriptionReadyDm` accepts the PDF URL + share link params.
- `backend/src/index.ts` — mount the 5 new routers.

### Migrations (6 total)

| # | File (pick next available number) | Sub-batch | Purpose |
|---|------------------------------------|-----------|---------|
| 1 | `backend/migrations/0XX_patient_chart_context.sql` | A | T1.1: 3 tables + RLS + indexes |
| 2 | `backend/migrations/0XX_drug_master.sql` + `0XX_drug_master_seed.sql` | B1 | T2.7: lookup table + ~500 seed + trigram + RLS read-all |
| 3 | `backend/migrations/0XX_prescription_medicines_structured.sql` | B1 | T2.9: 4 nullable cols + CHECK enums + index on `drug_master_id` |
| 4 | `backend/migrations/0XX_doctor_rx_templates.sql` | B1 | T2.11: per-doctor template table + RLS |
| 5 | `backend/migrations/0XX_prescription_pdfs_bucket.sql` | B2 | T3.15: Storage bucket + RLS (no DB table) |
| 6 | `backend/migrations/0XX_drug_interactions.sql` + `0XX_drug_interactions_seed.sql` | C | T4.19: pairs table + ordered-pair UNIQUE + ~200 seed |
| 7 | `backend/migrations/0XX_prescriptions_episode_link.sql` | D | T5.24: additive nullable FK + backfill |
| 8 | `backend/migrations/0XX_patient_problem_list_view.sql` | D | T5.25: SQL view |

(8 migration files, 6 logical migrations — seeds may live separately for clarity.) All migrations forward + reverse cleanly. All new RLS uses `auth.uid() = doctor_id` pattern (mirrors migration 026 §4); `safe_uuid_sub()` is **not** required because no patient JWT reads these tables in V1 (Decision E4: T3.16 patient page authenticates via HMAC, not Supabase JWT).

### Ops

**New env vars (Sub-batch B2 / T3.16):**
- `RX_SHARE_TOKEN_SECRET` — 32-byte hex secret for HMAC-SHA256. Generate with `openssl rand -hex 32` per environment (dev / staging / prod). Rotate annually.

**New npm deps:**
- `@react-pdf/renderer` (backend; ~150KB gz) — Sub-batch B2 / T3.15. Verify size budget on the deployment platform before commit.
- `pg_trgm` extension (DB; built into Postgres) — Sub-batch B1 / T2.7. Just `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

### What does NOT change

- No DM-copy structural changes (T3.17 just adds a URL param to existing `buildPrescriptionReadyDm`).
- No new vendor (no third-party DDI / drug DB / PDF service in V1).
- No native shell.
- No new authentication / authorization surface (chart-context routes use existing doctor-JWT path; patient Rx page uses HMAC pattern already proven on `/c/text/...`).
- No changes to existing prescription tables 026 / 027 (T2.9 adds nullable cols, T5.24 adds nullable col — both additive, both backward-compatible).

---

## Acceptance for the whole batch

When all 26 items have shipped:

- [ ] All 26 source-plan acceptance criteria pass (6 T1 + 7 T2 + 5 T3 + 4 T4 + 4 T5).
- [ ] Manual smoke: a doctor sees a patient in three modalities (text / voice / video), opens the Rx form from the in-call quick-actions, sees the chart panel populated with allergies + chronic conditions + last 3 Rx + vitals trend, picks a template, taps autocomplete to add a drug, gets a soft-warning banner about an allergy, acknowledges, hits send — patient receives a branded PDF on email + IG-DM + a working share link. End-to-end without a console error.
- [ ] Three-mount-surface parity verified — every UI item works in `appointment-detail` (full layout), `in-call quick-actions` (narrow center column), and `post-call read-only` (mutation affordances DOM-removed). E6 invariant.
- [ ] Doctor-only RLS verified — two test users (`doctor_a`, `doctor_b`) with a shared patient: `doctor_b` cannot see `doctor_a`'s allergy / condition / vitals / template / Rx rows. F01 invariant.
- [ ] PHI hygiene: no diagnosis text, drug names, allergen text, attachment filenames, or vitals values in console / Sentry / analytics / push payloads / telemetry counters.
- [ ] All 6 logical migrations forward + reverse cleanly; tested against an empty DB AND against a DB with existing 026/027 + chart-context rows + structured medicines + templates.
- [ ] PDF generation < 1.5s p95; resend < 200ms p95 (cache hit); patient page first-paint < 1s p95 on 4G.
- [ ] Drug autocomplete returns within 250ms p95 for queries ≥2 chars; trigram fuzzy works.
- [ ] Backend + frontend type-check + lint clean.
- [ ] Backend + frontend test suites green; new unit tests for `matchAllergens` (T4.18), `useAutoSave` (T2.13), drug-master search ordering (T2.7), HMAC token mint/verify (T3.16).
- [ ] One docs PR adds a brief "EHR features" runbook to `docs/Work/runbooks/` covering: doctor-side "managing patient chart context", "templates lifecycle", "auto-save behavior", "regenerate PDF after letterhead change", "warning telemetry interpretation".

---

## Documentation hygiene

When an item ships:

1. Mark it ✓ in this file's tier section (with date) — also update the per-sub-batch task file.
2. Update the source plan's `Status` row for that item from `[SELECTED 2026-05-03]` → `[SHIPPED YYYY-MM-DD]`.
3. Update the [EHR roadmap index](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md) tier row's status snapshot if the whole tier (or the selected subset) is done.
4. If an item is dropped mid-batch, add a "Dropped" row in this doc with the reason, and revert the source plan's `[SELECTED]` marker to `[DEFERRED]` with a note pointing here.

---

## References

- [EHR roadmap index](../../../Product%20plans/ehr/plan-00-ehr-roadmap.md)
- [T1 — Foundation](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)
- [T2 — Speed](../../../Product%20plans/ehr/plan-t2-ehr-speed.md)
- [T3 — Output](../../../Product%20plans/ehr/plan-t3-ehr-output.md)
- [T4 — Safety](../../../Product%20plans/ehr/plan-t4-ehr-safety.md)
- [T5 — Vitals & trends](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)
- [T6 — AI assist (DEFERRED)](../../../Product%20plans/ehr/plan-t6-ehr-ai-assist.md)
- [Foundation: Plan F01 — Prescription V1 status](../../../Product%20plans/ehr/plan-f01-prescription-foundation-status.md)
- Sibling batches (independent commitments): [text-consult](../../April%202026/28-04-2026/Plans/plan-text-consult-selected-features.md), [voice-consult](../../April%202026/28-04-2026/Plans/plan-voice-consult-selected-features.md), [video-consult](../../April%202026/28-04-2026/Plans/plan-video-consult-selected-features.md)

---

**Owner:** TBD (one or two devs depending on slicing).  
**Created:** 2026-05-03.  
**Status:** Drafted; awaiting commit-start. Recommended order: **A → (B1 ‖ B2) → C → D**. T6 is explicitly out of scope (deferred per Decision E3). Tell me which sub-batch to start with and I'll switch to Agent mode and begin.
