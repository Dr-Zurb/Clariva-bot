# Social history v2 — Phase 3: clinical depth + surfacing (AUDIT-C · binge/frequency · ABV/thresholds · PDF · tobacco polish) — 07 Jun 2026 batch plan

> **Phase 3 of the Social-history-v2 program.** Phases 1–2 (shipped) made Smoking / Smokeless / Alcohol structured with pack-years + CAGE, added nine lifestyle/context dimensions, and (in a refinement pass) rebuilt alcohol as per-drink rows with units/week, hazardous + LDCT/COPD threshold hints, removed the redundant Pattern chips, and added fortnightly drink frequency. Phase 3 closes the remaining **clinical-depth** and **surfacing** backlog: a validated **AUDIT-C** alcohol screen, **binge / max-in-one-sitting** capture with finer episodic **frequency**, an **ABV field + configurable (India-aware) thresholds**, **PDF/Rx surfacing** of the derived social-history TEXT, and **tobacco polish** (hookah/cigar/vape unit equivalents). Mostly additive; **no new migration** (the `social_history_structured` JSONB is flexible + app-validated).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) — Phase 3 extends its "deferred" table (AUDIT/IPAQ, PDF surfacing).
>
> **Prefix note:** tasks are `sh-09..13`, continuing the program numbering.
>
> **Builds on:** Phases 1–2 ([`p1-core-indices/`](../p1-core-indices/), [`p2-remaining-dimensions/`](../p2-remaining-dimensions/)) — the shipped [`social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) model + serializer/parser, [`social-history-indices.ts`](../../../../../../../frontend/lib/cockpit/social-history-indices.ts) (pack-years/CAGE + threshold hints), [`social-history-alcohol-drinks.ts`](../../../../../../../frontend/lib/cockpit/social-history-alcohol-drinks.ts) (drink rows, units/week, fortnightly), [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx) + [`AlcoholDrinkRows.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/AlcoholDrinkRows.tsx), the [`validation.ts`](../../../../../../../backend/src/utils/validation.ts) `socialHistoryStructuredSchema`, and carry-forward / template passthrough.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). All Auto/Sonnet — additive, pattern-cloning work plus one PDF-template touch; no Opus.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./Tasks/EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md).

---

## What Phase 3 does (one sentence)

> **Add a validated AUDIT-C alcohol screen (with binge capture), finer episodic frequency + a max-in-one-sitting field, an ABV input feeding configurable (India-aware) units/week thresholds, surface the derived social-history TEXT on the prescription PDF, and extend pack-year equivalents to hookah/cigar/vape — all additively over the existing JSONB, no new migration.**

---

## Decision lock (frozen for this phase)

- **SHv3-D1 — No migration.** All new fields ride the existing `social_history_structured` JSONB; validated app-side only. PDF surfacing reads the already-derived `social_history` TEXT.
- **SHv3-D2 — AUDIT-C is additive, not a CAGE replacement.** CAGE stays. AUDIT-C is its own optional 3-question block (`alcohol.auditC`) scored 0–12; record per-question + total + screen-positive flag. Default threshold ≥4 (configurable per SHv3-D4); never auto-diagnose.
- **SHv3-D3 — Binge lives on the alcohol section, not as a Pattern chip.** Capture "max drinks/units in one typical session" once on the alcohol section (and reuse it for AUDIT-C Q3). Pattern chips stay removed.
- **SHv3-D4 — Thresholds are configurable + documented, defaults preserved.** Keep UK-style defaults (14 units/wk hazardous; ≥20/≥30 pack-years) as the shipped constants; expose them as named, overridable config so India-specific values can be set later without code edits in callers. ABV is an **optional override** — when absent, the existing assumed ABV (beer 5%, wine 12%) and peg/ml ratios stand.
- **SHv3-D5 — PDF surfacing is read-only + plain-text.** The serializer already emits PDF-ready plain text; Phase 3 only places it in the prescription PDF (and confirms no PHI leaks in logs). No new derived format.
- **SHv3-D6 — Tobacco polish stays an approximation.** Hookah/cigar/vape get documented cigarette-equivalent multipliers feeding the existing pack-years sum; clearly labelled approximate. No new index type.
- Inherits SHv2-D1 (JSONB source + derived TEXT), SHv2-D5 (per-doctor note favourites), and the Phase-1/2 indices.

---

## What this phase does NOT do (deferred)

| Item | Lands |
|---|---|
| Full AUDIT-10 severity grading | Future — only if AUDIT-C positivity volume warrants it |
| IPAQ / formal activity scoring | Out of program v1 |
| Active CDS (referral order sets, mandatory follow-up prompts) | Future — Phase 3 keeps passive text hints only |
| v3 JSONB→columns normalization for analytics | Future, if reporting needs it |
| SMS / patient-app surfacing of social history | Out of scope (PDF only this phase) |
| Per-clinic threshold **admin UI** | Out of scope — config is code-level constants this phase (SHv3-D4 makes them overridable, not yet editable in-app) |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] **AUDIT-C** captures 3 questions, computes 0–12 total + screen-positive flag, serializes/round-trips, and renders as an optional block beside CAGE (neither gates the other).
- [ ] **Binge / max-in-one-sitting** captured once on the alcohol section, serialized, and reused as AUDIT-C Q3; surfaces a binge hint without depending on weekly average.
- [ ] **Frequency** supports day / week / fortnight / month (+ a way to express sub-weekly cadence) and feeds units/week correctly; round-trips through serialize/parse.
- [ ] **ABV** optional per drink; when set, overrides assumed ABV in units math; when absent, current behaviour is byte-identical. Thresholds (hazardous, pack-years) are named overridable constants with defaults unchanged.
- [ ] **PDF** renders the derived social-history TEXT in the prescription document; absent/empty social history renders nothing; no PHI in logs.
- [ ] **Tobacco** hookah/cigar/vape contribute documented cigarette-equivalents to pack-years; label states it is approximate; cigarette/beedi numbers unchanged.
- [ ] Backend `socialHistoryStructuredSchema` validates all new fields (accept/reject); **no migration added**.
- [ ] Carry-forward + presets copy the new fields.
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green (serialize/parse, indices, validation, component, a11y, PDF).

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| v1 | Single-select dimension chips → TEXT (ST-D6) | ✅ Shipped |
| Phase 1 | Structured smoking / smokeless / alcohol + pack-years + CAGE | ✅ Shipped |
| Phase 2 | Remaining 9 dimensions incl. gated sexual history | ✅ Shipped |
| Refinement | Alcohol drink rows, units/week, threshold hints, Pattern removal, fortnightly, CAGE UX | ✅ Shipped (2026-06-07) |
| **Phase 3** | **AUDIT-C · binge/frequency · ABV/thresholds · PDF · tobacco polish (SHv3-D1..D6)** | ⏳ Planned (sh-09..13) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | sh-09 (AUDIT-C model + UI + backend) | 1 | 0 | ~2–3h |
| Wave 2 | sh-10 (binge + frequency) · sh-11 (ABV + thresholds) | 2 | 0 | ~3–4h (parallel) |
| Wave 3 | sh-12 (PDF surfacing) | 1 | 0 | ~1–2h |
| Wave 4 | sh-13 (tobacco polish + integration/a11y/gate) | 1 | 0 | ~1–2h |
| **Total** | **5** | **5** | **0** | **~7–11h agent-time** |

---

## Sequencing notes

- **sh-09 first** — freezes the extended alcohol shape (`alcohol.auditC`, `alcohol.maxPerSession`) that sh-10 and the gate depend on.
- **sh-10 + sh-11 in parallel** — disjoint surfaces: sh-10 is frequency/binge capture + serialize; sh-11 is the ABV input + threshold config in the units math. Coordinate only on the shared `standardUnitsForDrink` signature.
- **sh-12** — PDF surfacing is independent of sh-10/11 (reads derived TEXT) and could run any time after sh-09; sequenced here to capture AUDIT-C/binge in the rendered text.
- **sh-13** — tobacco polish + the whole-phase integration verify (carry-forward/presets), a11y across new controls, and the phase gate.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md).
- **Phases 1–2 (shipped):** [`p1-core-indices/`](../p1-core-indices/) · [`p2-remaining-dimensions/`](../p2-remaining-dimensions/).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md`](./Tasks/EXECUTION-ORDER-p3-social-history-v2-clinical-depth.md).

---

**Created:** 2026-06-07.  
**Status:** ⏳ `Planned` (2026-06-07) — Phase 3 of the Social-history-v2 program.  
**Prev phase:** Phase 2 — remaining dimensions (✅ shipped) + alcohol refinement (✅ shipped).
