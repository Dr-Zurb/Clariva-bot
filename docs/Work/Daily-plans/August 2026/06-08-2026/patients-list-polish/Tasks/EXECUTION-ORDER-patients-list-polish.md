# Patients list polish — execution order

> Sibling of [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md). Plan = what + why + decision lock; this = who-runs-what-when + model.
>
> **Decision lock:** `PLP-D1`…`D9` in the batch plan.
>
> **Frontend-only batch.** No migration, no PHI write, no RLS → **Composer / Sonnet** (no Opus trigger per `.cursor/rules/00-agent-contract.mdc`).

---

## Pre-flight

- [ ] Read batch plan decision lock (`PLP-D1`…`D9`).
- [ ] Confirm you are polishing **list** only (`/dashboard/patients-v2`), not detail tabs.
- [ ] Note OQ defaults: keep duplicates KPI tile; simple title case; Start consult only if cheap.

---

## Wave plan

```
Wave 1 (~1–1.5h) — parallel OK:
  plp-01  KPI delta + attention polish          [Composer/Sonnet]
  plp-02  Display-name title case              [Composer/Sonnet]
        │
        ▼
Wave 2 (~2–2.5h) — serial:
  plp-03  Deduplicate toolbar vs KPI chips     [Sonnet]
  plp-04  Elevate duplicates callout           [Sonnet]
        │
        ▼
Wave 3 (~1.5–2.5h):
  plp-05  Default compact density (+ optional compact KPI)  [Composer/Sonnet]
  plp-06  Row quick actions                                  [Sonnet]
        │
        ▼
Wave 4 (~45m):
  plp-07  Close gate                           [Composer]
```

`plp-01` / `plp-02` may run in parallel (disjoint files).  
`plp-03` before `plp-04` optional but preferred (toolbar layout settles first).  
`plp-05` after `plp-01` (KPI strip may gain a density prop).  
`plp-06` independent of `plp-05` but both before close gate.

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **plp-01** | S | Composer/Sonnet | `KpiTile.tsx`, `PatientsKpiStrip.tsx` | PLP-D4, D5. |
| W1.1 | **plp-02** | S | Composer/Sonnet | `list-utils.ts`, `PatientsTableColumns.tsx` | PLP-D2. Display only. |
| W2.0 | **plp-03** | M | Sonnet | `PatientsToolbar.tsx`, `PatientsV2Page.tsx` | PLP-D3. |
| W2.1 | **plp-04** | S | Sonnet | `DuplicatesCollapsedChip.tsx`, `PatientsV2Page.tsx` | PLP-D6; OQ1 keep KPI. |
| W3.0 | **plp-05** | S | Composer/Sonnet | `list-preferences.ts`, KPI strip | PLP-D7. |
| W3.1 | **plp-06** | M | Sonnet | `PatientsTable.tsx`, columns, Start consult patterns | PLP-D9; OQ3. |
| W4.0 | **plp-07** | S | Composer | All prior + DoD | Visual QA + gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| plp-01 | S | Composer/Sonnet | Localized component props. |
| plp-02 | S | Composer/Sonnet | Pure helper + cell wiring + unit tests. |
| plp-03 | M | Sonnet | Filter UX judgment; avoid breaking saved views. |
| plp-04 | S | Sonnet | Compose existing merge chip into callout. |
| plp-05 | S | Composer/Sonnet | Pref default + light CSS. |
| plp-06 | M | Sonnet | Action wiring / a11y; may need pattern search. |
| plp-07 | S | Composer | Verification only. |

---

## Acceptance gate

See [batch plan acceptance gate](../plan-patients-list-polish-batch.md#acceptance-gate-batch).

---

## Task files

- [`task-plp-01-kpi-delta-and-attention.md`](./task-plp-01-kpi-delta-and-attention.md)
- [`task-plp-02-display-name-title-case.md`](./task-plp-02-display-name-title-case.md)
- [`task-plp-03-dedupe-toolbar-kpi-chips.md`](./task-plp-03-dedupe-toolbar-kpi-chips.md)
- [`task-plp-04-duplicates-callout.md`](./task-plp-04-duplicates-callout.md)
- [`task-plp-05-default-compact-density.md`](./task-plp-05-default-compact-density.md)
- [`task-plp-06-row-quick-actions.md`](./task-plp-06-row-quick-actions.md)
- [`task-plp-07-close-gate.md`](./task-plp-07-close-gate.md)

---

**Created:** 2026-08-06.
