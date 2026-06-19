# Social history v2 — Phase 1: core dimensions + clinical indices (structured smoking / smokeless / alcohol) — 07 Jun 2026 batch plan

> **Phase 1 of the Social-history-v2 program.** v1 (shipped, ST-D6) made Social / Personal History a set of single-select chips serialized into one `social_history` TEXT column. Phase 1 makes it **structured + clinically complete** for the highest-yield dimensions: it adds a `social_history_structured` JSONB source of truth, captures **daily quantities** (cigs/day, units/week) and the indices doctors are trained on — **pack-years** (smoking) and **CAGE** (alcohol) — and keeps `social_history` TEXT as the **derived** display string (mirrors `complaints` → `cc`/`hopi`, ST-D2).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md) — full data model, indices formulas, serializer, and file-by-file map.
>
> **Prefix note:** tasks are `sh-01..04`.
>
> **Builds on:** Social-history v1 ([`frontend/lib/cockpit/social-history.ts`](../../../../../../../frontend/lib/cockpit/social-history.ts) · [`SocialHistoryField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SocialHistoryField.tsx)) and the `complaints` → `cc`/`hopi` derived-field pattern ([`116_prescriptions_subjective_expansion.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql)). Reuses `doctor_note_favorites` (118) + `NoteFavoritesChipStrip`.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). All Auto/Sonnet — bounded, additive change cloning the shipped derived-field pattern; no Opus in Phase 1.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./Tasks/EXECUTION-ORDER-p1-social-history-v2-core-indices.md).

---

## What Phase 1 does (one sentence)

> **Add a `social_history_structured` JSONB column (source of truth) with structured Smoking / Smokeless tobacco / Alcohol — daily quantities + pack-years + CAGE — derive the existing `social_history` TEXT from it on save, and rebuild `SocialHistoryField` to capture it with live indices.**

---

## Decision lock (frozen for this phase)

- **SHv2-D1 — JSONB source + derived TEXT.** `social_history_structured` JSONB is the source of truth; `social_history` TEXT is derived on save (display/carry-forward/PDF-ready). No destructive change to the TEXT column.
- **SHv2-D2 — Phase 1 scope = nicotine + alcohol.** Smoking, Smokeless tobacco, Alcohol only; remaining dimensions (substances, diet, activity, occupation, living, travel, sleep, stress, sexual) are **Phase 2**.
- **SHv2-D3 — Indices are derived, never stored.** Pack-years `= (per_day / 20) × years`; CAGE `= count(4 booleans)`, **≥2 = screen positive**. Computed live in UI + serializer.
- **SHv2-D4 — Legacy hydration is lossless.** Old rows with only `social_history` TEXT (v1 tokens) best-effort hydrate into the structured model; anything unmatched lands in `notes`.
- **SHv2-D5 — Per-doctor favourites reuse v1.** `NoteFavoritesChipStrip` + `doctor_note_favorites` (field key `socialHistory`) carry over for the notes remainder.

---

## What this phase does NOT do (deferred)

| Item | Lands |
|---|---|
| Substances · diet · activity · occupation+exposures · living · travel · sleep · stress | **Phase 2** |
| Sexual history (off-by-default "Add if relevant" toggle) | **Phase 2** |
| Surfacing social history in the PDF/SMS | Out of scope (stored only today; serializer kept PDF-ready) |
| Clinic-wide sharing of note favourites | Deferred (T2-D2) |

---

## Cross-cutting acceptance gate (whole phase)

- [ ] Migration `125_prescriptions_social_history_structured.sql` runs idempotently; `social_history_structured` JSONB added NULL-able; RLS unchanged (026 covers it).
- [ ] Saving a prescription persists the structured object **and** a derived `social_history` TEXT; reopening hydrates from JSONB (legacy rows hydrate from TEXT without data loss).
- [ ] Smoking / Smokeless / Alcohol capture status + types + daily quantity; `never` collapses compactly.
- [ ] **Pack-years** shows when per-day + years present; **CAGE** shows score `/4` + "screen positive" at ≥2.
- [ ] Carry-forward + subjective presets copy the structured object (not the raw TEXT).
- [ ] `cd frontend; npx tsc --noEmit` + `npm run lint` clean; backend + frontend suites green (indices, serialize/parse round-trip, legacy hydration, component, backend validation/passthrough).

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| v1 | Single-select dimension chips → `social_history` TEXT (ST-D6) | ✅ Shipped |
| **Phase 1** | **Structured smoking / smokeless / alcohol + pack-years + CAGE (SHv2-D1..D5)** | ⏳ Planned (sh-01..04) |
| Phase 2 | Remaining 9 dimensions incl. gated sexual history | ⏳ Planned |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | sh-01 (model + indices + serializer) | 1 | 0 | ~2–3h |
| Wave 2 | sh-02 (migration + backend) | 1 | 0 | ~2–3h |
| Wave 3 | sh-03 (form plumbing + UI) | 1 | 0 | ~3–4h |
| Wave 4 | sh-04 (integration + a11y + gate) | 1 | 0 | ~1–2h |
| **Total** | **4** | **4** | **0** | **~8–12h agent-time** |

---

## Sequencing notes

- **sh-01 first** — the pure model + indices + serializer are the foundation everything imports; fully unit-testable with zero deps.
- **sh-02 next** — migration + backend types/validation/service mirror the sh-01 shape; can start once the JSONB shape is frozen by sh-01.
- **sh-03** — form plumbing + UI rewrite depends on both the model (sh-01) and the payload contract (sh-02).
- **sh-04** — integration (carry-forward/presets), a11y, and the phase gate close it out.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-social-history-v2.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-social-history-v2.md).
- **Patterns reused:** [`116_prescriptions_subjective_expansion.sql`](../../../../../../../backend/migrations/116_prescriptions_subjective_expansion.sql) (derived-field pattern) · [`118_doctor_note_favorites.sql`](../../../../../../../backend/migrations/118_doctor_note_favorites.sql) + [`NoteFavoritesChipStrip.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/NoteFavoritesChipStrip.tsx).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p1-social-history-v2-core-indices.md`](./Tasks/EXECUTION-ORDER-p1-social-history-v2-core-indices.md).

---

**Created:** 2026-06-07.  
**Status:** ⏳ `Planned` (2026-06-07) — Phase 1 of the Social-history-v2 program.  
**Next phase:** Phase 2 — remaining dimensions + gated sexual history.
