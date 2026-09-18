# Patients list polish (batch spec)

> **Status:** ✅ Complete (2026-08-06). `plp-01`…`plp-07` shipped.  
> **One-line intent:** Tighten `/dashboard/patients-v2` so the table is the hero — cut filter duplication, quiet empty KPI deltas, title-case display names, surface duplicates when they matter, and add light row actions.  
> **Trigger:** Live review of `localhost:3000/dashboard/patients-v2` (KPI strip + repeated chips + inconsistent casing + muted “Possible duplicates: 1”).

---

## Why this batch

Phase-1 patients redesign shipped a doctor-grade registry (KPI strip, segments, saved views, sortable table). On a small practice list it still reads as enterprise chrome:

- Five KPI tiles show `—` for 7-day deltas when nothing changed (looks broken).
- “Follow-up overdue” stays amber even at `0`.
- Segment chips in the toolbar **repeat** four of the five KPI pivots.
- Names render raw (`akashdeep singh` vs `Ramesh Masih`).
- Possible duplicates is easy to miss as a fifth KPI tile.
- Default density is comfortable; the list is the main work surface.

This batch is **frontend polish only** — no API contract changes, no migrations, no PHI logging changes.

---

## Grounded current state

| Piece | Location | Note |
|---|---|---|
| List page island | `frontend/components/patients-v2/PatientsV2Page.tsx` | Owns KPIs, toolbar, table, duplicates chip, saved views. |
| KPI strip | `…/list/PatientsKpiStrip.tsx` + `KpiTile.tsx` | Five tiles; `attention` severity always on follow-up + duplicates; delta `—` when `0`. |
| Toolbar / chips | `…/list/PatientsToolbar.tsx` | `SEGMENT_CHIPS` includes Active / New / Follow-up / Open episodes + secondary chips. |
| Table cells | `…/list/PatientsTableColumns.tsx` | `nameAndRiskPillsCell` prints `patient.name` as stored. |
| Density prefs | `frontend/lib/patients-v2/list-preferences.ts` | Default `comfortable` via `readDensityFromStorage`. |
| Duplicates UX | `…/list/DuplicatesCollapsedChip.tsx` | Opened from KPI tile + toolbar slot. |
| Predecessor plan | `docs/Work/Daily-plans/May 2026/18-05-2026/patients-redesign/` | pr-05 / pr-06 / pr-07 / pr-08 own the surfaces we touch. |

---

## Decision lock

| ID | Decision | Rationale |
|---|---|---|
| **PLP-D1** | **Frontend-only.** No backend KPI/list contract changes, no migrations. | Polish batch; keep scope ≤ UI + display helpers + tests. |
| **PLP-D2** | **Display casing only.** Title-case for list (and identity strip if trivial); never rewrite DB `name`. | Avoid PHI write / merge side effects. |
| **PLP-D3** | **KPI strip is the primary segment pivot** for the four overlapping segments. Toolbar keeps **secondary-only** chips + active-segment indicator when a KPI filter is on. | Removes duplication without removing discoverability. |
| **PLP-D4** | **Hide zero deltas** (no `—` row). Show delta only when `delta7d !== 0`. | Zero-change is normal; dash reads as “missing data”. |
| **PLP-D5** | **`attention` styling only when count > 0** (follow-up overdue + possible duplicates). | Amber must mean “look here”. |
| **PLP-D6** | **Duplicates: sticky inline callout when count > 0**, in addition to (or replacing the visual weight of) the fifth KPI. KPI tile may remain for count/history. | Owner called out “Possible duplicates: 1” as easy to miss. |
| **PLP-D7** | **Default density → `compact`** for users with no stored preference. Existing localStorage choice wins. | Registry density > card comfort. |
| **PLP-D8** | **Push-notification banner out of scope.** | Lives in dashboard shell; separate task if needed. |
| **PLP-D9** | **Row actions are additive** (hover/overflow). No removal of name→detail navigation. | Keep chart as primary drill-in. |

---

## Proposed task list

| Task | Title | Size | Model | Notes |
|---|---|---|---|---|
| `plp-01` | KPI tile: hide zero deltas + attention only when count > 0 | S | Composer / Sonnet | `KpiTile` + strip wiring. |
| `plp-02` | Display-name title case (list) | S | Composer / Sonnet | Helper + `nameAndRiskPillsCell` (+ avatar initials already OK). |
| `plp-03` | Deduplicate toolbar chips vs KPI pivots | M | Sonnet | PLP-D3; secondary chips stay. |
| `plp-04` | Elevate duplicates callout when count > 0 | S | Sonnet | Banner/chip above table; reuse merge flow. |
| `plp-05` | Default density compact + optional compact KPI strip | S | Composer / Sonnet | Prefs default + light strip density. |
| `plp-06` | Row quick actions (call / copy phone / start consult if cheap) | M | Sonnet | Overflow or hover actions; no new APIs if hooks exist. |
| `plp-07` | Close gate (visual QA + lint/typecheck/tests) | S | Composer | Verify all PLP-D* + DoD. |

---

## Acceptance gate (batch)

- [x] Overlapping segment chips no longer appear twice as primary controls.
- [x] KPI tiles with `delta7d === 0` show no delta row (or an explicit “no change” only if product later insists — default: omit).
- [x] Amber attention only when the relevant count is > 0.
- [x] List names use consistent title-case display; stored values unchanged.
- [x] When possible duplicates ≥ 1, a clear callout appears above the table and opens the existing merge/review flow.
- [x] New users (no density preference) land on compact.
- [x] Row still navigates to detail; quick actions do not block that.
- [x] Frontend typecheck + lint + relevant unit tests green.
- [x] No PHI in logs; no backend/migration touch.

---

## Open questions (non-blocking)

| ID | Question | Default if unanswered |
|---|---|---|
| **PLP-OQ1** | Should “Possible duplicates” remain a 5th KPI tile once the callout ships? | **Keep tile** + add callout (plp-04). |
| **PLP-OQ2** | Title-case Indian / multi-part names (e.g. “singh” particles)? | Simple whitespace-split title case; no locale dictionary in this batch. |
| **PLP-OQ3** | Include “Start consult” in row actions if wiring is non-trivial? | Ship Call + Copy phone first; Start consult only if an existing helper is one import away. |

---

**Created:** 2026-08-06.
