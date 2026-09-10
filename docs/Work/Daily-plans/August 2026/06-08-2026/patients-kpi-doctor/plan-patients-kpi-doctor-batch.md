# Patients KPI — doctor worklists (batch spec)

> **Status:** Waves 1–3 implemented (2026-08-06); close-gate remaining.  
> **One-line intent:** Make `/dashboard/patients-v2` KPI strip a doctor worklist: incomplete consults, follow-up overdue, new visits, revisits — not ops vanity (active/no-show/duplicates/care-package episodes).  
> **Trigger:** Founder review 2026-08-06 — Active (90d) / No-show / Open episodes / Duplicates / Allergies mis-aimed for doctor Patients tab.

---

## Decision lock

| ID | Decision |
|---|---|
| **PKD-D1** | Strip tiles (order): **Incomplete consults** · **Follow-up overdue** · **New (30d)** · **Revisits (30d)**. |
| **PKD-D2** | **Incomplete** = session started (`live` / `actual_started_at` / join timestamps) **and** appointment never reached `completed`. Exclude never-started (no-show path) and intentional `cancelled`/`no_show` without start. |
| **PKD-D3** | **New (30d)** = first **completed** visit in rolling 30d (not `patients.created_at`). |
| **PKD-D4** | **Revisits (30d)** = ≥1 completed visit in rolling 30d **and** ≥1 completed visit before that window. Mutually exclusive with New. |
| **PKD-D5** | Out of strip: Active (90d), No-show prone, Open care episodes, Possible duplicates, Has allergies. Duplicates stay via existing callout/chip only. |
| **PKD-D6** | No new migration if predicates derive from `consultation_sessions` + `appointments`. |
| **PKD-D7** | Park Insights/ops homes for no-show, allergies, panel size, care episodes — inbox. |

---

## Waves

| Wave | Task | Scope |
|---|---|---|
| 1 | `pkd-01` | Strip + toolbar reshape (remove wrong tiles; keep Follow-up + New until 02/03 land). |
| 2 | `pkd-02` | `incomplete-consult` segment + KPI. |
| 3 | `pkd-03` | Visit-based `new-30d` + new `revisit-30d` segment/KPI. |
| 4 | `pkd-04` | Close gate — types, tests, prefetch, saved-view compat. |

---

## Acceptance gate (batch)

- [x] Strip shows only the four doctor tiles (after wave 2–3).
- [x] Incomplete / New / Revisit definitions match PKD-D2–D4.
- [x] Duplicates still reachable via callout/chip; not a KPI tile.
- [x] No PHI in logs; no migration unless forced.
- [x] Unit tests for segment predicates + KPI keys; frontend typecheck for touched files.
