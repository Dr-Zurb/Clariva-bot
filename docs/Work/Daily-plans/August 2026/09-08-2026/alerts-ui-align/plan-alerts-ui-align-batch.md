# Alerts UI align (batch spec)

> **Status:** Implemented 2026-08-09  

> **One-line intent:** Align Alerts shared chrome with OPD/Patients/Inbox while keeping the notification feed behavior.  
> **Trigger:** Founder 2026-08-09 — Alerts UI is old; match the rest.

---

## Decision lock

| ID | Decision |
|---|---|
| **ALU-D1** | Align **shared chrome only**. Keep: event kinds, copy, severity tint/tag, deep-links, acknowledge / mark-all, Load more, unread-only default. |
| **ALU-D2** | Page title stays `text-2xl font-semibold`. **Drop** nested Card + “Notifications” subtitle — page `h1` is enough. |
| **ALU-D3** | Sticky filter band: Mark all as read + Show acknowledged (`sticky top-14 z-20 … backdrop-blur`). |
| **ALU-D4** | Feed shell → `rounded-lg border border-border/50 shadow-sm` with `divide-y` rows. |
| **ALU-D5** | Empty → dashed centered block (title + short description). |
| **ALU-D6** | Controls → shadcn `Button` / `Checkbox`; errors → `Alert` + Retry `Button`. |
| **ALU-D7** | Loading → row `Skeleton`s; route `AlertsSkeleton` (not `PlaceholderPageSkeleton`). |
| **ALU-D8** | Page stack → `flex flex-col gap-3` (not `space-y-6`). |
| **ALU-D9** | **Out of scope:** new alert kinds, severity filter UI, bulk acknowledge-all API, backend/migrations, Realtime. |

---

## Reference surfaces

| Role | Path |
|---|---|
| Alerts page | `frontend/app/dashboard/alerts/page.tsx` |
| Feed | `frontend/components/dashboard/DoctorDashboardEventFeed.tsx` |
| Inbox align precedent | `docs/Work/Daily-plans/August 2026/08-08-2026/inbox-ui-align/` |
| OPD sticky / empty | `OpdTodayClient.tsx`, `OpdQueueTable.tsx` |

---

## Waves

| Wave | Task | Scope |
|---|---|---|
| 1 | `alu-01` | Drop Card; sticky band; list shell; shadcn toolbar |
| 2 | `alu-02` | Empty / error / skeleton + close gate |

---

## Acceptance gate (batch)

- [x] No nested “Notifications” Card; page title only.
- [x] Sticky band keeps Mark all + Show acknowledged visible while scrolling.
- [x] Feed uses `rounded-lg` list shell; empty is dashed block.
- [x] Loading uses skeletons; errors use Alert + Retry.
- [x] Acknowledge / mark-all / Load more / deep-links still work; unit tests updated + green.
