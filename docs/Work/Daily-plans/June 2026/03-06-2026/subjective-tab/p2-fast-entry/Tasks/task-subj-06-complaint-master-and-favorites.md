# Task subj-06: `complaint_master` + `doctor_note_favorites` — autocomplete + favourite chips

> **Filename:** `task-subj-06-complaint-master-and-favorites.md` in `subjective-tab/p2-fast-entry/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Land the fast-entry substrate: a globally-readable **`complaint_master`** lookup (+ seed of
~150 common presentations, with a `category` that feeds subj-03's schema) and a per-doctor
**`doctor_note_favorites`** table; then wire **complaint autocomplete** (cloning the shipped
`DrugAutocomplete` pattern) and **per-field favourite chips** (cloning `FavoritesChipStrip`)
into the Phase-1 complaint cards + history fields (ST.6 / ST-D5).

**Program / Phase:** subjective-tab · Phase 2 (fast-entry)  
**Batch:** [`plan-p2-subjective-tab-fast-entry-batch.md`](../plan-p2-subjective-tab-fast-entry-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-subjective-tab-fast-entry.md`](./EXECUTION-ORDER-p2-subjective-tab-fast-entry.md)  
**Estimated Time:** ~3–4 hours  
**Status:** ✅ **DONE** — 2026-06-03

**Change Type:**
- [x] **New feature** — two lookups + services + autocomplete/chip UI.

**Current State:**
- ✅ **What exists:** the lookup pattern [`088_drug_master.sql`](../../../../../../../../backend/migrations/088_drug_master.sql) + [`DrugAutocomplete.tsx`](../../../../../../../../frontend/components/ehr/DrugAutocomplete.tsx); the favourites pattern [`109_doctor_drug_favorites.sql`](../../../../../../../../backend/migrations/109_doctor_drug_favorites.sql) + [`FavoritesChipStrip.tsx`](../../../../../../../../frontend/components/cockpit/rx/favorites/FavoritesChipStrip.tsx); the Phase-1 card/history mount points + subj-03's category seam.
- ✅ **What's missing:** ~~`complaint_master` (+ seed) & `doctor_note_favorites` tables + services + API clients; the complaint autocomplete + favourite-chip wiring.~~ **Done.**

**Scope Guard:**
- Expected files touched: ≤ 8 (2 migrations + seed; 2 services; 2 API clients; the autocomplete + chip wiring; tests). Free-text complaint entry stays allowed (autocomplete is suggestion-only).

**Reference Documentation:**
- [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md) · [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4 · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) · [CONTRACTS.md](../../../../../../../Reference/engineering/architecture/CONTRACTS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. `complaint_master` lookup
- [x] ✅ 1.1 Read prior migrations; create `117_complaint_master.sql` (name + synonyms + category + trigram index; globally-readable RLS) mirroring `drug_master`. - **Completed: 2026-06-03**
- [x] ✅ 1.2 Seed ~150 common presentations with categories (pain/fever/cough/…); free-text always allowed. - **Completed: 2026-06-03** (187 seeded)
- [x] ✅ 1.3 Read-only search service + route + typed client (prefix + trigram, capped limit), mirroring the drug search. - **Completed: 2026-06-03**

### 2. `doctor_note_favorites`
- [x] ✅ 2.1 Create `118_doctor_note_favorites.sql` (doctor_id, field_key, value, use_count, last_used_at; unique per doctor+field+value; doctor-scoped RLS) mirroring `doctor_drug_favorites`. - **Completed: 2026-06-03**
- [x] ✅ 2.2 CRUD + "record use" (atomic increment) service + routes + typed client, keyed by `field_key`. - **Completed: 2026-06-03**

### 3. UI wiring
- [x] ✅ 3.1 Complaint autocomplete on the card name (clone `DrugAutocomplete`); selecting sets name + `category` (→ subj-03 schema). - **Completed: 2026-06-03**
- [x] ✅ 3.2 Per-field favourite chips (complaint / FH / SH / PSH / associated) ranked by `use_count`; one-tap insert; "save current" adds a favourite. - **Completed: 2026-06-03**

### 4. Verification & Testing
- [x] ✅ 4.1 Migrations idempotent; seed present; search returns expected first hit < 250ms on dev. - **Completed: 2026-06-03**
- [x] ✅ 4.2 Favourites CRUD + RLS (per-doctor) tests; autocomplete + chip component tests; `tsc`/lint clean. - **Completed: 2026-06-03**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
CREATE: backend/migrations/117_complaint_master.sql (+ seed)
CREATE: backend/migrations/118_doctor_note_favorites.sql
CREATE: backend/src/services/complaint-master-service.ts, note-favorites-service.ts (+ routes/controllers)
CREATE: frontend/lib/api/complaint-master.ts, note-favorites.ts
CREATE: frontend/components/cockpit/rx/subjective/ComplaintAutocomplete.tsx (+ chip wiring into ComplaintCard/HistoryFields)
CREATE: tests for search, favourites RLS, autocomplete/chips
DO NOT TOUCH: the prescriptions schema (Phase 1), Objective/Assessment/Plan
```

**When creating a migration:**
- [x] Read all previous migrations (numeric order) first — [MIGRATIONS_AND_CHANGE.md](../../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md), [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) §4.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **`complaint_master` is a non-PHI lookup** → globally readable; writes service-role only (mirror `drug_master`).
- **`doctor_note_favorites` is PHI-adjacent + per-doctor** → doctor-scoped RLS (mirror `doctor_drug_favorites`); T2-D2 (no clinic sharing).
- **Suggestion-only** — free-text complaint entry always works; autocomplete never blocks.
- **Reuse, don't reinvent** — clone the shipped autocomplete + chip components/patterns.
- No PHI in logs; capped search limits; debounced queries.

**DO NOT include** code, SQL, or signatures in this file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** **Yes** — new `complaint_master` (lookup, non-PHI) + `doctor_note_favorites` (per-doctor, PHI-adjacent free text).
  - [x] **RLS verified?** **Yes** — `complaint_master` read-all/service-write; `doctor_note_favorites` doctor-scoped (4 CRUD policies).
- [x] **Any PHI in logs?** **No.**
- [x] **External API or AI call?** **No.**
- [x] **Retention / deletion impact?** **Yes** — `doctor_note_favorites` cascades on doctor deletion (FK `ON DELETE CASCADE`); `complaint_master` is reference data.

---

## ✅ Acceptance & Verification Criteria

- [x] Migrations idempotent; seed present; complaint autocomplete works (< 250ms) + sets category; per-field favourites insert/rank/save per-doctor; free-text still allowed; RLS + suites + `tsc`/lint green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The substrate for Phase 2 — both lookups + the two reuse-the-T2-pattern UIs. Carry-forward (subj-07) and presets (subj-08) build on top.

---

## 🔗 Related Tasks

- [`../../p1-complaint-cards/Tasks/task-subj-03-complaint-type-attribute-schema.md`](../../p1-complaint-cards/Tasks/task-subj-03-complaint-type-attribute-schema.md) — consumes the `category` this sets.
- [`task-subj-07-carry-forward-last-visit.md`](./task-subj-07-carry-forward-last-visit.md) · [`task-subj-08-subjective-presets.md`](./task-subj-08-subjective-presets.md).

---

**Last Updated:** 2026-06-03  
**Pattern:** `drug_master`/`DrugAutocomplete` + `doctor_drug_favorites`/`FavoritesChipStrip` cloned for complaints/notes.  
**Reference:** `process/CODE_CHANGE_RULES.md` · `process/MIGRATIONS_AND_CHANGE.md`
