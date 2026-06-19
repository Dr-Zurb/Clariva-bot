# Subjective tab — Phase 7: doctor-defined custom subsections (own headings + one nested level) — 17 Jun 2026 batch plan

> **Phase 7 of the Subjective-tab program.** The tab today is a *fixed* set of subsections (complaints, PMH/allergies, family/social/surgical) plus one global free-text fallback (`hopi`). Doctors want **their own subsections** — a custom heading with a free-text body, and one level of **sub-subsections** under it — that they can arrange once and reuse on every visit. Phase 7 adds that as a new structured block, stored like the other histories (JSONB source + derived TEXT mirror), seeded from a **per-doctor default** so headings persist across visits, and rendered into the patient-facing PDF.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — new program item (custom subsections); inherits **ST-D1..ST-D7** + the Phase-1/2 decision lock (structured JSONB arrays, derived `cc`/`hopi`, per-doctor config).
>
> **Prefix note:** tasks are `subj-19..22`, continuing the program numbering.
>
> **Builds on:** the structured-history pattern from Phase 1 ([`116_prescriptions_subjective_expansion.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql), [`125`/`126`/`127`](../../../../../../../backend/migrations/)) — JSONB source + derived TEXT mirror, app-side Zod validation; the one-level nesting precedent from Phase 4 (`associatedComplaints`); and the per-doctor JSONB config precedent `doctor_settings.cockpit_layout_presets` ([`doctor-settings-service.ts`](../../../../../../../backend/src/services/doctor-settings-service.ts)). UI mounts in [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) under the existing free-text notes block; form state lives in [`RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-19 (data model) and subj-21 (doctor default) are Auto/Sonnet (additive columns cloning shipped patterns); subj-20 (editor UI) is Sonnet; subj-22 (PDF/output + whole-program close-gate, byte-parity on `cc`/`hopi`) is the Opus-grade slice.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./Tasks/EXECUTION-ORDER-p7-subjective-custom-subsections.md).

---

## What Phase 7 does (one sentence)

> **Add a doctor-defined custom-subsections block to the Subjective tab — each a free-text body under a custom heading, with one level of sub-subsections — stored as a new `custom_subsections` JSONB array on `prescriptions` (derived TEXT mirror for the PDF), seeded on each new visit from a per-doctor default set held in `doctor_settings`, with `cc`/`hopi` derivation byte-unchanged.**

---

## Scope (confirmed with doctor, 2026-06-17)

| Decision | Choice |
|---|---|
| Nesting depth | **Two levels** — subsection → sub-subsection. No deeper (mirrors `associatedComplaints`). |
| Reuse / persistence | **Per-doctor default set** in `doctor_settings`; auto-seeds every new visit (seed-on-empty, never clobber edits). |
| Patient-facing output | **Yes** — rendered as a clinical block in the prescription PDF (and SMS/snapshot text). |
| Node shape | `{ id, title, body, children: [{ id, title, body }] }`; both levels carry an optional free-text body. |

---

## Decision lock (frozen for this phase)

- **P7-D1 — structured JSONB source + derived TEXT mirror (ST-D1).** Visit content is a `custom_subsections` JSONB array on `prescriptions`; a derived plain-text mirror is produced on save for the PDF/SMS/snapshot path. Mirrors `family_history` / `social_history`.
- **P7-D2 — depth capped at 2.** A subsection may own sub-subsections; a sub-subsection may **not**. Enforced in Zod and the UI (no "add sub-subsection" control on children).
- **P7-D3 — additive only; `cc`/`hopi` untouched.** Custom subsections never feed `cc`/`hopi`; the Phase-3 byte-parity close-gate must still pass unchanged.
- **P7-D4 — per-doctor default in `doctor_settings` (T2-D2).** The default heading structure is one per-doctor JSONB value (like `cockpit_layout_presets`), doctor-scoped RLS; no clinic sharing.
- **P7-D5 — seed-on-empty, never overwrite.** Defaults populate a visit only when it has **no** custom subsections yet (fresh prescription). Editing an existing saved visit never re-seeds or resets doctor content.
- **P7-D6 — PHI everywhere.** Subsection bodies are PHI: doctor-scoped on both `prescriptions` and `doctor_settings`, no PHI in logs, included in existing retention/deletion.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Nesting deeper than 2 levels | Out (P7-D2) — explicit doctor decision; bounded UI/PDF. |
| Per-section "patient-visible" toggle | Out — doctor chose all custom subsections render to PDF. Trivial to add a per-node flag later. |
| Sharing default subsections across doctors / clinic | Deferred (T2-D2). |
| Saving custom subsections into `doctor_rx_templates` scopes (Phase 6 picker) | Out — reuse is via the per-doctor default, not the scoped Templates picker. Revisit if doctors want multiple named sets. |
| AI/structured parsing of custom-subsection bodies | Out — free text only (parallels the `hopi` fallback). |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Migration `144_prescriptions_custom_subsections.sql` runs idempotently; `custom_subsections` defaults to `'[]'::jsonb`; `jsonb_typeof = 'array'` CHECK; doctor-scoped RLS unchanged.
- [ ] Migration `145_doctor_settings_subjective_custom_subsections.sql` runs idempotently; per-doctor default JSONB; RLS unchanged.
- [ ] A doctor can add / rename / reorder / remove custom subsections and one level of sub-subsections; depth is hard-capped at 2 in UI **and** validation.
- [ ] Custom subsections save to and hydrate from the prescription round-trip with no loss; bodies validated within length/count caps.
- [ ] A fresh visit auto-seeds the doctor's default subsections; an already-saved visit is never re-seeded or reset (seed-on-empty).
- [ ] "Save current as my default sections" persists the per-doctor default; managing the default never touches any patient's saved visit data.
- [ ] Custom subsections render in the prescription PDF (and SMS/snapshot text) as a clinical block, in order, with empty sections/bodies omitted cleanly.
- [ ] `cc`/`hopi` derive byte-identically to pre-phase fixtures (close-gate); the existing free-text `hopi` fallback is unchanged.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green.

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 6 | Scoped per-subsection templates + PMH/allergy server-apply | ⏳ Planned (subj-15..18) |
| **Phase 7** | **Doctor-defined custom subsections (own headings + one nested level) + per-doctor default + PDF output** | ⏳ Planned (subj-19..22) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-19 (data model + form state) | 1 (Auto/Sonnet) | 0 | ~2–3h |
| Wave 2 | subj-20 (editor UI) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 2 | subj-21 (per-doctor default + seed-on-empty) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 3 | subj-22 (PDF/output + close-gate) | 0 | 1 (Opus) | ~3–5h |
| **Total** | **4** | **3** | **1** | **~11–16h agent-time** |

---

## Sequencing notes

- **subj-19 first (substrate).** Lands `custom_subsections` on `prescriptions` + types + Zod + reducer + save/hydrate + the derived TEXT mirror. Everything downstream needs the form-state field and the round-trip.
- **subj-20 + subj-21 next (parallel lanes after 19).** subj-20 is the editor UI over the form-state field; subj-21 adds the `doctor_settings` default column + API + seed-on-empty hook. They touch disjoint surfaces (UI vs settings/seed) and both depend only on subj-19's shape.
- **subj-22 last (output + gate).** Renders the derived mirror into the PDF/SMS/snapshot and runs the whole-program close-gate (byte-parity on `cc`/`hopi`). Must run after the shape and seeding are stable.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md).
- **Patterns extended:** [`116_prescriptions_subjective_expansion.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql) · [`125`/`126`/`127` structured histories](../../../../../../../backend/migrations/) · [`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts) · [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) · [`RxFormContext.tsx`](../../../../../../../frontend/components/cockpit/rx/RxFormContext.tsx) · [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) · [`doctor-settings-service.ts`](../../../../../../../backend/src/services/doctor-settings-service.ts) (`cockpit_layout_presets` precedent) · [`prescription-pdf-composer.ts`](../../../../../../../backend/src/services/prescription-pdf-composer.ts) + [`PrescriptionDocument.tsx`](../../../../../../../backend/src/templates/prescription-pdf/PrescriptionDocument.tsx).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p7-subjective-custom-subsections.md`](./Tasks/EXECUTION-ORDER-p7-subjective-custom-subsections.md).

---

**Created:** 2026-06-17.  
**Status:** ⏳ `Planned` (2026-06-17) — Phase 7 of the Subjective-tab program; custom-subsections slice.  
**Next phase:** none planned.
