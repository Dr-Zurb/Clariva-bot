# Objective tab — Phase 5: point-of-care results + media (structured `test_results` split + attachments) — 18 Jun 2026 batch plan

> **Phase 5 of the Objective-tab program.** Phases 1–4 made the Objective tab *structured* (system-wise exam + Vitals 2.0), gave it the *layout engines* (reorder · collapse · visibility · custom sections · modality/specialty seed), and ported the *scoped-template engine* (per-section templates + specialty packs). But **Zone C — test results — is still one free-text `test_results` textarea.** A doctor pastes outside labs, a glucometer reading, and an ECG note into one prose blob — not structured, not chip-able, not interpretable (normal/high/low), and there is **no objective-native home for media** (wound/rash photos, ECG images, report scans) even though telemed makes patient-captured media routine. Phase 5 **splits `test_results` into structured point-of-care / patient-brought result rows** (the Zone-C analog of P1's structured exam) and adds an **objective media strip** reusing the shipped `prescription_attachments` storage — keeping `test_results` text as a **derived mirror** so PDF / SMS / snapshot break by zero bytes (OBJ-D2).
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P5 (point-of-care results + media); inherits `OBJ-D1..OBJ-D7`. Catalog detail: [`exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §F (point-of-care & test results) + §G (media & telemed).
>
> **Prefix note:** tasks are `obj-20..24` (program numbering continues from P4's `obj-16..19`).
>
> **Builds on:** P1's structured-JSONB + derived-text pattern ([`150_prescriptions_examination_json.sql`](../../../../../../../backend/migrations/150_prescriptions_examination_json.sql) + `examination_json` → `examination_findings` derivation in [`RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) `buildRxPayload`); the shipped attachment storage ([`027_prescription_attachments_bucket.sql`](../../../../../../../backend/migrations/027_prescription_attachments_bucket.sql) + `prescription_attachments` on the prescription type); P3's objective section registry ([`objective-section-order.ts`](../../../../../../../frontend/lib/cockpit/objective-section-order.ts)) + modality/specialty seed ([`objective-default-layout.ts`](../../../../../../../frontend/lib/cockpit/objective-default-layout.ts)); P4's scoped-template engine ([`apply-objective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-objective-template.ts)) + specialty packs. **Reuse, do not fork.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). obj-20 (the `test_results_json` column + derived-text contract) is **Opus** (hard rule: new migration + a **PHI** column). obj-21 (structured POC/result row UI) and obj-23 (POC templates + specialty packs + modality emphasis) are Sonnet (clone the shipped structured-exam + P4 patterns). obj-22 (objective media attachments) is **Opus** (touches storage + PHI media + RLS). obj-24 (close-gate: derived-text byte-parity + media round-trip + a11y + verification) is **Opus** (parity-fixture rigor, mirrors obj-04/obj-15/obj-19).
>
> **⚠️ Opus density flag:** this draft has **3 Opus-grade tasks** (obj-20 migration · obj-22 storage/RLS · obj-24 parity gate) vs. P4's 2. If the owner wants to hold the line at ≤2 Opus/phase, the natural cut is to **split media (obj-22) into its own slice or fold it into P6** and ship P5 as structured-results-only (obj-20/21/23/24). Confirm at promotion.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p5-objective-tab-poc-results-media.md`](./Tasks/EXECUTION-ORDER-p5-objective-tab-poc-results-media.md).

---

## What Phase 5 does (one sentence)

> **Add an additive `prescriptions.test_results_json` JSONB column that holds structured point-of-care / patient-brought result rows (name · value · unit · date · interpretation chip · source), derive the legacy `test_results` text from it on save (OBJ-D2, legacy rows byte-identical), surface those rows as registry-aware Objective sections, give them P4-style templates/specialty packs + modality emphasis, and add an objective-native media strip reusing the shipped `prescription_attachments` storage — all view-only against the derived output.**

---

## Scope (draft 2026-06-18 — confirm before promotion)

| Zone-C surface | Data source | Reads/writes | Mechanism | Status |
|---|---|---|---|---|
| Structured result rows | `prescriptions.test_results_json[]` (new) | name · value · unit · date · interpretation · source · notes | reducer dispatch (clone `examFindings`) | **new (obj-20/21)** |
| Patient-brought reports | a `source: "patient_report"` row | same row shape | reducer dispatch | **new (obj-21)** |
| In-clinic / POC | a `source: "in_clinic_poc"` row (dipstick/glucometer/rapid antigen/ECG note) | same row shape | reducer dispatch | **new (obj-21)** |
| Derived `test_results` text | `prescriptions.test_results` (kept) | derived mirror of `test_results_json` (+ legacy passthrough) | `buildRxPayload` | **OBJ-D2 (obj-20)** |
| Objective media | `prescription_attachments` (shipped storage) | wound/rash photo · ECG image · report scan, tagged objective | existing attachment upload + a context tag | **new (obj-22)** |
| Result templates / packs | `doctor_rx_templates` (P4) | `test_results` / `point_of_care` scope content | P4 apply engine (form-state only) | **new (obj-23)** |
| Pending / ordered results | — | — | **Plan-pane owned; deferred** | out |
| Mental state exam (MSE) | — | — | **Objective-vs-Assessment open Q; deferred** | out |

**Key simplification vs. P1:** the structured-row + derived-text machinery is a near-verbatim clone of P1's `examination_json` → `examination_findings` path (one JSONB column, reducer actions, derive-on-save, legacy passthrough). The genuinely new surface is **media** (obj-22) — and that reuses shipped attachment storage, not a new bucket.

---

## Decision lock (draft — freezes on promotion)

- **P5-D1 — structured results are a typed JSONB column on `prescriptions` (clone OBJ-D1).** Add **one** additive `test_results_json JSONB NOT NULL DEFAULT '[]'` column (mirror of `examination_json`, migration 150) — **not** a single `objective_json` blob, **not** packed into `test_results` text. Resolves catalog §I open-Q (single blob vs. separate column) → **separate column, consistent with the per-feature prescription column pattern.**
- **P5-D2 — one row model, a `source` discriminator.** A result row = `{ id, source: "patient_report" | "in_clinic_poc", name, value?, unit?, date?, interpretation?: "normal" | "high" | "low" | "abnormal", notes? }`. Patient-brought vs in-clinic POC are the **same** shape with a different `source` — no second table, no second reducer family.
- **P5-D3 — derived-text contract holds (OBJ-D2 / P1-D2).** On save, `test_results` text is **derived** from `test_results_json`; **legacy rows (empty json) pass through byte-identical**. PDF / SMS / snapshot / public-prescription read the derived text unchanged. Re-proven in the obj-24 close-gate.
- **P5-D4 — media is objective-native; reuse the shipped attachment storage.** Objective media (wound/rash photo, ECG image, report scan) attaches through the existing `prescription_attachments` bucket (migration 027) + a **context/category tag** so objective media is distinguishable from other prescription files. **No new bucket, no new RLS policy** — inherit the prescription-scoped policy. Telemed (patient-captured) media attaches the same way. Resolves catalog §I open-Q (photo strip home) → **Objective pane.**
- **P5-D5 — modality emphasis layers on P3's view-only seed (OBJ-D6).** In-person → full exam + POC; video → observed + home vitals + uploaded reports; voice/async → patient-reported + uploads only. This is **content emphasis only** (which sections lead / show by default) on top of P3's seed — it **never** changes the derived output and a doctor override always wins (P3-D5).
- **P5-D6 — result templates reuse P4, form-state only (clone P4-D2).** Extend the `doctor_rx_templates` scope set with `test_results` / `point_of_care`; apply = a reducer dispatch into `test_results_json`. A template **never** writes server rows, layout config, or the derived text directly. Specialty packs seed POC starter rows the same way exam packs seed findings.
- **P5-D7 — additive only; legacy escape hatch + deferrals stay (OBJ-D7).** The single `test_results` textarea remains as the unstructured fallback the derived contract round-trips. **Pending/ordered results stay Plan-owned** (deferred); **MSE placement deferred** (Objective-vs-Assessment open Q). No removal of columns/sections/helpers; **no AI/OCR parse of report scans** (compliance gate — same as subj-14 §4).

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| "Pending / ordered results" surfacing from the Plan pane | Investigations *ordered* stay Plan-owned; surfacing them in Objective is a cross-pane open question — not P5. |
| Mental state exam (MSE) structured block | Objective-vs-Assessment placement is unresolved (catalog §I) — parked until decided. |
| AI / OCR parse of report scans or dictated results | Same compliance gate as subjective subj-14 §4 (parked). |
| New storage bucket or media RLS policy | P5-D4 reuses the shipped `prescription_attachments` bucket + policy; a dedicated objective-media bucket is not justified. |
| Typed schema per test (LOINC-coded results, reference-range engine) | Long tail stays free `value`/`unit` + an interpretation chip until demand proves a coded schema (mirrors OBJ-D3). |
| Trend charts for results / vitals | P6 (sparklines + growth charts). |

---

## Cross-cutting acceptance gate (whole phase)

Phase 5 is green only when **all** hold:

- [x] Migration `154_prescriptions_test_results_json.sql` runs idempotently; adds `test_results_json JSONB NOT NULL DEFAULT '[]'` with a `jsonb_typeof = 'array'` CHECK; existing rows + RLS unchanged; the **PHI** comment (structured POC/patient-brought results) is documented. _(obj-20)_
- [x] Zod validates the result-row shape (`source` enum / `interpretation` enum / bounded strings / array size) and drops unknown keys; `buildRxPayload` writes `test_results_json` **and** derives `test_results` text; **legacy/empty rows derive byte-identically.** _(obj-20)_
- [x] Structured result rows render as registry-aware Objective sections (patient-brought + in-clinic POC), with fast entry (name chips + interpretation chips + source toggle) and the kept `test_results` textarea as the escape hatch; reorder/collapse/visibility from P3 apply. _(obj-21)_
- [x] Objective media (wound/rash/ECG/report scan) uploads through the shipped `prescription_attachments` storage with an objective context tag, renders as an objective-native strip, round-trips on reload, and is read-only in `disabled` mode; no new bucket/policy. _(obj-22)_
- [x] Result templates + specialty packs (`test_results` / `point_of_care` scope) save/apply only their own form state via the reducer; modality emphasis layers on P3's seed and never changes the derived output; a doctor override always wins. _(obj-23)_
- [x] **Output parity:** `test_results` derives byte-identically and PDF/SMS/snapshot are unchanged whether content was hand-entered or structured; media attachments round-trip; modality emphasis is provably view-only; no structured/media/template state reaches `buildRxPayload` except through normal form state. _(obj-24)_
- [x] a11y: result-row controls + the media strip + every Templates/pack affordance are keyboard + screen-reader operable; `disabled` mode hides the edit affordances (read-only). _(obj-24)_
- [x] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). _(obj-24)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Structured system-wise exam cards + derived-text contract (obj-01..04) | ✅ Complete |
| P2 | Vitals 2.0 (obj-05..08) | ✅ Complete |
| P3 | Layout engines + modality/specialty default visibility (obj-09..15) | ✅ Complete (2026-06-19) |
| P4 | Exam templates + specialty packs (obj-16..19) | ✅ Complete (2026-06-19) |
| **P5** | **Point-of-care results + media (structured `test_results` split + attachments) (obj-20..24)** | ✅ Complete (2026-06-19) |
| P6 | Trends (vital sparklines; BMI / pediatric growth charts) | 🗒 Drafted |

---

## Tasks (draft)

| Task | Title | Size | Model |
|---|---|---|---|
| `obj-20` | Structured test-results foundation: migration `154_prescriptions_test_results_json.sql` + `test_results_json` typed shape (BE/FE) + Zod + reducer + **derived `test_results` contract** | S–M | **Opus** (migration + PHI column) |
| `obj-21` | Structured POC / result-row UI: `TestResultRow` cards (name/value/unit/date/interpretation chip/source toggle) + register patient-brought + in-clinic-POC Objective sections (P3 registry) | M | Sonnet |
| `obj-22` | Objective media strip: wound/rash/ECG/report-scan attachments via the shipped `prescription_attachments` storage + objective context tag + read-only mode | M | **Opus** (storage + PHI media + RLS) |
| `obj-23` | Result templates + specialty packs + modality emphasis: extend P4 scopes (`test_results`/`point_of_care`), POC starter packs, modality default emphasis on P3's seed | M | Sonnet |
| `obj-24` | Close-gate: derived `test_results` byte-parity (hand vs structured) + media round-trip + modality view-only + a11y + verification gate | M | **Opus** |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | obj-20 (`test_results_json` substrate + migration + derived contract) | 0 | 1 (migration/PHI) | ~2–3h |
| Wave 2 | obj-21 (structured row UI + section registration) | 1 | 0 | ~3–4h |
| Wave 3 | obj-22 (objective media attachments) | 0 | 1 (storage/RLS) | ~3–4h |
| Wave 4 | obj-23 (result templates + packs + modality emphasis) | 1 | 0 | ~3–4h |
| Wave 5 | obj-24 (close-gate + verification) | 0 | 1 | ~2–4h |
| **Total** | **5** | **2** | **3** | **~13–19h agent-time** |

**Caps check:** ≤1 Opus per wave ✓ (each Opus task is its own wave). **Phase Opus count = 3** — exceeds P4's 2; see the Opus-density flag above (split media to keep ≤2 if required).

---

## Sequencing notes

- **obj-20 first (substrate + storage + contract).** Adds the `test_results_json` column + the row type both sides + Zod + reducer actions + the derive-on-save logic in `buildRxPayload`. Near-verbatim clone of P1's `examination_json` → `examination_findings` path. Everything downstream needs the row shape + derived contract frozen. Opus because it lands a migration on a **PHI** column.
- **obj-21 next (structured UI).** The Zone-C analog of P1's `ExamSystemCard`: a `TestResultRow` with fast-entry (name chips, interpretation chips, source toggle), registered as Objective sections (patient-brought + in-clinic POC) so P3's reorder/collapse/visibility apply for free. Pure reducer dispatch.
- **obj-22 (media).** The one genuinely new surface. Reuse the shipped `prescription_attachments` upload + a context tag; render an objective-native strip; honor read-only mode. Opus because it touches storage + PHI media + the attachment RLS path (verify, don't widen).
- **obj-23 (templates + packs + modality).** Extend P4's scope set with `test_results`/`point_of_care`; seed POC specialty packs; wire modality default emphasis onto P3's view-only seed. Thin consumer of P4's apply engine + P3's seed — Sonnet.
- **obj-24 last (prove + gate).** Derived `test_results` byte-parity (hand-entry vs structured), legacy-row passthrough, media round-trip, modality-emphasis-is-view-only, a11y sweep, verification gate. Mirrors obj-04 + obj-15 + obj-19.

---

## References

- **Source:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P5, `OBJ-D2`/`OBJ-D7`.
- **Catalog detail:** [`capture/features/objective-tab/exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §F (point-of-care & test results) + §G (media & telemed) + §I (open questions resolved in the decision lock above).
- **Pattern precedents reused:** P1 structured-exam + derived-text ([`p1-structured-exam/`](../p1-structured-exam/)); P3 registry + modality seed ([`p3-layout-engines/`](../p3-layout-engines/)); P4 scoped templates + packs ([`p4-exam-templates/`](../p4-exam-templates/)).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-19. **Status:** ✅ `Complete` (2026-06-19) — Phase 5 of the Objective-tab program; point-of-care results + media slice closed by obj-24.
