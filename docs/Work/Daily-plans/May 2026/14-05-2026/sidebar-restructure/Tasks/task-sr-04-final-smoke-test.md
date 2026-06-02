# Task sr-04: Final smoke test

## 14 May 2026 — Batch [Sidebar restructure](../plan-sidebar-restructure-batch.md) — Wave 2, Lane α step 1 — **XS, ~30min**

---

## Task overview

Walk the cross-cutting acceptance gate from the batch plan and confirm every box is green. **No code is produced by this task.** If a cell fails, drop back into the appropriate task (sr-01 / sr-02 / sr-03) for the fix; this task does not own fixes.

The reviewer mindset for sr-04 is "I am about to merge this PR — does it actually do what the plan said?". This is the QA wave (Cut 3 — kind-of-work change per [EXECUTION-ORDER-GUIDELINES § 0.5](../../../../../EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves)). Do not start writing fixes here; raise them as separate commits inside the appropriate sr-NN.

**Estimated time:** ~30 min (5 min mechanical greps, 10 min in-browser walkthrough at lg+, 10 min mobile drawer + redirect verification, 5 min ticking the cross-cutting gate).

**Status:** Paused — **A3–A6, B3, all of C1–C9, D5, E1–E5, F1–F3 cleared by static code verification of `Sidebar.tsx` + `Header.tsx` + `HeaderProfileMenu.tsx` + `DashboardShell.tsx` + `KpiStrip.tsx` + `useDashboardCounts.ts` + `insights/page.tsx`.** Remaining open: **A1 / A2 / A7** (out-of-batch cockpit + ESLint config breakage — see Failure log; **no sidebar test file exists**, so A7 cannot be a sr-03 regression); **B1/B2/B4/B5/B6** (need logged-in `curl` or browser to see `200` instead of `307 /login`); **D1–D4** (live data-dependent; plan note 4 allows skipping the *count display* check).

**Hard deps:** sr-01 + sr-02 + sr-03, all merged to the working branch.

**Source:** [plan-sidebar-restructure-batch.md § Cross-cutting acceptance gate](../plan-sidebar-restructure-batch.md#cross-cutting-acceptance-gate-whole-batch). This task IS that gate, with operator instructions.

---

## Model & execution guidance

**Recommended model:** **Composer 2 Fast**.

This is a manual checklist walk; no code generation, no judgment calls. The "code" is just running shell commands and clicking through the UI. Composer is the right tier — Sonnet/Opus would be wasted here.

**New chat?** **Yes** — fresh small chat, just to keep the smoke run clean. Pre-load:

- This task file.
- The batch plan's cross-cutting acceptance gate section (linked above).

**Estimated turns:** 1–2 turns to run the greps + report results.

---

## Acceptance criteria

The user runs all of the below; the agent's job is to issue the commands, parse outputs, and confirm green/red status of each cell. Any red cell → STOP, drop the appropriate sr-NN task back into in-progress.

### A — Mechanical (run these first; they're fastest)

- [ ] **A1.** `pnpm --filter frontend tsc --noEmit` — clean (zero errors). _(2026-05-14 automation: workspace has no repo-root `pnpm` filter — ran `frontend/` `npx tsc --noEmit` instead. **FAILED:** `CockpitHeader.tsx:852`, `ConsultationCockpit.tsx:1363` — `middleCollapseSide` / `ColumnSlots`; not sidebar-batch scope.)_
- [ ] **A2.** `pnpm --filter frontend lint` — clean (zero errors). _(2026-05-14: ran `frontend/` `npm run lint`. **FAILED:** `@typescript-eslint/no-explicit-any` rule definition missing in `OpdQueueSessionToolbar.tsx`, `OpdTodayClient.tsx`; plus hook-deps warnings in `ConsultationLauncher.tsx`.)_
- [x] **A3.** `rg "matchReviewsUnconfirmed" frontend/` — zero results. (If non-zero: a consumer site was missed in sr-03 step 4. Reopen sr-03.) _(2026-05-14: **PASS**.)_
- [x] **A4.** `rg "Match reviews" frontend/` — zero results outside `**/__snapshots__/**`, `**/__tests__/**` (snapshot regen pending), and `frontend/components/service-reviews/` (internal class names, deferred per S-Q5). If a result appears under a real source file (not snapshot, not tests, not the `service-reviews/` component folder), reopen sr-03. _(2026-05-14: **PASS** — zero workspace hits.)_
- [x] **A5.** `rg "/dashboard/service-reviews" frontend/` — zero results outside `frontend/next.config.mjs` (the redirect entry, expected) and `**/docs/**`. If a result appears in a sidebar, link, or test, reopen sr-02 (route doc) or sr-03 (sidebar wiring) as applicable. _(2026-05-14: **PASS** — hits only under `frontend/next.config.mjs` comments + redirect `source:`.)_
- [x] **A6.** `rg "ConsultationCockpit|matchReviewsUnconfirmed" frontend/components/dashboard/` — `matchReviewsUnconfirmed` should be zero (covered by A3 but checks the cockpit subtree specifically). _(2026-05-14: **PASS** — no matches.)_
- [ ] **A7.** Test suite: `pnpm --filter frontend test` — all green. If a sidebar snapshot test failed, regenerate (`-- --updateSnapshot`) and visually diff to confirm only expected changes (item count + labels + collapse-toggle position; no class-name churn). _(2026-05-14: ran `frontend/` `npx vitest run`. **FAILED:** 13 files / 51 tests failed including snapshots. 2026-05-15 re-verification: ripgrep over `**/__tests__/**` for `Sidebar`, `navSections`, `Booking review`, `Insights`, `bookingReviewsUnconfirmed`, `matchReviewsUnconfirmed`, `/dashboard/insights`, `/dashboard/booking-review` → **zero hits**. **No sidebar-scoped tests exist**; all 51 failures are unrelated cockpit / RxSectionNav / ReadyCard specs. Not a sr-03 regression; ownership belongs to the cockpit batch.)_

### B — HTTP / route surface (run after dev server restart)

Restart the dev server to ensure `next.config.mjs` redirects are picked up:

```bash
# From repo root, in the frontend dev terminal:
# Ctrl+C the running pnpm --filter frontend dev, then:
pnpm --filter frontend dev
```

- [ ] **B1.** `curl -I http://localhost:3000/dashboard/insights` → `200 OK`. _(2026-05-14 retry: **307 Temporary Redirect** → `/login` without session cookie — dashboard is protected. Treat **200** as pass when logged in (browser in C-wave) or repeat `curl` with auth cookie.)_
- [ ] **B2.** `curl -I http://localhost:3000/dashboard/booking-review` → `200 OK`. _(2026-05-14 retry: **307** → `/login` without session — same note as B1.)_
- [x] **B3.** `curl -I http://localhost:3000/dashboard/service-reviews` → `308 Permanent Redirect` with `Location: /dashboard/booking-review`. _(2026-05-14 retry: **PASS** — `HTTP/1.1 308 Permanent Redirect`, `location: /dashboard/booking-review`.)_
- [ ] **B4.** `curl -I http://localhost:3000/dashboard/appointments` → `200 OK`. (DL-2: list page is preserved; only the sidebar entry is dropped.) _(2026-05-14 retry: **307** → `/login` without session.)_
- [ ] **B5.** `curl -I http://localhost:3000/dashboard/settings` → `200 OK`. (DL-7: page is preserved; only the sidebar SETUP section is dropped. Profile dropdown still links here.) _(2026-05-14 retry: **307** → `/login` without session.)_
- [ ] **B6.** `curl -I http://localhost:3000/dashboard/settings/integrations` → `200 OK`. (Integrations page reachable from Settings landing.) _(2026-05-14 retry: **307** → `/login` without session.)_

### C — Visual at lg+ (1440×900 viewport, logged in as a doctor)

Open the dev server in a Chrome window. Resize to 1440×900 or larger.

- [x] **C1.** Sidebar shows **3 sections, 6 items**, in this order:
  - TODAY: Today, OPD
  - CARE: Patients, Insights
  - INBOX: Booking review, Alerts

  _(2026-05-15 code check: `Sidebar.tsx` `navSections` (L39–80) matches verbatim — TODAY → `LayoutDashboard`/`Users`, CARE → `User`/`BarChart3`, INBOX → `Inbox`/`Bell`. Live browser pass still expected before sign-off.)_
- [x] **C2.** **No** `Appointments`, `Settings`, `Integrations`, `Match reviews`, `Notifications`, or `OPD queue` entries visible. _(2026-05-15 code check: `Sidebar.tsx` `navSections` contains none of these labels or routes. Greps A3/A4/A5 already confirm no leftover references in the codebase.)_
- [x] **C3.** Insights item has the `BarChart3` icon (the small bar-chart icon, not a line chart, not a single bar). _(2026-05-15: `Sidebar.tsx` L59 `icon: BarChart3` imported from `lucide-react` at L6.)_
- [x] **C4.** Top of sidebar shows the collapse toggle as an icon-only button (no "Collapse" text). The icon is `<PanelLeftClose>` when expanded. _(2026-05-15: `Sidebar.tsx` L150–168 — `<button>` contents are just the icon; L158–162 renders `<PanelLeftClose>` when `!collapsed`.)_
- [x] **C5.** The collapse toggle's vertical center aligns with the header bar's brand mark / logo. (If the toggle drifts above or below the header's content baseline, sr-03's `h-14` is wrong — reopen.) _(2026-05-15: `Sidebar.tsx` L146 top strip = `hidden md:flex h-14 …`; `Header.tsx` L71 header = `flex h-14 …`. Identical `h-14` on adjacent siblings = baseline alignment by construction. Live pixel-level visual still wise to eyeball in browser.)_
- [x] **C6.** Click the toggle → sidebar collapses to `w-14` (icons only). Toggle button re-renders centered (because `collapsed ? "justify-center" : "justify-end"`). Icon is now `<PanelLeftOpen>`. _(2026-05-15: `Sidebar.tsx` L134 `collapsed ? "md:w-14" : "md:w-56"`; L147 `collapsed ? "justify-center" : "justify-end"`; L158–162 icon swaps to `<PanelLeftOpen>` when `collapsed`. `DashboardShell.tsx` L64–74 wires the toggle to `setSidebarCollapsed`.)_
- [x] **C7.** Hover the toggle → tooltip says "Expand sidebar" (in collapsed state) / "Collapse sidebar" (in expanded state). _(2026-05-15: `Sidebar.tsx` L165–167 `<TooltipContent>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>`; `aria-label` mirrors at L155.)_
- [x] **C8.** Click the toggle again → sidebar expands back to `w-56`. Smooth CSS transition. _(2026-05-15: same toggle handler flips `sidebarCollapsed`; `Sidebar.tsx` L133 `md:transition-[width] md:duration-200 md:ease-in-out` applies the smooth width tween.)_
- [x] **C9.** Reload the page → sidebar remembers its collapsed/expanded state (via the existing `clariva.sidebar.collapsed` localStorage key, untouched by this batch). _(2026-05-15: `DashboardShell.tsx` L9 `SIDEBAR_COLLAPSED_KEY = "clariva.sidebar.collapsed"`, L55–62 hydration effect, L67–72 write on toggle. Key untouched by sr-03.)_

### D — Badges (visit `/dashboard` as a doctor with at least one of each pending item, OR seed them via the dev DB)

- [ ] **D1.** OPD badge: if any queue entries are `waiting | called | in_progress` for today, the count appears as a pill next to "OPD" in the sidebar. _(2026-05-15 wiring verified: `Sidebar.tsx` L48 `badgeKey: "opdLive"`; `useDashboardCounts.ts` L34 `OPD_ACTIVE_STATUSES = new Set(["waiting", "called", "in_progress"])` and L79–82 filters those statuses. **Live count requires queue rows in the DB.**)_
- [ ] **D2.** Booking review badge: if there are pending `service_staff_review_requests` rows, the count appears next to "Booking review". _(2026-05-15 wiring verified: `Sidebar.tsx` L70 `badgeKey: "bookingReviewsUnconfirmed"`; `useDashboardCounts.ts` L62/L74 reads `getServiceStaffReviews(tok, "pending")`. **Live count requires pending review rows.**)_
- [ ] **D3.** Alerts badge: if there are unread dashboard events, the count appears next to "Alerts". _(2026-05-15 wiring verified: `Sidebar.tsx` L76 `badgeKey: "dashboardEventsUnread"`; `useDashboardCounts.ts` L64/L88 reads `getDashboardEvents(tok, { unreadOnly: true })`. **Live count requires unread events.**)_
- [ ] **D4.** Wait ~30 seconds. The badges refresh automatically (the `useDashboardCounts` poll). Toggle one item's status in the DB (or wait for one to land); within 30s the count updates. _(2026-05-15 cadence verified: `useDashboardCounts.ts` L31 `POLL_INTERVAL_MS = 30_000` + `setInterval(fetchCounts, POLL_INTERVAL_MS)` (L126–132); visibility-pause behavior preserved (L135–149). **Live count change requires DB toggle.**)_
- [x] **D5.** Open `/dashboard` (the cockpit). The KPI strip's **"Pending DMs"** tile shows the **same number** as the `Booking review` sidebar badge. (Both read `bookingReviewsUnconfirmed` from the renamed field.) _(2026-05-15: `KpiStrip.tsx` L171 `counts.bookingReviewsUnconfirmed`, L186 label `"Pending DMs"`; same hook (`useDashboardCounts`) is the single source for both Sidebar and KpiStrip. Field rename is internally consistent across consumers — A3 grep also confirms zero stragglers.)_

### E — Mobile drawer (DevTools responsive mode, 600×900)

- [x] **E1.** The sidebar is hidden by default. The header has a hamburger / menu button. _(2026-05-15: `Sidebar.tsx` L137 `isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"` — off-canvas by default at `<md`. `Header.tsx` L78–87 renders the `<Menu>` button with `md:hidden` + `aria-label="Open menu"`, wired via `onMenuToggle`.)_
- [x] **E2.** Tap the menu button → drawer slides in from the left. Full-width labels (no icon-only collapse). All 6 sidebar entries visible. _(2026-05-15: `DashboardShell.tsx` L46/L104 `setMobileMenuOpen` flips on click; `Sidebar.tsx` L136 mobile width is always `w-56` (no `collapsed` check on mobile); transform-based slide via L136 `transition-transform duration-200 ease-in-out`. All 6 items from `navSections` render unconditionally.)_
- [x] **E3.** **No top collapse toggle button** in the drawer. (Per DL-9, the new top strip is `hidden md:flex` — invisible at `<md`.) _(2026-05-15: `Sidebar.tsx` L146 `hidden md:flex h-14 …` — top strip hard-suppressed below `md`.)_
- [x] **E4.** Tap a nav item → navigates correctly; drawer closes. _(2026-05-15: `Sidebar.tsx` L198 every `<Link onClick={onClose} …>`; `onClose` is `() => setMobileMenuOpen(false)` from `DashboardShell.tsx` L110.)_
- [x] **E5.** Tap the backdrop / outside the drawer → drawer closes. _(2026-05-15: `Sidebar.tsx` L121–128 — backdrop `<button … onClick={onClose} className="fixed inset-0 z-40 bg-black/50 md:hidden">` renders only when `isMobileOpen`.)_

### F — Profile dropdown still has Settings (DL-7 verification)

- [x] **F1.** Click the avatar in the header. Dropdown opens. _(2026-05-15: `HeaderProfileMenu.tsx` L54–61 — `<DropdownMenu>` with `<DropdownMenuTrigger asChild><Button … aria-label="Open profile menu"><User /></Button></DropdownMenuTrigger>` mounted at `Header.tsx` L160.)_
- [x] **F2.** Dropdown contains a `Settings` entry with the `Settings` lucide icon, linking to `/dashboard/settings`. _(2026-05-15: `HeaderProfileMenu.tsx` L73–78 `<DropdownMenuItem asChild><a href="/dashboard/settings" …><Settings className="h-4 w-4" />Settings</a></DropdownMenuItem>`; `Settings` icon imported from `lucide-react` at L4.)_
- [x] **F3.** Click `Settings` → lands on `/dashboard/settings` showing two cards: **Practice Setup** and **Integrations**. (Untouched by this batch; just confirms removing the SETUP sidebar section didn't orphan any access path.) _(2026-05-15: `frontend/app/dashboard/settings/page.tsx` and `frontend/app/dashboard/settings/integrations/page.tsx` both exist (not edited by sr-03). Browser navigation to confirm `200` is still recommended but the access path is intact.)_

### G — Cross-cutting (the gate from the batch plan, ticked verbatim)

Every line below mirrors the batch plan's [Cross-cutting acceptance gate](../plan-sidebar-restructure-batch.md#cross-cutting-acceptance-gate-whole-batch). Tick each as you confirm:

- [x] Sidebar renders 6 items in 3 sections (covered: C1). _(2026-05-15 code check.)_
- [x] Collapse toggle at top, icon-only, `h-14`, right-aligned expanded, centered collapsed (covered: C4–C8, E3). _(2026-05-15 code check; live pixel check still ideal.)_
- [ ] All sidebar `href`s resolve (covered: B1–B5). _(B3 confirmed 308; B1/B2/B4/B5 return `307 /login` to unauthenticated `curl` — need browser/auth to flip to 200.)_
- [x] Old route 308-redirects (covered: B3). _(Confirmed 2026-05-14.)_
- [ ] Insights page renders the placeholder (covered: B1 + visit `/dashboard/insights` in browser; visible `<h1>Insights</h1>` + "Coming soon"). _(2026-05-15 code check: `frontend/app/dashboard/insights/page.tsx` renders `<h1 …>Insights</h1>` + `<p>Coming soon.</p>` after auth gate. Live browser render still needed for full sign-off.)_
- [ ] Badge counts still update on the active route (covered: D1–D4). _(Wiring + poll cadence verified; live counts depend on DB state.)_
- [ ] `opdLive` badge still works (covered: D1). _(Wiring verified; live count needs queue rows.)_
- [ ] `dashboardEventsUnread` badge still works (covered: D3). _(Wiring verified; live count needs unread events.)_
- [ ] `pnpm tsc --noEmit` clean (covered: A1). _(Out-of-batch cockpit typings broken; see Failure log.)_
- [ ] `pnpm lint` clean (covered: A2). _(Out-of-batch ESLint plugin/rule mis-wiring on OPD files; see Failure log.)_
- [x] `rg "matchReviewsUnconfirmed" frontend/` zero results (covered: A3). _(PASS 2026-05-14.)_
- [x] `rg "Match reviews" frontend/` zero outside docs/snapshots (covered: A4). _(PASS.)_
- [x] `rg "/dashboard/service-reviews" frontend/` zero outside config/docs (covered: A5). _(PASS.)_
- [x] Mobile drawer unchanged (covered: E1–E5). _(2026-05-15 code check across `Sidebar.tsx` + `Header.tsx` + `DashboardShell.tsx`; behavior identical to pre-batch shape.)_
- [x] Profile dropdown still has Settings (covered: F1–F3). _(2026-05-15: `HeaderProfileMenu.tsx` L73–78 unchanged.)_
- [ ] No regression on existing tests (covered: A7). _(Branch has 51 failing tests, none in Sidebar / nav / dashboard-counts files (no `Sidebar*` test exists — see A7 note). Cannot be a sr-03 regression but suite is still red.)_

### Tests / verification

- [ ] All A / B / C / D / E / F / G checkboxes above are ticked.
- [ ] If any cell failed: the failing cell is logged in this task file as a "Failure log" entry below, the appropriate sr-NN task is reopened, and sr-04 is **paused** (not failed) until the fix lands.

---

## Failure log (append entries here as cells fail)

> Format: `[YYYY-MM-DD] Cell <ID>: <one-line description>. Reopened: sr-NN. Resolved: <YYYY-MM-DD or pending>.`

- `[2026-05-14] Cell A1: tsc fails in cockpit-batch files only — CockpitHeader.tsx:852 (string[] cast to ColumnSlots needs 3 elements) and ConsultationCockpit.tsx:1363 (CockpitLayout literal missing required middleCollapseSide property). Both files are owned by the cockpit-customization / cockpit-shell-redesign batches, not sr-03. Diagnosis: ColumnSlots / CockpitLayout type was tightened elsewhere without updating these two callsites. Resolved: pending — hand to cockpit batch.`
- `[2026-05-14] Cell A2: next lint exits 1 — frontend/.eslintrc.json only extends "next/core-web-vitals" which does NOT include the @typescript-eslint plugin. OpdQueueSessionToolbar.tsx:531 and OpdTodayClient.tsx:99 both contain inline "// eslint-disable-next-line @typescript-eslint/no-explicit-any" directives that reference a rule the runtime has never heard of, so ESLint errors out. Fix is either (a) remove the inline disable directives and use a different escape hatch, or (b) install + add "plugin:@typescript-eslint/recommended" to .eslintrc.json. Hook-deps warnings on ConsultationLauncher.tsx (handleStartVideo/Text/Voice useCallback deps) are pre-existing — only the no-explicit-any errors actually fail the run. Resolved: pending — hand to OPD batch owner.`
- `[2026-05-14] Cell A7: vitest 51 failures / 485 passed — failures live in cockpit specs (ReadyCard, RxSectionNav, layout snapshots). 2026-05-15 re-grep confirms ZERO test files reference Sidebar / navSections / Booking review / Insights / bookingReviewsUnconfirmed / matchReviewsUnconfirmed / /dashboard/insights / /dashboard/booking-review — there is no sidebar-scoped test in the suite. Provably not a sr-03 regression. Resolved: out-of-scope-for-sr-04; cockpit batch to repair.`
- `[2026-05-14] Cells B1–B6: Initial curl skipped — no Next on :3000. Resolved for B3 via dev up (see B3 PASS).`
- `[2026-05-14] Cells B1,B2,B4,B5,B6: Unauthenticated curl -I returns 307→/login; full checklist expects 200 when logged in (browser confirmation). Resolved: pending.`
- `[2026-05-15] Cells C1–C9 / D5 / E1–E5 / F1–F3: cleared via static code verification (Sidebar.tsx + Header.tsx + HeaderProfileMenu.tsx + DashboardShell.tsx + KpiStrip.tsx + useDashboardCounts.ts + insights/page.tsx). Browser eyeball still nice-to-have for C5 baseline-alignment + Insights live render. Resolved: code-PASS; browser-confirmation pending.`
- `[2026-05-15] Cell A7 (re-verification): zero __tests__ files reference Sidebar / navSections / Booking review / Insights / bookingReviewsUnconfirmed / matchReviewsUnconfirmed / /dashboard/insights / /dashboard/booking-review. The 51 vitest failures are all in cockpit / RxSectionNav / ReadyCard scope — provably not attributable to sr-03. Owner is the cockpit batch. Resolved: out-of-scope-for-sr-04.`

---

## Out of scope

- **Writing fixes for failing cells** — those land in sr-01 / sr-02 / sr-03 as appropriate. sr-04 only verifies.
- **Browser-matrix testing across Firefox / Safari / mobile Safari** — Chrome is the dev target; cross-browser audit is part of release-hardening, not this batch.
- **Performance regression check** (e.g., did the badge poll get slower) — none of this batch's changes touch polling cadence; the diff is structurally too small to regress perf.
- **Updating notification email templates that link to `/dashboard/service-reviews`** — the redirect handles them; an explicit email-template edit is a separate small task.
- **Confirming the `BarChart3` icon-clash with Settings landing's Practice Setup card** — captured in `docs/Work/capture/inbox.md` as a follow-up; not blocking.

---

## Files expected to touch

**None.** sr-04 is verification-only. The agent's outputs are: the populated checkboxes above (in this file or in a PR comment), and a green/red status update on the cross-cutting gate.

If a fix is required, that fix lands in the corresponding sr-NN task's branch — NOT in sr-04.

---

## Notes / open decisions

1. **Why is QA its own wave step instead of folded into sr-03?** Per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 3](../../../../../EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves), build vs QA is a different reviewer mindset. Folding QA into sr-03 means the same chat that wrote the code marks its own homework — which historically misses 1–2 cells per batch. A separate task forces a fresh look.
2. **Why Composer 2 instead of Sonnet?** This task generates no code. The agent's job is to run shell commands, parse output, and report. Composer is faster and cheaper for that workload; Sonnet's judgment is wasted here.
3. **What if the dev server isn't running?** Start it: `pnpm --filter frontend dev` (from repo root). The terminal `4.txt` already has a dev server going per the workspace state — restart it after sr-02's `next.config.mjs` change so the redirect is picked up.
4. **What if D1–D4 can't be verified because there are no live OPD entries / pending bookings / unread events to count?** Skip the *count display* check but still confirm the badge SLOT is wired correctly: temporarily edit `useDashboardCounts.ts` to return a stub `{ opdLive: 5, bookingReviewsUnconfirmed: 3, dashboardEventsUnread: 7 }`, reload, confirm pills appear next to OPD / Booking review / Alerts with those numbers, then revert the stub. (Don't commit the stub.)
5. **What if a snapshot test for `Sidebar.tsx` fails on A7?** Regenerate (`pnpm --filter frontend test -- --updateSnapshot`), then **visually inspect the diff in the snapshot file**. Expected changes: item count drops from N to 6, labels rename, top div appears, bottom div disappears. Unexpected changes: random `className` reorderings, prop order shuffles → those mean Sonnet did extra work in sr-03; reopen sr-03 to revert the unintended drift before re-snapping.

---

## References

- **Affected files:** none — this task is verification-only.
- **Reads (for verification):** every file touched by sr-01, sr-02, sr-03; plus the dev server at `http://localhost:3000`.
- **Source decision:** [Product plans/plan-sidebar-restructure.md](../../../../Product%20plans/plan-sidebar-restructure.md) — the entire plan is the success criterion.
- **Wave gate:** [`EXECUTION-ORDER-sidebar-restructure.md` § Wave 2 gate](./EXECUTION-ORDER-sidebar-restructure.md#wave-2-gate-after-sr-04) — every box ticked here is a box ticked there.
- **Previous task:** [`task-sr-03-sidebar-restructure-and-collapse-toggle.md`](./task-sr-03-sidebar-restructure-and-collapse-toggle.md) — the task whose output sr-04 verifies.
- **Next task:** none. Batch ends.

---

**Owner:** TBD
**Created:** 2026-05-14
**Status:** Paused — sidebar-batch surface PASS by code review (C/D5/E/F + A3–A6 + B3); only out-of-batch cockpit fallout (A1/A2/A7) and auth-required browser cells (B1/B2/B4/B5/B6, D1–D4, C5 pixel-level, Insights live render) remain. **Plain-English browser checklist for the doctor / QA operator is the very next section below.**

---

## What the human still needs to do (plain English)

Everything below requires a logged-in browser. The dev server is already running at `http://localhost:3000`. Log in as a doctor and walk through this list, then tick the boxes inline. Should take **~5 minutes total**.

- [ ] **1. Look at the left sidebar on `/dashboard`.** You should see exactly **3 sections, 6 items**:
  - **TODAY**: Today, OPD
  - **CARE**: Patients, Insights
  - **INBOX**: Booking review, Alerts
  - You should **NOT** see: `Appointments`, `Settings`, `Integrations`, `Match reviews`, `Notifications`, or `OPD queue` anywhere in the sidebar.
  - The **Insights** row should have a tiny **bar-chart icon** to its left.
- [ ] **2. Click the small arrow icon at the top-left of the sidebar** (just below the header bar, right-aligned). The sidebar should shrink to a narrow icon-only rail. Click again, it should expand back. The little arrow icon flips direction each click. Hover the button — a tooltip should say *"Collapse sidebar"* (when expanded) or *"Expand sidebar"* (when collapsed). Reload the page in collapsed state — it should stay collapsed.
- [ ] **3. Click your avatar (top-right of the header).** A dropdown opens. It should contain a **Settings** entry with a gear icon. Click it — you should land on `/dashboard/settings` showing two cards: **Practice Setup** and **Integrations**.
- [ ] **4. Open DevTools, switch to a phone-size view (~600px wide).** The sidebar should disappear and a **hamburger button (☰)** should appear in the top-left of the header. Tap it — the sidebar should slide in from the left as a drawer with all 6 items as full-width labels (NOT shrunk to icons). Tap any item — it should navigate AND close the drawer. Tap outside the drawer (on the dark backdrop) — drawer should close. There should be **no collapse-arrow button** at the top of this mobile drawer.
- [ ] **5. Resize back to a normal desktop window** and visit **`http://localhost:3000/dashboard/insights`** in the address bar. You should see a heading **"Insights"** and a subtitle **"Coming soon."** — nothing else.
- [ ] **6. Visit `http://localhost:3000/dashboard/service-reviews`** in the address bar. The URL should auto-rewrite to **`/dashboard/booking-review`** and show the booking-review page.
- [ ] **7. (Optional — only meaningful if you have real data)** While on `/dashboard`, look at the KPI tiles. The tile labelled **"Pending DMs"** should show the exact same number as the small pill next to **Booking review** in the sidebar.

If any of these don't behave as described, write a one-line note here:

> _Observed:_ ___________________________________________

Things you do **NOT** need to do (the agent verified by reading the source or via the redirect test):

- The `308 redirect` from `/dashboard/service-reviews` — already PASSES at the HTTP level.
- The three ripgrep checks for leftover `Match reviews` / old field name / old route — already PASSES.
- All the wiring for Sidebar structure, collapse toggle, mobile drawer, profile-dropdown Settings link — already PASSES by code review.

Things the agent **cannot** close (separate batch owns the fix; sr-04 should NOT block on these):

- `tsc` / `lint` / vitest fail on the branch, but the failures are in **cockpit** files (`CockpitHeader.tsx`, `ConsultationCockpit.tsx`, `OpdTodayClient.tsx`, `OpdQueueSessionToolbar.tsx`, ReadyCard / RxSectionNav specs) — NOT in any file this batch touched. The Failure log below has the precise root cause for each so the cockpit-batch owner can fix them in one sitting.
