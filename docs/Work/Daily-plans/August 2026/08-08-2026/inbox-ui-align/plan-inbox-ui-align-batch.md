# Inbox ↔ OPD / Patients UI align (batch spec)

> **Status:** Implemented 2026-08-08  

> **One-line intent:** Align Inbox shared chrome with OPD/Patients while keeping master–detail + status rail.  
> **Trigger:** Founder 2026-08-08 — “match inbox UI similar to opd and patients”.

---

## Decision lock

| ID | Decision |
|---|---|
| **INB-D1** | Align **shared chrome only**. Keep: left status rail, list + detail panes, Needs review embed, avatar rows, polling. |
| **INB-D2** | Title token: `text-2xl font-semibold text-foreground`. Keep one-line subtitle (`text-sm text-muted-foreground`) — Inbox is read-only product surface; OPD/Patients have no subtitle by design. |
| **INB-D3** | Sticky filter band under top nav: `sticky top-14 z-20 … bg-background/80 backdrop-blur` wrapping channel / date / focus / search. |
| **INB-D4** | List + detail + Needs review shells → `rounded-lg border border-border/50 shadow-sm` (not `rounded-2xl` / `bg-card/80`). |
| **INB-D5** | Empty states → dashed centered block (title + description; Clear filters when toolbar/search filters active). Detail empty: same pattern, “Select a conversation.” |
| **INB-D6** | Toolbar controls → shadcn `Select` / `Button` / `Checkbox` / `Input` where practical. |
| **INB-D7** | Search parity with OPD/Patients chrome: clear-X, `md:w-72`, optional `/` focus. **Client-filter** loaded rows (name / label / snippet / MRN) — no interactions `q=` API in this batch. |
| **INB-D8** | Rail active state softer: primary fill kept for selected, but muted zero-counts + outline inactive (chip family), hints stay in tooltip (+ short active hint). |
| **INB-D9** | Route `loading.tsx` + `InboxSkeleton` mirroring rail + toolbar + dual pane. Page load error → `Alert` destructive + Try again link. |
| **INB-D10** | **Out of scope:** URL-backed filter sync (beyond existing `?filter=needs_review`), backend search API, converting rail to horizontal chips, table layout, API/migrations. |

---

## Reference surfaces

| Role | Path |
|---|---|
| Inbox page | `frontend/app/dashboard/inbox/page.tsx` |
| Inbox client | `frontend/components/inbox/InboxClient.tsx` |
| OPD sticky / title | `frontend/components/opd/OpdTodayClient.tsx` |
| OPD search | `frontend/components/opd/OpdQueueSearchBox.tsx` |
| OPD empty | `frontend/components/opd/OpdQueueTable.tsx` |
| Patients toolbar | `frontend/components/patients-v2/list/PatientsToolbar.tsx` |
| Patients empty | `frontend/components/patients-v2/list/PatientsTable.tsx` |
| Skeletons | `frontend/components/skeletons/opd-today.tsx`, `patients-list.tsx` |

---

## Waves

| Wave | Task | Scope |
|---|---|---|
| 1 | `inb-01` | Title + shells + sticky band + rail polish |
| 2 | `inb-02` | shadcn toolbar + search + empty states |
| 3 | `inb-03` | Skeleton + page error Alert + close gate |

---

## Acceptance gate (batch)

- [x] Inbox title size matches OPD/Patients; subtitle remains one line.
- [x] Sticky band keeps filters/search visible while scrolling list/detail.
- [x] List/detail/Needs review use `rounded-lg` OPD-like shells.
- [x] Empty list/detail use dashed centered blocks; Clear filters when applicable.
- [x] Search filters loaded rows; clear-X and `/` focus work.
- [x] Route skeleton present; load error uses Alert + Try again.
- [x] Master–detail + rail + Needs review still work; no API/migration.
