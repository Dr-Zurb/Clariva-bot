# Rx-polish favorites — R-RX-POLISH/2.2 + 2.3 — 24 May 2026 batch plan

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). **Zero Opus tasks.** Two new tables + a service layer + autocomplete sort tweak + UI chips. Five Auto + one Composer 2 Fast close-out.
>
> **Source plan:** [`plan-cockpit-v2.md` §R-RX-POLISH/2.2 + /2.3](../../../Product%20plans/plan-cockpit-v2.md). 2.2 = drug autocomplete per-doctor frequency ranking. 2.3 = per-row favorite chips ("PCM 500mg TID 5d after meals" applies in one tap).
>
> **Predecessor batches:**
> - **rx-polish-densification (rxd-04)** must ship first — favorite chips render on the summary row's right edge (rxf-04 reads the summary layout from rxd-02).
> - All Phase 2 batches shipped.
> - [backend/migrations/](../../../../../backend/migrations/) — TWO new migrations: `108_doctor_drug_usage.sql` + `109_doctor_drug_favorites.sql`.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-rx-polish-favorites.md`](./Tasks/EXECUTION-ORDER-rx-polish-favorites.md).

---

## Why this batch

A typical GP prescribes ~20-30 drugs >95% of the time. Today's `DrugAutocomplete` sorts results by:
1. Exact-match-on-prefix (correct).
2. Alphabetical within ties (irrelevant — doctors don't care).

Result: a doctor typing "p" sees Paracetamol below Pamidronate and Pancuronium, even though they've prescribed Paracetamol 200 times this year and the others zero. They have to scroll OR type more characters to find their drug. Multiply by 30 prescriptions per day, and that's measurable friction.

**R-RX-POLISH/2.2** ships per-doctor drug frequency tracking (`doctor_drug_usage` table) and a tiny sort tweak in `DrugAutocomplete`: personal-score-first, today's behaviour as tiebreaker. Cold-start (new doctor, no history) is identical to today.

**R-RX-POLISH/2.3** ships the orthogonal capability: per-row favorite chips. A favorite captures a complete medicine row template — drug + dosage + route + frequency + duration + instructions — that one tap inserts. Examples: "PCM 500mg PO TID 5d after meals" for the GP's go-to fever protocol; "Pantop 40mg PO OD 14d empty stomach" for GERD. Doctors maintain ~5-10 favorites; one-tap apply replaces a 30-second editor session with a 1-second chip click.

Both surfaces stack on the densified `<MedicineRow>` from rxd-02:
- Autocomplete ranking lives inside the editor mode (doctor types, results sorted by personal frequency).
- Favorite chips render as a horizontal chip strip ABOVE the medicine list inside `<PlanSection>` — tap a chip → appends a new medicine row pre-filled from the favorite template.

This batch closes R-RX-POLISH/2.2 + /2.3 with **6 tasks across 4 waves**, **~12-16h wall-clock single-engineer (~2 dev-days)**, **two new migrations (108, 109)**, **zero Opus tasks**.

---

## Decision lock

**DL-1: `doctor_drug_usage` is a tracking table with `(doctor_id, drug_master_id, usage_count int, last_used_at timestamptz)` schema.** PK = `(doctor_id, drug_master_id)`. Increment on prescription send (NOT on draft save — drafts can be deleted). Per-doctor scope (no cross-doctor leakage).

**DL-2: Free-text drugs (no `drug_master_id`) are NOT counted.** Frequency ranking only works for drug-master rows. Cold-start behavior for free-text is identical to today. Capture-inbox: future enhancement to fuzz-match free-text against drug-master for partial credit.

**DL-3: `doctor_drug_favorites` is a per-doctor template table with shape `(id uuid PK, doctor_id, name text NOT NULL, template jsonb NOT NULL, created_at, updated_at)`.** `template` JSONB matches `MedicineRowValue` (drug name + dosage + route + frequency + duration + instructions + drug_master_id). Max 30 favorites per doctor (CHECK constraint via count function or app-layer guard).

**DL-4: Favorites are managed via a small UI** — for v1, a `[Manage favorites]` button at the right edge of the chip strip opens a side-sheet (uses cv2-09 `SideSheetAnchor` contract; parallel surface to rx-polish-side-sheet). The side-sheet lists favorites with `[Edit]` / `[Delete]` actions; `[+ Save current row as favorite]` is also offered from the active editor row.

**DL-5: Cold-start chip strip shows hint text.** New doctors with zero favorites see `"⭐ Save medicines you prescribe often as one-tap chips. [+ Save current row]"` instead of an empty strip — gentle education, no friction.

**DL-6: Autocomplete sort = personal score DESC, then existing tiebreakers.** Personal score = `usage_count` from `doctor_drug_usage`. Drugs with zero personal usage rank by today's alphabetical-with-prefix-match rules. No magic decay function in v1 (capture-inbox: time-decay so a drug stops trending once you stop prescribing it).

**DL-7: Increment on Send Rx & finish, not on draft save.** A draft can be deleted; counting it would inflate scores for cancelled visits. Increment fires inside the `POST /api/v1/appointments/:id/send-prescription` endpoint (or wherever sending lives in `prescriptions-service.ts`) — one UPSERT per medicine in the sent Rx, batching all UPSERTs in a single statement.

**DL-8: RLS on both tables enforces doctor-id ownership.** Standard pattern from migration 099 / `doctor_settings` — `current_doctor_id()` predicate; no cross-doctor reads/writes.

**DL-9: Favorites chip-strip lives ABOVE the medicine list, BELOW the `<Investigations>` chip-row (when present in narrow mode) and the Safety strip.** Vertical order: Safety → InvestigationsAutoMerge (narrow only) → Favorites-chip-strip → medicine list → Plan-footer. ~36px tall when populated; 0px when empty in the cold-start sub-case where hint text is shown inline (also ~36px).

**DL-10: Telemetry — three events.** `cockpit_v2.r_rx_polish_favorites_landed` (first chip-strip mount, payload `{ favoritesCount }`). `cockpit_v2.r_rx_polish_favorite_applied` (per chip-tap; payload `{ favoriteId, fromCount: number }`). `cockpit_v2.r_rx_polish_ranking_landed` (first autocomplete render with non-empty personal history; payload `{ topResultPersonalScore: number }`).

---

## Phases

### Wave 1 — Backend foundation (3 tasks, ~5-6h, parallel-ish)

Three independent surfaces — two migrations + one service-layer change. All three can run in parallel by separate engineers, OR sequentially by one engineer.

- [`task-rxf-01-doctor-drug-usage-migration.md`](./Tasks/task-rxf-01-doctor-drug-usage-migration.md) — **XS, Auto** — New `backend/migrations/108_doctor_drug_usage.sql`. Table per DL-1; RLS per DL-8; indexes on `(doctor_id, usage_count DESC)` for fast top-N reads. Migration test in `backend/tests/unit/migrations/108-doctor-drug-usage-migration.test.ts`.
- [`task-rxf-02-doctor-drug-favorites-migration.md`](./Tasks/task-rxf-02-doctor-drug-favorites-migration.md) — **XS, Auto** — New `backend/migrations/109_doctor_drug_favorites.sql`. Table per DL-3; RLS per DL-8; CHECK constraint or app-layer guard for 30-max. Migration test.
- [`task-rxf-03-usage-increment-on-send.md`](./Tasks/task-rxf-03-usage-increment-on-send.md) — **S, Auto** — Modify `backend/src/services/prescriptions-service.ts` (or equivalent) — in the send-prescription handler, after the medicines persist, fire a batched UPSERT into `doctor_drug_usage`: `INSERT ... ON CONFLICT (doctor_id, drug_master_id) DO UPDATE SET usage_count = doctor_drug_usage.usage_count + 1, last_used_at = NOW()`. One UPSERT per medicine with `drug_master_id != null` (DL-2). Unit test on the service.

### Wave 2 — Frontend service + autocomplete sort (2 tasks, ~4-5h, parallel)

- [`task-rxf-04-favorites-service-and-side-sheet.md`](./Tasks/task-rxf-04-favorites-service-and-side-sheet.md) — **M, Auto** — Frontend: new API client wrappers `listFavorites`, `createFavorite`, `updateFavorite`, `deleteFavorite` in `frontend/lib/api/doctor-drug-favorites.ts`. New `<FavoritesSideSheet>` component using cv2-09's `SideSheetAnchor` contract — lists, edits, deletes. New `<FavoritesChipStrip>` component to render at the top of `<PlanSection>`. Backend: corresponding endpoints in a new `backend/src/services/doctor-drug-favorites-service.ts` + route mappings.
- [`task-rxf-05-autocomplete-personal-ranking.md`](./Tasks/task-rxf-05-autocomplete-personal-ranking.md) — **S, Auto** — Modify `frontend/components/ehr/DrugAutocomplete.tsx`: fetch the doctor's `doctor_drug_usage` map once on mount via a new `useDoctorDrugUsage` hook; sort autocomplete results by `usage_count DESC` first, existing rules as tiebreaker. New backend endpoint `GET /api/v1/doctors/me/drug-usage` returns `{ [drug_master_id]: usage_count }` for the calling doctor (cached client-side for the session).

### Wave 3 — Wire into PlanSection + render chip strip (1 task, ~2-3h)

- [`task-rxf-06-wire-chip-strip-and-apply.md`](./Tasks/task-rxf-06-wire-chip-strip-and-apply.md) — **S, Auto** — Modify `frontend/components/cockpit/rx/sections/PlanSection.tsx`: render `<FavoritesChipStrip>` above the medicine list per DL-9. Each chip-tap appends a new medicine row pre-filled from the favorite template + sets it as active editor (handoff to rxd-03's active-row tracking). `[+ Save current row]` writes the active editor row's current `MedicineRowValue` to a new favorite (prompts for a name via a small inline input). Cold-start hint per DL-5.

### Wave 4 — Verification + close-out (1 task, ~1h)

- [`task-rxf-07-verification-and-close-out.md`](./Tasks/task-rxf-07-verification-and-close-out.md) — **XS, Composer 2 Fast** — Smoke; wire 3 telemetry events per DL-10; update COCKPIT.md, roadmap, capture-inbox.

---

## Cross-cutting acceptance gate

### Structural

- [ ] Migrations 108 + 109 applied; both tables exist with RLS; tests pass.
- [ ] Backend services for usage-increment + favorites CRUD exist; unit tests cover happy + edge cases.
- [ ] `<FavoritesChipStrip>` + `<FavoritesSideSheet>` + `useDoctorDrugUsage` exist.

### Behavior

- [ ] Sending an Rx increments `doctor_drug_usage` for every medicine with a `drug_master_id` (DL-7 + DL-2).
- [ ] Free-text drug names DO NOT increment.
- [ ] Drafts deleted before sending DO NOT increment.
- [ ] DrugAutocomplete results: a drug with personal score 200 outranks a drug with personal score 0 with the same prefix match.
- [ ] Cold-start doctor sees today's existing autocomplete ordering (no regression).
- [ ] Tap a favorite chip → new medicine row appears pre-filled + active editor.
- [ ] `[+ Save current row]` from active editor → favorite created with current `MedicineRowValue`.
- [ ] Favorites side-sheet edit / delete works.
- [ ] 30-max favorites per doctor enforced.
- [ ] RLS: doctor B cannot read / mutate doctor A's favorites or usage.

### Quality

- [ ] `pnpm --filter frontend tsc/lint/test/build` clean.
- [ ] `pnpm --filter backend tsc/lint/test/build` clean.
- [ ] `pnpm --filter backend migrate latest` clean.
- [ ] 3 telemetry events firing.

### Documentation

- [ ] `COCKPIT.md` updated.
- [ ] Roadmap updated (R-RX-POLISH/2.2 + /2.3 → ✅).
- [ ] Capture-inbox follow-ups.

---

## Cost estimate

| Wave | Tasks | Auto | Composer 2 | Opus | Wall-clock |
|---|---|---|---|---|---|
| 1 | rxf-01, rxf-02, rxf-03 | 3 | 0 | 0 | ~5-6h (parallel possible) |
| 2 | rxf-04, rxf-05 | 2 | 0 | 0 | ~4-5h (parallel) |
| 3 | rxf-06 | 1 | 0 | 0 | ~2-3h |
| 4 | rxf-07 | 0 | 1 | 0 | ~1h |
| **Total** | **7** | **6** | **1** | **0** | **~12-16h (~2 dev-days)** |

(NB: the prior batches counted 6 tasks; rxf-07 was added during planning so total = 7.)

---

## References

- Source plan §R-RX-POLISH/2.2 + /2.3.
- Existing migration as RLS template: [`backend/migrations/099_doctor_cockpit_layout_presets.sql`](../../../../../backend/migrations/099_doctor_cockpit_layout_presets.sql).
- `MedicineRowValue` type: [`frontend/components/consultation/MedicineRow.tsx`](../../../../../frontend/components/consultation/MedicineRow.tsx).
- Drug autocomplete: [`frontend/components/ehr/DrugAutocomplete.tsx`](../../../../../frontend/components/ehr/DrugAutocomplete.tsx).
- Side-sheet contract: [`frontend/lib/patient-profile/aux-surfaces.ts`](../../../../../frontend/lib/patient-profile/aux-surfaces.ts) §SideSheetAnchor.
