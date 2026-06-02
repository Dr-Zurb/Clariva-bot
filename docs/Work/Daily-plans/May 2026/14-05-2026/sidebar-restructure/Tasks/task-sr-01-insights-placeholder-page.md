# Task sr-01: Insights placeholder page

## 14 May 2026 — Batch [Sidebar restructure](../plan-sidebar-restructure-batch.md) — Wave 1, Lane α step 0 — **XS, ~20min**

---

## Task overview

Stake the URL `/dashboard/insights` so Wave 2's sidebar wiring (sr-03) has a destination to point at. The page itself is **deliberately empty** — `<h1>Insights</h1>` + a "Coming soon" subtitle. No widgets. No KPIs. No backend. No hooks.

Per DL-3 in the source plan, content for Insights ships in a **separate plan once a doctor asks**. Today we just claim the slot so the next sidebar-redesign conversation doesn't argue about whether Insights deserves an entry.

**Estimated time:** ~20 min (10 min create file + auth pattern, 5 min smoke, 5 min commit + verify).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-sidebar-restructure-batch.md § Wave 1](../plan-sidebar-restructure-batch.md#wave-1--stake-the-destinations-2-tasks-1h-sequential-single-lane) + `S3.1` in [Product plans/plan-sidebar-restructure.md](../../../../Product%20plans/plan-sidebar-restructure.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:

- This task file.
- `frontend/app/dashboard/patients/page.tsx` (the server-component auth pattern we mirror — `createClient` → `getUser` → redirect-on-401 → render).
- Source plan §DL-3 (the "no widgets, no backend" directive).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### New file

```
frontend/
└── app/dashboard/insights/
    └── page.tsx                ← NEW: server component, ~20 LOC
```

### `frontend/app/dashboard/insights/page.tsx`

- [ ] Create the file. Server component (no `"use client"`).
- [ ] Use the same auth pattern as `frontend/app/dashboard/patients/page.tsx`:
  - `await createClient()`
  - `await supabase.auth.getUser()` → `redirect("/login")` if absent
  - `await supabase.auth.getSession()` → grab the access token, but **don't fetch anything with it** (we have nothing to fetch yet — just the auth gate matters)
- [ ] Add `export const metadata = { title: "Insights" };` so the browser tab shows "Insights" instead of the default app title.
- [ ] JSDoc at the top:

  ```tsx
  /**
   * Insights — placeholder page (sidebar-restructure batch, sr-01 / DL-3).
   *
   * Deliberately empty. The URL is staked so the sidebar entry has a
   * destination; widgets / KPIs / source mix land in a separate plan once
   * a doctor asks for them (see Product plans/plan-sidebar-restructure.md
   * § S4.1).
   *
   * @see docs/Work/Product plans/plan-sidebar-restructure.md § DL-3
   */
  ```

- [ ] Body renders:

  ```tsx
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  );
  ```

- [ ] **Use semantic design tokens** (`text-foreground`, `text-muted-foreground`) — not raw colours like `text-gray-900`. The dashboard tree everywhere else uses tokens; we don't break the convention here.

### Manual smoke

- [ ] Start the dev server: `pnpm --filter frontend dev` (skip if already running — it's open in terminal `4.txt`).
- [ ] Navigate to `http://localhost:3000/dashboard/insights` while logged in. Page renders the placeholder. Browser tab title is "Insights".
- [ ] Open in an incognito window (logged out). Page redirects to `/login`. Confirms the auth gate fires.
- [ ] Open browser console. No errors / warnings.

### Tests / verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] No new tests required for sr-01 (the placeholder has no logic to test). A test will accompany the real Insights content when S4.1 lands.

---

## Out of scope

- **Sidebar entry pointing at this route** — that's sr-03 (Wave 2).
- **Any analytics widgets, KPIs, charts, mini-tables** — explicitly DL-3. Belongs in S4.1 (separate future plan).
- **A `loading.tsx`** — not needed for a static placeholder. Add when real data fetching lands.
- **`Cmd/Ctrl+5` hotkey for Insights** — captured as S4.6 in the source plan; deferred until content lands.
- **Renaming any other dashboard icon** — e.g. swapping Practice Setup card from `BarChart3` to `Settings2` is captured in `docs/Work/capture/inbox.md` as a follow-up; not done in sr-01.

---

## Files expected to touch

**New:**

- `frontend/app/dashboard/insights/page.tsx` (~20 LOC).

**Modified:** none.

**Tests:** none.

---

## Notes / open decisions

1. **Why mirror `patients/page.tsx` and not the simpler `dashboard/page.tsx`?** `dashboard/page.tsx` is itself the cockpit, with non-trivial layout + KPI widgets. `patients/page.tsx` is the cleanest "fetch, error-handle, render a client component" pattern we have — even though we don't fetch anything yet, copying that auth shape means when content does land in S4.1, the next implementer doesn't refactor the auth scaffold.
2. **Why include the auth gate at all if there's nothing private?** The page is *under* `/dashboard/`, so by convention every page in this tree requires auth. A logged-out visitor seeing "Coming soon" with no chrome would be jarring — they'd see the page outside the dashboard shell. The auth + redirect keeps every `/dashboard/*` route consistent.
3. **Why no fancy "Coming soon" UI (skeleton, illustration, dates)?** Per DL-3, this stake is intentionally minimal. The next contributor (when S4.1 lands) replaces the body wholesale; we don't want them deleting our pretty placeholder.
4. **Why `export const metadata` instead of inline `<title>`?** Next.js 13+ App Router preferred pattern. Same as every other dashboard page.

---

## References

- **Affected files:**
  - `frontend/app/dashboard/patients/page.tsx` (pattern source — read but do not modify)
  - new `frontend/app/dashboard/insights/page.tsx`
- **Source decision:** [Product plans/plan-sidebar-restructure.md § DL-3, S3.1, S4.1](../../../../Product%20plans/plan-sidebar-restructure.md).
- **Wave gate:** the Wave 1 acceptance gate in [`EXECUTION-ORDER-sidebar-restructure.md`](./EXECUTION-ORDER-sidebar-restructure.md#wave-1-gate-after-sr-02) covers this task once sr-02 is also done.
- **Next task:** [`task-sr-02-booking-review-folder-and-redirect.md`](./task-sr-02-booking-review-folder-and-redirect.md) — fresh chat (different files, different concern).

---

**Owner:** TBD
**Created:** 2026-05-14
**Status:** Pending
