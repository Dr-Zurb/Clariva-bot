# Task pr-13: Cutover — flip nav + 301 redirect v1 → v2

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 6 step 1 — **XS, ~30min**

---

## Task overview

The v2 surface (`/dashboard/patients-v2` list + `/dashboard/patients-v2/[id]`) is now feature-complete and parity-tested. This task **flips the visible Patients tab**: the sidebar item `Patients` now navigates to `/dashboard/patients-v2`, and any external link to the legacy `/dashboard/patients[/...]` URL gets a permanent (301) redirect to its v2 equivalent. The legacy v1 component tree stays in the repo for one more PR (pr-14 deletes it) so we can roll back quickly if the soak surfaces a regression.

**Estimated time:** ~30min (10min sidebar nav change + 10min middleware redirect rule + 10min verification).

**Status:** Done.

**Hard deps:** pr-10, pr-11, pr-12 (all tabs must be real before the user-facing flip).

**Source:** [plan-patients-redesign-batch.md § Wave 6](../plan-patients-redesign-batch.md#wave-6--cutover--cleanup-2-tasks-1h--strict-sequence) + DL-1 (Strangler Fig) + DL-14 (soak strategy).

---

## Model & execution guidance

**Recommended model:** Composer 2 Fast. This task is **mechanical** — two file changes, no architectural decision-making. Composer's strength is small, well-scoped diffs.

**Per-message escalation rule:** Don't escalate. If something doesn't fit, surface it and split into a follow-up.

**New chat?** Yes — fresh Composer chat. Pre-load:

- This task file.
- The sidebar nav source — likely `frontend/components/layout/Sidebar.tsx` or `frontend/components/dashboard-shell/SidebarNav.tsx` (verify with `rg "patients" frontend/components` + `rg "/dashboard/patients" frontend/components/layout`).
- The Next.js middleware — `frontend/middleware.ts` (or `frontend/src/middleware.ts`).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Step 1 — Sidebar nav flip

- [ ] **Discovery:** `rg "/dashboard/patients" frontend/components/layout frontend/components/dashboard-shell frontend/app/dashboard/layout.tsx` to locate the sidebar item href.
- [ ] **Modify** the sidebar item:
  - `href`: `/dashboard/patients` → `/dashboard/patients-v2`.
  - Label stays "Patients" (zero user-visible relabel — the v2 is the Patients tab now).
  - Active-route highlight logic — verify the sidebar correctly highlights "Patients" when the user is on `/dashboard/patients-v2/**` (some active-link helpers use `pathname.startsWith(href)` which would still work; others use exact match which would fail). Fix if needed.

### Step 2 — Server-side 301 redirect (legacy → v2)

- [ ] **Modify** `frontend/middleware.ts`. Add a redirect rule:
  ```ts
  // Patients tab cutover (2026-05-18): redirect legacy /dashboard/patients[/...] to v2.
  if (pathname === '/dashboard/patients') {
    return NextResponse.redirect(new URL('/dashboard/patients-v2', request.url), 301);
  }
  if (pathname.startsWith('/dashboard/patients/')) {
    const rest = pathname.slice('/dashboard/patients'.length); // e.g. '/abc-123' or '/abc-123/edit'
    return NextResponse.redirect(new URL(`/dashboard/patients-v2${rest}`, request.url), 301);
  }
  ```

- [ ] **Verify** the existing `matcher` in `middleware.ts` covers `/dashboard/patients` and its children. Most middleware matchers in this repo cover the entire `/dashboard/**` tree; confirm and adjust if needed.

- [ ] **Comment** in the middleware file noting that this rule is removed in pr-14 (when the v1 routes are deleted, the v2 path becomes canonical and the redirect is redundant — but harmless if left for a release or two).

### Step 3 — Search-bar / command-palette / quick-action audit

- [ ] **Discovery:** `rg "/dashboard/patients/\\\$\\\{" frontend/components frontend/app` (template-literal patient URLs) + `rg "'/dashboard/patients'" frontend/components frontend/app` + `rg "\"/dashboard/patients\"" frontend/components frontend/app`.

- [ ] **Update** call sites that link to a specific patient (`/dashboard/patients/${id}`) to use `/dashboard/patients-v2/${id}` directly so we don't rely on a redirect hop for in-app navigation.

- [ ] **Don't touch** `frontend/components/patients/**` (v1 component tree — pr-14 deletes it). Internal links inside the v1 tree are dead-code-on-arrival once nav flips and external links 301.

### Step 4 — Verification (manual smoke)

- [ ] Boot the dev server: `pnpm --filter frontend dev`. (Likely already running — confirm via the terminals folder.)
- [ ] Click the **Patients** sidebar item → lands on `/dashboard/patients-v2`. v2 surface renders.
- [ ] Visit `/dashboard/patients` directly in the URL bar → redirects to `/dashboard/patients-v2` (verify via browser network tab: 301 then a clean v2 render).
- [ ] Visit `/dashboard/patients/<known-id>` → redirects to `/dashboard/patients-v2/<known-id>` and renders the v2 detail page.
- [ ] Active-state highlight on the sidebar item works on `/dashboard/patients-v2/**`.
- [ ] No console errors. No 404s.

### Step 5 — Telemetry confirmation

- [ ] After cutover, the `patients_v2.list_viewed` and `patients_v2.detail_viewed` events (wired in pr-12) start firing in production volumes equal to or greater than the previous `patients_v1.*` baseline (if any). **This check is the gate for pr-14 — wait 3 days post-merge before deleting v1 code.**

---

## Out of scope

- **Deleting the v1 component tree.** That's pr-14 — explicit separation so we have a 3-day soak window with the v1 code still in the repo.
- **Removing the 301 redirect.** Leave it in place; it's cheap insurance against external bookmarks / shared links. A future cleanup batch can remove it 6+ weeks later.
- **Updating mobile app deep links.** The mobile shell uses its own routing; coordinated separately if it currently deep-links to `/dashboard/patients/...` (it shouldn't — mobile uses native screens).
- **Doctor-facing announcement.** Communications batch decides timing of "we redesigned the Patients tab" message; not part of this technical cutover.

---

## Files expected to touch

**Modified:**

- `frontend/components/layout/Sidebar.tsx` (or wherever the sidebar nav is defined — discovered in Step 1; ~5 LOC delta).
- `frontend/middleware.ts` (~15 LOC delta — add the two redirect blocks).
- 1-3 call sites that template-literal patient URLs (each ~1 LOC delta).

**Total surface area:** ~25 LOC across 3-5 files.

---

## Notes / open decisions

1. **Why 301 instead of 302?** 301 = permanent. We want browsers, the search bar's URL-history autocomplete, and external bookmarks to learn the new URL. If we ever rolled back, we'd want a 308-style temporary; but the rollback plan here is git-revert + redeploy, not URL flip. 301 is correct.

2. **Why not delete v1 in this same task?** Risk separation. If the v2 surface has a regression discovered in soak, we want a one-PR revert to flip back. A combined flip + delete makes that revert a multi-hour rebuild instead of a 5-minute revert.

3. **What about the `/dashboard/patients-v2` route name itself — is "v2" doctor-facing?** No. Doctors see `/dashboard/patients-v2` in their URL bar but the sidebar label, browser tab title, and all in-page copy say "Patients". The `-v2` URL suffix is a temporary technical artefact. Phase 2 (after pr-14 + a few weeks of stability) can rename `patients-v2` → `patients`. Doing it now would create a route conflict with the legacy v1 surface that's still in the repo for soak.

4. **Why not a feature flag instead of a hard flip?** We don't have a feature-flag service wired in this repo (no LaunchDarkly / Statsig). A custom env-flag would require new infra. Cutover via redirect is simpler and idempotent; rollback is `git revert`.

5. **What if the soak surfaces a regression?** Pre-flip mitigation: parity-tested locally + the KPI strip + table cover the most-used flows. Post-flip mitigation: `git revert` the pr-13 commit, redeploy. Doctors keep working on v1 (still in repo until pr-14) with no data loss.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-1 (Strangler Fig)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-14 (soak strategy)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 6 gate](./EXECUTION-ORDER-patients-redesign.md#wave-6-gate-after-pr-13).
- **Next task:** [`task-pr-14-delete-v1-and-sweep.md`](./task-pr-14-delete-v1-and-sweep.md) — runs **after a 3-day soak**, not immediately.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending (after pr-12 + parity-tests pass)
