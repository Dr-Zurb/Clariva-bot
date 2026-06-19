# Social history v2 — Phase 2: remaining dimensions (lifestyle · context · wellbeing · sexual) — 07 Jun 2026 batch plan

> **Phase 2 of the Social-history-v2 program.** Phase 1 (shipped) made Smoking / Smokeless / Alcohol structured with pack-years + CAGE. Phase 2 completes the medical-school social history by adding **nine more dimensions** — Substances, Diet, Activity, Occupation (+exposures), Living, Travel, Sleep, Stress, and a **gated, off-by-default Sexual history** — onto the same `social_history_structured` JSONB object. Purely additive code; **no new migration** (the JSONB column is already flexible + app-validated).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) — see **Phase 2** section for the concrete shape, serializer, and decisions (SHv2-D6..D9).
>
> **Prefix note:** tasks are `sh-05..08`, continuing the program numbering.
>
> **Builds on:** Phase 1 ([`p1-core-indices/`](../p1-core-indices/)) — the shipped [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) structured model + serializer/parser, [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) (reuses its `StatusChipRow` / `MultiTypeChipRow` / `NumberField` helpers), the [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) `socialHistoryStructuredSchema`, and the carry-forward / template passthrough (which already serialize the whole object).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). All Auto/Sonnet — additive, pattern-cloning work; no Opus.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./Tasks/EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md).

---

## What Phase 2 does (one sentence)

> **Extend the `SocialHistoryStructured` object + serializer + zod schema + `SocialHistoryField` with Substances / Diet / Activity / Occupation+exposures / Living / Travel / Sleep / Stress and a gated Sexual history — promoting the diet/activity/occupation that Phase 1 parked in `notes` back into structured fields — with no new migration.**

---

## Decision lock (frozen for this phase)

- **SHv2-D6 — No migration.** New dimensions ride the existing flexible `social_history_structured` JSONB; validated app-side only (column comment already anticipates Phase 2).
- **SHv2-D7 — Legacy `notes` promotion.** Diet / Activity / Occupation that Phase 1 hydration dumped into `notes` (the `V1_PHASE2_DIMENSIONS` path) are parsed **back out** into their structured fields; genuine free-text stays in `notes`. Lossless.
- **SHv2-D8 — Sexual history gated + discreet.** Off-by-default "Add if relevant" toggle (`sexual.enabled`); only serialized when enabled and a sub-field is set; discreet copy.
- **SHv2-D9 — No new indices.** Chips + numbers only; substances `iv` route shows an infection-risk hint (not a score).
- Inherits SHv2-D1 (JSONB source + derived TEXT) and SHv2-D5 (per-doctor note favourites) from Phase 1.

---

## What this phase does NOT do (deferred)

| Item | Lands |
|---|---|
| Surfacing social history in the PDF/SMS | Out of scope (stored only; serializer stays PDF-ready) |
| New clinical scores beyond pack-years/CAGE (e.g. AUDIT, IPAQ) | Out of program v1 |
| A v3 JSONB→columns normalization for analytics/queryability | Future, if reporting needs it |
| Clinic-wide sharing of note favourites | Deferred (T2-D2) |

---

## Cross-cutting acceptance gate (whole phase)

- [x] All nine dimensions capture + serialize + round-trip (structured → TEXT → structured) without data loss.
- [x] Legacy rows whose diet/activity/occupation sit in `notes` (Phase-1 hydration) promote into the structured fields on open; remaining free-text stays in `notes`.
- [x] Sexual history hidden until "Add if relevant"; absent from the serialized TEXT until enabled + filled.
- [x] Backend `socialHistoryStructuredSchema` validates the new sections (accept/reject); no migration added.
- [x] Carry-forward + presets copy the new dimensions (no extra wiring expected — verify).
- [x] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green (serialize/parse, promotion, validation, component, a11y).

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| v1 | Single-select dimension chips → TEXT (ST-D6) | ✅ Shipped |
| Phase 1 | Structured smoking / smokeless / alcohol + pack-years + CAGE | ✅ Shipped |
| **Phase 2** | **Remaining 9 dimensions incl. gated sexual history (SHv2-D6..D9)** | ✅ Shipped (sh-05..08) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | sh-05 (model + serializer/parser + backend zod) | 1 | 0 | ~2–3h |
| Wave 2 | sh-06 (UI: lifestyle + context) · sh-07 (UI: wellbeing + sexual) | 2 | 0 | ~3–4h (parallel) |
| Wave 3 | sh-08 (integration + a11y + gate) | 1 | 0 | ~1–2h |
| **Total** | **4** | **4** | **0** | **~6–9h agent-time** |

---

## Sequencing notes

- **sh-05 first** — freezes the extended JSONB shape (incl. the legacy-notes promotion) that both UI tasks and the backend depend on.
- **sh-06 + sh-07 in parallel** — two disjoint UI lanes over the same component (lifestyle/context vs wellbeing/sexual); coordinate only on the shared section ordering.
- **sh-08** — integration verify (carry-forward/presets), a11y across the new controls, and the phase gate.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) (Phase 2 §).
- **Phase 1 (shipped):** [`p1-core-indices/`](../p1-core-indices/) · [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) · [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) · [`validation.ts`](../../../../../../../backend/src/utils/validation.ts).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md`](./Tasks/EXECUTION-ORDER-p2-social-history-v2-remaining-dimensions.md).

---

**Created:** 2026-06-07.  
**Status:** ⏳ `Planned` (2026-06-07) — Phase 2 of the Social-history-v2 program.  
**Prev phase:** Phase 1 — core dimensions + indices (✅ shipped).
