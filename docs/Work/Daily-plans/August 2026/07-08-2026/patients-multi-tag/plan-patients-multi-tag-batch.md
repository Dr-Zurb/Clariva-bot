# Patients multi-tag (`patients-tags-v2`)

> **Status:** Implemented 2026-08-07 (migration 191 + API + FE). Apply migration on deploy.  
> **One-line intent:** Let a patient hold multiple free-text labels; bulk add/remove/clear; filter by membership; keep today’s single-tag UX as a backfill path.  
> **Trigger:** Founder 2026-08-07 — single `patient_tag` replaces on apply; doctors need multi-tag. Upstream deferral: patients-redesign Phase 2 “Patient-tag taxonomy”.

---

## Decision lock

| ID | Decision |
|---|---|
| **PMT-D1** | Storage: `patients.patient_tags TEXT[] NOT NULL DEFAULT '{}'`. GIN index for membership. |
| **PMT-D2** | Backfill: non-empty `patient_tag` → `ARRAY[trim(patient_tag)]`. Keep `patient_tag` one release as dual-read (`tags[0] ?? null`); stop writes after wave 2; drop column in a later cleanup migration. |
| **PMT-D3** | Limits: max **8** tags/patient; each ≤ **64** chars; trim; case-insensitive match; display first-seen casing; dedupe on write. |
| **PMT-D4** | Filter: `?tag=VIP` = array contains (ANY). `untagged` = `patient_tags = '{}'`. No `tagMode=all` in this batch. |
| **PMT-D5** | Bulk `PATCH /bulk-tag`: `{ ids, op: 'add'\|'remove'\|'set'\|'clear', tags?: string[] }`. Legacy `{ tag: string\|null }` → `set` / `clear`. |
| **PMT-D6** | Tags stay on shared `patients` row (same as today) — doctors sharing a patient share tags. Per-doctor tags = out of scope. |
| **PMT-D7** | Out of scope: taxonomy table, colors, autocomplete service, CSV taxonomy, RLS changes. |
| **PMT-D8** | Merge patients: **union** tags (cap 8). Optimistic FE cache patches `patient_tags[]` (no `refreshKey` remount). |

---

## Waves

| Wave | Task | Model | Scope |
|---|---|---|---|
| 1 | `pmt-01` | **Opus** | Migration + types + dual-read mappers + backfill. |
| 2 | `pmt-02` | Opus / Auto after 01 | Bulk `op` API + list filter membership + tests. |
| 3 | `pmt-03` | Auto | FE: `patient_tags` on summary, row badges (+N), View → Tags, optimistic cache. |
| 4 | `pmt-04` | Auto | FE bulk Add / Remove / Clear all UI. |
| 5 | `pmt-05` | Auto | Close gate — tests, merge union, stop writing `patient_tag`. |

---

## Acceptance gate (batch)

- [ ] Patient can hold `VIP` + `Follow-up` at once.
- [ ] Bulk **Add** does not wipe existing tags; **Remove** leaves others; **Clear all** empties.
- [ ] `?tag=VIP` returns anyone with VIP; Untagged excludes anyone with ≥1 tag.
- [ ] Existing single-tag rows backfill correctly.
- [ ] Apply/clear stay snappy (optimistic list update).
- [ ] No PHI in logs; no RLS shape change.

---

## Current single-tag surface (replace carefully)

- DB: `backend/migrations/104_patients_tags.sql` (`patient_tag TEXT`)
- BE: `bulkTagPatientsForDoctor`, list `?tag=`, `untagged` segment
- FE: `BulkActionsBar`, `PatientsToolbar` Tags submenu, name-cell badge, `patch-patient-tags-cache.ts`
