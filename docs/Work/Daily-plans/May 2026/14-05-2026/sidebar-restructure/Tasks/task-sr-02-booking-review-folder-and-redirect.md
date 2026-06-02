# Task sr-02: Rename `service-reviews` folder to `booking-review` + add 308 redirect

## 14 May 2026 — Batch [Sidebar restructure](../plan-sidebar-restructure-batch.md) — Wave 1, Lane α step 1 — **XS, ~30min**

---

## Task overview

Rename the route folder so the URL matches the new label. Add a `308 Permanent Redirect` from the old path to the new so existing bookmarks, notification email links, and external references keep working.

Per DL-5 in the source plan: **route rename + redirect, page logic unchanged.** The component `<ServiceReviewsInbox>` and its `frontend/components/service-reviews/` folder are NOT renamed in this task — internal class names don't ship to doctors and renaming them is captured in S4 / S-Q5 (deferred).

**Estimated time:** ~30 min (5 min folder rename, 10 min `next.config.mjs` edit + comment, 10 min smoke including `curl`, 5 min commit + verify).

**Status:** Pending.

**Hard deps:** none.

**Source:** [plan-sidebar-restructure-batch.md § Wave 1](../plan-sidebar-restructure-batch.md#wave-1--stake-the-destinations-2-tasks-1h-sequential-single-lane) + `S2.1` and `S2.2` in [Product plans/plan-sidebar-restructure.md](../../../../Product%20plans/plan-sidebar-restructure.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:

- This task file.
- `frontend/app/dashboard/service-reviews/page.tsx` (the page being moved — read to confirm it has no hard-coded reference to its own slug).
- `frontend/next.config.mjs` (the file the redirect lands in — read to confirm there's no existing `redirects()` block to merge into).
- Source plan §DL-5.

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Step 1 — Folder rename

- [ ] Run `git mv frontend/app/dashboard/service-reviews frontend/app/dashboard/booking-review`. The folder contents (`page.tsx`) move atomically. **Use `git mv`, not a copy + delete** — it preserves the file's history so `git log --follow` works on the moved file.
- [ ] Confirm the folder contents are exactly:

  ```
  frontend/app/dashboard/booking-review/
  └── page.tsx                              ← moved from service-reviews/page.tsx, contents unchanged
  ```

- [ ] **Do NOT modify `page.tsx` itself.** It still imports `<ServiceReviewsInbox>` from `@/components/service-reviews/ServiceReviewsInbox` (the component folder did not move — see "Out of scope"). The page still calls `getServiceStaffReviews(token, "pending")` (the API helper did not move). The route's behaviour is byte-identical to before; only the URL changed.

### Step 2 — Add 308 redirect to `next.config.mjs`

- [ ] Edit `frontend/next.config.mjs`. Add an `async redirects()` method to the `nextConfig` object. Place it after `allowedDevOrigins` (alphabetical-ish; doesn't matter functionally).
- [ ] Final shape (focus on the new addition; keep all existing fields intact):

  ```js
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    env: { /* ...existing... */ },
    allowedDevOrigins: [ /* ...existing... */ ],

    /**
     * Permanent redirects for renamed routes.
     *
     * `/dashboard/service-reviews` → `/dashboard/booking-review`
     * Added 2026-05-14 by sidebar-restructure batch (sr-02 / DL-5).
     * Notification email templates and doctor bookmarks may still hit the
     * old path; the 308 keeps them working without a server-side rewrite.
     *
     * TODO: remove after 2026-06-15 if access logs show zero traffic on
     * `/dashboard/service-reviews` for 30 consecutive days. Until then,
     * keep this redirect in place.
     */
    async redirects() {
      return [
        {
          source: "/dashboard/service-reviews",
          destination: "/dashboard/booking-review",
          permanent: true,
        },
      ];
    },
  };
  ```

- [ ] **Do not** make the redirect cover `/dashboard/service-reviews/:path*` (no wildcard) — there are no nested routes under `service-reviews/` (the folder only contained `page.tsx`). A wildcard would catch unrelated future paths if anyone ever puts something at `/dashboard/service-reviews/foo`. Keep it tight.
- [ ] **Why `permanent: true` (308) instead of `307`?** The rename is final per DL-5. Permanent tells crawlers and the browser cache to update their references. If we ever revert, we revert the config — no client-side cache wins.

### Manual smoke

- [ ] Restart the dev server: `pnpm --filter frontend dev` (Next.js needs a restart to pick up `next.config.mjs` changes — HMR doesn't cover config).
- [ ] `curl -I http://localhost:3000/dashboard/booking-review` → expect `200 OK`.
- [ ] `curl -I http://localhost:3000/dashboard/service-reviews` → expect:
  ```
  HTTP/1.1 308 Permanent Redirect
  Location: /dashboard/booking-review
  ```
- [ ] In the browser logged in: navigate to `/dashboard/booking-review` directly. The existing `<ServiceReviewsInbox>` renders identically to the pre-move page — same tabs (Pending / Confirmed / Reassigned / Cancelled), same row content, same actions.
- [ ] In the browser logged in: navigate to `/dashboard/service-reviews`. Browser address bar updates to `/dashboard/booking-review`. Inbox renders.
- [ ] Open browser DevTools → Network tab. The initial request to `/dashboard/service-reviews` shows status `308`; the follow-up to `/dashboard/booking-review` shows `200`.

### Tests / verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] If there's an existing test that asserts `/dashboard/service-reviews` resolves to the inbox (search `frontend/e2e/` and `frontend/__tests__/` for `service-reviews`): update the test to use the new path, OR add a follow-up assertion that the redirect is in place. **A pre-existing test breaking is acceptable to fix in this same task** since the rename is what changed.

---

## Out of scope

- **Renaming the component folder `frontend/components/service-reviews/` → `booking-review/`** — captured in S4 / S-Q5 (deferred). Internal class names don't ship to doctors. Touching them now would add ~30 min and ~15 import-path edits for zero user-visible value.
- **Renaming the API endpoint `/api/v1/service-staff-reviews`** — captured in S4.3, blocked by DL-10 (no backend changes). Backend rename is a separate plan if it ever happens.
- **Renaming the DB table `service_staff_review_requests`** — same as above; DL-10.
- **Updating the sidebar `href` to point at the new route** — that's sr-03 (Wave 2). For now the sidebar still points at `/dashboard/service-reviews`, which works fine because the redirect catches it. sr-03 will swap the `href` to `/dashboard/booking-review` so doctors don't pay the redirect cost on every click.
- **Updating notification email templates that reference `/dashboard/service-reviews`** — the redirect handles them. If a backend audit later shows we want to update the templates anyway (for clean URLs in inboxes), that's a separate small task.

---

## Files expected to touch

**Renamed (via `git mv`):**

- `frontend/app/dashboard/service-reviews/page.tsx` → `frontend/app/dashboard/booking-review/page.tsx`

**Modified:**

- `frontend/next.config.mjs` (~15 LOC delta — the `redirects()` block + JSDoc).

**Tests:** any existing `service-reviews` route assertions update to the new path or get a redirect-aware assertion. Inspect `frontend/e2e/` and `frontend/__tests__/`.

---

## Notes / open decisions

1. **Why `308` (permanent) and not `307` (temporary)?** Per DL-5 the rename is final. `308` tells search engines and the browser cache to forget the old URL. If we needed to A/B revert, we'd revert the `next.config.mjs` change — the client-side cache update is acceptable cost for the cleaner long-term URL.
2. **Why a `next.config.mjs` redirect and not a Next.js middleware?** Middleware runs on every request to every path; static `redirects()` runs at the routing layer with zero per-request overhead and is statically analysable. For a single permanent rename, `redirects()` is the right tool.
3. **Why the sunset comment (`TODO: remove after 2026-06-15`)?** Redirects don't expire on their own. Without a sunset note, this entry rots in the config forever. The 30-day window matches the standard 308 cache TTL — by then most clients have updated their references.
4. **What if the page logic depends on the route name internally?** It doesn't. `page.tsx` calls `getServiceStaffReviews(token, "pending")` (a typed API helper, not a string-templated path) and renders `<ServiceReviewsInbox>` (an import path that didn't move). Pre-load the file and confirm before the rename — this should be a 30-second check.
5. **Risk of dev-server confusion during the rename?** The dev server is running per terminal `4.txt` (`npm run dev`). After `git mv`, restart with `Ctrl+C` then `pnpm --filter frontend dev`. HMR won't catch a folder move + a `next.config.mjs` change.

---

## References

- **Affected files:**
  - `frontend/app/dashboard/service-reviews/page.tsx` → moved
  - `frontend/next.config.mjs` → modified
- **Source decision:** [Product plans/plan-sidebar-restructure.md § DL-5, S2.1, S2.2](../../../../Product%20plans/plan-sidebar-restructure.md).
- **Wave gate:** the Wave 1 acceptance gate in [`EXECUTION-ORDER-sidebar-restructure.md`](./EXECUTION-ORDER-sidebar-restructure.md#wave-1-gate-after-sr-02) covers this task.
- **Previous task:** [`task-sr-01-insights-placeholder-page.md`](./task-sr-01-insights-placeholder-page.md) — independent of this one; can run in either order, but Wave 1 is sequential single-lane (sr-01 → sr-02) per the exec-order doc.
- **Next task:** [`task-sr-03-sidebar-restructure-and-collapse-toggle.md`](./task-sr-03-sidebar-restructure-and-collapse-toggle.md) — Wave 2; needs both sr-01 and sr-02 done before it can wire the new routes into the sidebar.

---

**Owner:** TBD
**Created:** 2026-05-14
**Status:** Pending
