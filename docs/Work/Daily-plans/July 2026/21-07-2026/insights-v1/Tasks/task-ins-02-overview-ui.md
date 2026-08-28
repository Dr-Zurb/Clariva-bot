# Task ins-02: Insights overview UI (frontend)

> **Filename:** `task-ins-02-overview-ui.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Replace the `Insights` placeholder with a real dashboard shell: a **7 / 30 / 90-day** range control, the Tier-1 tiles, and a volume trend — all fed by `ins-01`. This task also establishes the **page shell + range context** that later tiers (`ins-03`…`05`) plug into.

**Program / Batch:** insights-v1 · Wave 2
**Estimated Time:** ~2–3 hours
**Status:** ✅ Done (2026-07-21). **Model: Sonnet.**
**Change Type:** ✅ Rewrite placeholder page + add widgets + query plumbing.
**Depends on:** `ins-01` (overview endpoint).

**Current State:**
- ✅ Placeholder: `frontend/app/dashboard/insights/page.tsx` (server component, "Coming soon.").
- ✅ Tile language to reuse: `frontend/components/dashboard/cockpit/KpiStrip.tsx` (`KpiCard`, skeleton, `—`).
- ✅ Query plumbing to mirror: `rxSentTodayQueryOptions` in `frontend/lib/query/options.ts`; key in `frontend/lib/query/keys.ts`; `useRxSentTodayQuery` in `frontend/hooks/queries/`.
- ❌ No Insights query options / hook / widgets.

**Scope Guard:**
- **DO NOT** touch `KpiStrip.tsx` or the Today dashboard (INS-D1).
- **DO NOT** add a new charting dependency (INS-D6) — reuse existing lib or a lightweight CSS bar list.
- **DO NOT** render PHI (patient names/phones) — aggregates only.
- Keep the range control reusable so `ins-03`…`05` widgets consume the same value.

---

## ✅ Task Breakdown

### 1. Data access
- [x] 1.1 Add `practiceHealthQueryOptions(token, range)` to `frontend/lib/query/options.ts` + a key in `keys.ts` (mirror `rxSentTodayQueryOptions`). `range` → `{ from, to }` derived from the 7/30/90 selection.
- [x] 1.2 Add `frontend/hooks/queries/usePracticeHealthQuery.ts` (mirror `useRxSentTodayQuery.ts`).

### 2. Page shell + range control
- [x] 2.1 Keep `insights/page.tsx` as the server-component auth shell; mount a `"use client"` `PracticeHealthOverview`.
- [x] 2.2 Range control: **7 / 30 / 90 days**, default 30 (INS-D5). Lift range into a small context/prop so later tiles reuse it (document the shape).
- [x] 2.3 Changing range refetches and updates all tiles (no full-page reload).

### 3. Widgets
- [x] 3.1 Tile row (reuse/mirror `KpiCard`): **Consults completed** · **No-show rate** (%) · **Revenue captured** (formatted from minor + currency) · **Median consult duration** (mm:ss / min). Skeletons on load; `—` for null.
- [x] 3.2 Volume trend: appointments over the range, stacked by modality. Resolve INS-D6 — check `frontend/package.json` for an existing chart lib; if none, render a compact bar list. **No new dep.**
- [x] 3.3 Empty state: "No activity in the last N days" without crashing.

### 4. Tests
- [x] 4.1 Component test: mocked query data → tiles show correct numbers; range toggle refetches with new params.
- [x] 4.2 Loading + empty states render.

### 5. Verification
- [x] 5.1 `cd frontend && npx tsc --noEmit && npm run lint` — clean for the slice (repo has pre-existing tsc errors elsewhere; insights slice lint/tsc clean).
- [x] 5.2 `cd frontend && npm test` — insights UI tests green (8 passing).
- [ ] 5.3 Manual: open `/dashboard/insights`, flip 7/30/90, confirm numbers change; light + dark; no patient names visible.

---

## 📁 Files to Create/Update

```
CREATE: frontend/hooks/queries/usePracticeHealthQuery.ts
CREATE: frontend/components/dashboard/insights/PracticeHealthOverview.tsx (+ __tests__)
CREATE: frontend/components/dashboard/insights/InsightsRangeControl.tsx    (reused by later tiles)
UPDATE: frontend/lib/query/options.ts                                      (practiceHealthQueryOptions)
UPDATE: frontend/lib/query/keys.ts                                         (query key)
UPDATE: frontend/app/dashboard/insights/page.tsx                          (mount overview)
READ:   frontend/components/dashboard/cockpit/KpiStrip.tsx                (tile language)
DO NOT TOUCH: KpiStrip.tsx, Today dashboard, package.json (no new chart dep)
```

---

## 🧠 Design Constraints

- **Insights ≠ Today** — trend/range surface, not a live-now duplicate.
- **Reusable range control** — `ins-03`…`05` must consume the same selection; don't hardcode per-widget ranges.
- **No new chart dep** (INS-D6). **No PHI** in any tile (INS-D2).
- **Mirror** existing query-options / hook / KpiCard patterns.

---

## ✅ Acceptance Criteria

- [x] `/dashboard/insights` shows a 7/30/90 control + 4 Tier-1 tiles + a volume trend; no "Coming soon." remains.
- [x] Range change updates every widget; loading + empty states are graceful.
- [x] No PHI rendered; `KpiStrip`/Today untouched; no new dependency added.
- [x] Frontend verification gate green (slice). Manual 5.3 left for the human.

---

**Created:** 2026-07-21.
