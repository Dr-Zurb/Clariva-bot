# Patients ↔ OPD UI align (batch spec)

> **Status:** Implemented 2026-08-07 (poa-01…05).  
> **One-line intent:** Make `/dashboard/patients-v2` share OPD’s page chrome (rhythm, sticky filter band, chips, table/empty/search polish) without turning the roster into a day-of queue board.  
> **Trigger:** Founder 2026-08-07 — “match patient UI with OPD UI” for uniformity.

---

## Decision lock

| ID | Decision |
|---|---|
| **POA-D1** | Align **shared chrome only**. Keep Patients domain: KPI strip, saved views, columns, tags, bulk select/CSV, pagination, profile navigation. |
| **POA-D2** | Drop Patients negative-margin bleed (`-m-4 md:-m-6` on `PatientsV2Page`). Same `main` padding + `gap-3` stack as OPD (`OpdTodayClient`). Keep `flex-1 min-h-0` only if table still needs contained scroll. |
| **POA-D3** | Sticky filter band under top nav: `sticky top-14 z-20 bg-background/80 backdrop-blur` wrapping search + worklist chips + View/bulk (mirror OPD toolbar band). |
| **POA-D4** | **KPI cards** are the only primary worklist control (Incomplete · Follow-up · New · Revisits). Duplicate chip strip removed 2026-08-07 (founder: cards + chips redundant). |
| **POA-D5** | **View** menu: Saved views, More filters (allergies), Tags, Columns. Active non-KPI filters (allergies / tag / legacy) show as dismissible pills **inline in the sticky band** next to search — not on a separate row. |
| **POA-D6** | Table chrome → OPD-like: `rounded-lg border border-border/50 shadow-sm`; sticky header `bg-muted/60 backdrop-blur`; header labels `text-xs font-semibold uppercase tracking-wide text-muted-foreground`. Row density can stay compact (`py-1`/`py-2`) — prefer readability over pixel-clone. |
| **POA-D7** | Empty state → dashed centered block (title + short description + Clear filter / primary action), not a single muted table cell. Error Retry block can stay bordered destructive — match copy hierarchy (title + body + action). |
| **POA-D8** | Search parity with `OpdQueueSearchBox`: clear-X, stable width (`md:w-72` or shared token), optional `/` focus hotkey. |
| **POA-D9** | Title token: `text-2xl font-semibold text-foreground`. |
| **POA-D10** | **Out of scope:** OPD session toolbar, J-K hotkeys, status color bars, mobile card queue, backend/API changes, new migrations. |

---

## Reference surfaces

| Role | Path |
|---|---|
| OPD page | `frontend/components/opd/OpdTodayClient.tsx` |
| OPD chips | `frontend/components/opd/OpdQueueStatusFilter.tsx` |
| OPD search | `frontend/components/opd/OpdQueueSearchBox.tsx` |
| OPD table | `frontend/components/opd/OpdQueueTable.tsx` |
| OPD empty | `frontend/components/opd/opdQueueEmptyState.ts` |
| Patients page | `frontend/components/patients-v2/PatientsV2Page.tsx` |
| Patients toolbar | `frontend/components/patients-v2/list/PatientsToolbar.tsx` |
| Patients table | `frontend/components/patients-v2/list/PatientsTable.tsx` |
| Patients KPI | `frontend/components/patients-v2/list/PatientsKpiStrip.tsx` |
| Patients skeleton | `frontend/components/skeletons/patients-list.tsx` |

---

## Waves

| Wave | Task | Scope |
|---|---|---|
| 1 | `poa-01` | Page shell rhythm + title token (drop bleed). |
| 2 | `poa-02` | Sticky filter band + worklist chips (+ All). |
| 3 | `poa-03` | Search clear / width / `/` hotkey. |
| 4 | `poa-04` | Table chrome + empty/error hierarchy. |
| 5 | `poa-05` | Skeleton refresh + close gate. |

---

## Acceptance gate (batch)

- [x] Patients page padding/stack matches OPD (no negative margin bleed).
- [x] Sticky band keeps search + chips visible while scrolling the table body.
- [x] Four worklists + All are chip-selectable without opening View.
- [x] View still owns saved views / tags / columns.
- [x] Table border/header/empty state visually family-match OPD.
- [x] Search has clear affordance; optional `/` focuses search.
- [x] KPI strip, tags, bulk, pagination still work; no API/migration.
- [x] Loading skeleton matches live layout.
