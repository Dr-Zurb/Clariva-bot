# Task alr-01: Alerts page shell + mount feed + theme-token the feed (frontend)

> **Filename:** `task-alr-01-page-and-feed-wire.md`
> **Links:** batch [`../plan-alerts-v1-batch.md`](../plan-alerts-v1-batch.md) · exec [`./EXECUTION-ORDER-alerts-v1.md`](./EXECUTION-ORDER-alerts-v1.md)

---

## 📋 Task Overview

Clear the header-bell dead end: replace the `Alerts` "Coming soon." stub with a real page that mounts the existing `DoctorDashboardEventFeed`, and move that feed off hardcoded light colors onto theme tokens so light + dark both render correctly. **Frontend-only, no backend.**

**Program / Batch:** alerts-v1 · Wave 1
**Estimated Time:** ~1–1.5 hours
**Status:** ⬜ Not started. **Model: Sonnet.**
**Change Type:** ✅ Rewrite placeholder page + in-place restyle of an existing component (no behavior change).

**Current State:**
- ✅ Placeholder: `frontend/app/dashboard/alerts/page.tsx` — `<h1>Alerts</h1>` + "Coming soon."; no auth shell.
- ✅ Auth-shell precedent: `frontend/app/dashboard/insights/page.tsx` — `const { token } = await requireDashboardAuth();` → mount client component.
- ✅ Feed component: `frontend/components/dashboard/DoctorDashboardEventFeed.tsx` — takes `token`, already fetches + renders + acknowledges. **Uses hardcoded `bg-white` / `text-gray-900` / `border-gray-200` / `bg-blue-50/40` / `bg-red-50` etc.**
- ✅ Bell already links to `/dashboard/alerts` (`DashboardEventsBell.tsx`).
- ❌ Page never mounts the feed; feed not theme-safe.

**Scope Guard:**
- **DO NOT** touch any backend file, route, controller, service, or migration (ALR-D2).
- **DO NOT** change `DashboardEventsBell` polling/visibility logic (ALR-D4).
- **DO NOT** add "Load more" / "Mark all read" / badge / new copy here — that's `alr-02`.
- Restyle only — keep the feed's fetch / acknowledge / unread-toggle behavior identical (ALR-D3).

---

## ✅ Task Breakdown

### 1. Page shell
- [ ] 1.1 Rewrite `frontend/app/dashboard/alerts/page.tsx` as a server component that calls `requireDashboardAuth()` and mounts `<DoctorDashboardEventFeed token={token} />` (mirror `insights/page.tsx` exactly, incl. `export const metadata = { title: "Alerts" }`).
- [ ] 1.2 Keep `frontend/app/dashboard/alerts/loading.tsx` (`PlaceholderPageSkeleton`) — verify it still reads sensibly under the auth shell; leave as-is unless it errors.
- [ ] 1.3 Wrap the feed in the same page container spacing the other dashboard pages use (heading + section), so it doesn't render edge-to-edge.

### 2. Theme-token the feed (ALR-D3)
- [ ] 2.1 In `DoctorDashboardEventFeed.tsx`, replace hardcoded surfaces with tokens: `bg-white` → `bg-card`; `text-gray-900` → `text-foreground`; `text-gray-500/600` → `text-muted-foreground`; `border-gray-100/200` → `border-border`; unread tint `bg-blue-50/40` → a subtle `bg-primary/5` (or `bg-muted/40`); the unread dot `bg-blue-500` → `bg-primary`.
- [ ] 2.2 Error surface: `bg-red-50 / text-red-800 / border-red-100` → the repo's destructive tokens (`bg-destructive/10`, `text-destructive`, `border-destructive/20`) — match how other dashboard errors render.
- [ ] 2.3 Prefer the shared `Card` primitives (`@/components/ui/card`) if it drops in cleanly (see `InboxColumn.tsx`); otherwise keep the `<section>` but token-only. Don't over-refactor.
- [ ] 2.4 Confirm no remaining hardcoded `gray|blue|red|white` color literals in the file (grep the file).

### 3. Tests
- [ ] 3.1 If the frontend test harness covers this area, add/extend a render test: feed mounts on the alerts page path with a mocked `getDashboardEvents`; empty + populated states render. *(If no harness for this dir yet, capture the test as a follow-up in `alr-03` — mirror the Task-30 deferral already in `capture/inbox.md`.)*

### 4. Verification
- [ ] 4.1 `cd frontend && npx tsc --noEmit` — clean for the touched files (repo has pre-existing unrelated noise; the alerts slice must be clean).
- [ ] 4.2 `cd frontend && npm run lint` — clean for the touched files.
- [ ] 4.3 Manual: open `/dashboard/alerts` → feed renders; toggle "Show acknowledged"; **light + dark** both correct; click the header bell → lands here.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/app/dashboard/alerts/page.tsx                       (auth shell + mount feed)
UPDATE: frontend/components/dashboard/DoctorDashboardEventFeed.tsx    (theme tokens; no behavior change)
READ:   frontend/app/dashboard/insights/page.tsx                     (auth-shell precedent)
READ:   frontend/components/dashboard/cockpit/InboxColumn.tsx        (Card + token language)
READ:   frontend/components/dashboard/DashboardEventsBell.tsx        (confirm it links here — do not edit)
DO NOT TOUCH: any backend file, route, controller, service, migration; the bell's polling logic
```

---

## 🧠 Design Constraints

- **Frontend-only** (ALR-D2). The endpoint already exists and works.
- **Restyle, don't rewrite** (ALR-D3) — the feed's behavior is correct; only its colors are wrong.
- **Mirror** `insights/page.tsx` for the auth shell — same `requireDashboardAuth` + client-mount shape.
- **No new PHI** (ALR-D7) — render exactly what the feed already shows.

---

## ✅ Acceptance Criteria

- [ ] `/dashboard/alerts` renders the live feed behind the auth guard; no "Coming soon." remains.
- [ ] The header bell → `/dashboard/alerts` lands on the working feed (dead end cleared).
- [ ] Feed uses theme tokens; **light + dark** both correct; no hardcoded color literals remain in the file.
- [ ] Feed fetch / acknowledge / unread-toggle behavior unchanged; no backend touched.
- [ ] Frontend verification gate green for the slice.

---

**Created:** 2026-07-21.
