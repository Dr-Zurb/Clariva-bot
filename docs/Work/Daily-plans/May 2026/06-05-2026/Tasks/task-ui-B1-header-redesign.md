# Task ui-B1: `Header.tsx` redesign — brand mark, practice pill, Start consult, profile dropdown, bell

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch B (Shell) — **M item, ~5h**

---

## Task overview

Today, [`frontend/components/layout/Header.tsx`](../../../../../frontend/components/layout/Header.tsx) is a 50-line plain bar: an unstyled hamburger button, the literal text "Logged in as `<email>`", the existing [`DashboardEventsBell`](../../../../../frontend/components/dashboard/DashboardEventsBell.tsx), and a [`LogoutButton`](../../../../../frontend/components/LogoutButton.tsx). Zero brand presence; zero workflow CTA. A doctor logging in screenshots this and there's nothing telling them they're inside Clariva, who they are, or what to do next.

This task replaces the header with a workflow-aware top bar:
- **Left:** brand logomark + wordmark + thin practice-context pill (`Dr. {name} · {specialty}`).
- **Center / spacer:** a search trigger that opens the Cmd-K palette (B4) — visually present even before B4 lands; clicking it shows a "Coming soon" toast until B4 is shipped, OR (preferred) is hidden with a feature flag until B4 lands. Pick one strategy and document it.
- **Right:** **Start consult** primary CTA, [`DashboardEventsBell`](../../../../../frontend/components/dashboard/DashboardEventsBell.tsx) (preserved, restyled), profile `DropdownMenu` wrapping logout + theme toggle placeholder + settings shortcut.

This is the most visible single change in the batch — every dashboard page lights up the moment B1 ships.

**Estimated time:** ~5h.

**Status:** Drafted.

**Hard deps:** A2 close (`Button`, `DropdownMenu`, `Tooltip` primitives must exist). A4 (lucide for menu / search / bell icons).

**Soft deps:** A5 (logo asset; if `logomark.svg` not yet shipped, use a temporary text-only wordmark and TODO-link to A5).

**Source:** [U2.1](../../../../Product%20plans/plan-ui-system-redesign.md#u21--header-brand-mark--wordmark) + [U2.2](../../../../Product%20plans/plan-ui-system-redesign.md#u22--header-practice-context-pill) + [U2.3](../../../../Product%20plans/plan-ui-system-redesign.md#u23--header-persistent-start-consult-cta) + [U2.4](../../../../Product%20plans/plan-ui-system-redesign.md#u24--header-profile-dropdown) + [U2.5](../../../../Product%20plans/plan-ui-system-redesign.md#u25--header-keep-notifications-bell).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded UI work; uses primitives shipped in A2; clear spec; one main file to edit. Sonnet handles this comfortably.

**New chat?** Yes — fresh chat for this task. **Do NOT carry over A2 chat context** — A2 is done; B1 is a new topic.

**Pre-load (paste at start):**

- This task file (full).
- Current contents of [`Header.tsx`](../../../../../frontend/components/layout/Header.tsx), [`DashboardShell.tsx`](../../../../../frontend/components/layout/DashboardShell.tsx), [`LogoutButton.tsx`](../../../../../frontend/components/LogoutButton.tsx).
- The list of A2-generated primitives (paste `ls frontend/components/ui` output).
- One sentence about the practice-context source: "Doctor name + specialty come from `doctor_settings`; if not yet wired, render the email and TODO."

**Estimated turns:** 2–3.

**Escalate to Opus if:** the search trigger placement opens a layout debate (where exactly between brand and right-side actions, how it shrinks at narrow widths). One Opus turn settles it.

**Composer-OK sub-steps:** none in this task body. Status sync at close-out is Composer.

---

## Acceptance criteria

### Layout

- [ ] **Three-zone header** in [`Header.tsx`](../../../../../frontend/components/layout/Header.tsx):
  - Left zone: mobile menu toggle (md:hidden), then `<Link href="/dashboard">` wrapping logomark + wordmark, then `PracticePill` (next bullet).
  - Center zone (`hidden md:flex flex-1 justify-center`): search trigger button (opens Cmd-K when B4 lands).
  - Right zone: `Start consult` button, `DashboardEventsBell`, profile `DropdownMenu`.
- [ ] Sticky to top: `sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60` (standard shadcn pattern).
- [ ] Min height `h-14`. Inner padding `px-4`.

### Brand mark

- [ ] Logomark from `frontend/public/brand/logomark.svg` (A5). If A5 not shipped, fallback: render the wordmark "Clariva" in `font-semibold text-foreground` only.
- [ ] Logomark size: `h-7 w-7` for the mark itself; wordmark `text-base font-semibold`.
- [ ] Click → `/dashboard`.

### Practice-context pill

- [ ] **`<PracticePill>`** mini-component (can live inside `Header.tsx` or its own file `frontend/components/layout/PracticePill.tsx`):
  - Reads doctor name + specialty from `doctor_settings` (use the existing fetch path; if none, `email`-only fallback with a TODO).
  - Renders as a small rounded pill: `inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground`.
  - Click → `/dashboard/settings/practice-setup/practice-info`.
  - Hidden on `<sm` (collapses behind the menu drawer).
- [ ] **No PHI in the pill.** Doctor name + specialty are not patient-data; safe.

### Search trigger (Cmd-K placeholder)

- [ ] **A search trigger button** in the center zone:
  ```
  ┌─────────────────────────────────────┐
  │ 🔍  Search…                  ⌘K     │
  └─────────────────────────────────────┘
  ```
  - Width: `w-72 lg:w-96` (cap so it doesn't dominate).
  - Visual: outlined input with a search icon and a kbd hint.
  - Click / focus / press `Cmd+K` (or `Ctrl+K`): opens the Cmd-K palette IF B4 has shipped; otherwise, click is a no-op (button disabled with a `Tooltip` that says "Coming soon") OR the trigger is hidden behind a feature flag.
- [ ] **Pick one strategy** in the implementation log: `disabled-with-tooltip` OR `feature-flag-hidden-until-B4`. Default recommendation: `feature-flag-hidden-until-B4` so the header doesn't show non-functional UI to early users.

### Start consult CTA

- [ ] **`<Button variant="default">Start consult</Button>`** with a `lucide:Plus` or `lucide:Video` icon prefix.
- [ ] Click opens [`ConsultationLauncher`](../../../../../frontend/components/consultation/ConsultationLauncher.tsx) — the modality picker that already exists. If `ConsultationLauncher` requires a patient context, the launcher itself should handle the "no patient yet" state (or the click routes to `/dashboard/appointments` with a "select a patient" hint).
- [ ] Hidden on `<sm`; collapses behind the menu drawer.

### Notifications bell

- [ ] **`<DashboardEventsBell>`** preserved in placement (right zone, between Start consult and profile dropdown).
- [ ] Restyle to fit the new design: `Button variant="ghost" size="icon"` wrapper; lucide `Bell` icon; the bell's existing unread-dot is preserved.

### Profile dropdown

- [ ] **`<HeaderProfileMenu>`** new file `frontend/components/layout/HeaderProfileMenu.tsx` (~80 LOC):
  - Trigger: `Button variant="ghost" size="icon"` with a circular avatar (lucide `User` for V1; later: doctor's photo).
  - Content: `DropdownMenu` with:
    1. Header section: doctor email (small, muted).
    2. Item: `Settings` → `/dashboard/settings`.
    3. Item: `Theme: light / dim` toggle (placeholder; logs a console warning + dispatches a no-op for V1; U5.4 will wire it).
    4. Separator.
    5. Item: `Log out` → wraps existing [`LogoutButton`](../../../../../frontend/components/LogoutButton.tsx) action.
- [ ] **Existing `<LogoutButton>` is no longer rendered standalone** in the header — its action is inlined into the dropdown. Keep `LogoutButton.tsx` exported for any other consumer.

### Mobile drawer behavior

- [ ] Mobile menu toggle button preserved exactly as today; passes through to `DashboardShell` `mobileMenuOpen` state. No regression on `<md` layouts.

### General

- [ ] All raw color classes replaced with semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`). No `bg-white` / `text-gray-*` / `border-gray-*` left in `Header.tsx`.
- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Mobile breakpoints verified at 375 / 768 / 1024 / 1440.
- [ ] No regression in any existing dashboard page (smoke: visit /dashboard, /dashboard/appointments, /dashboard/patients).

---

## Out of scope

- **Multi-doctor account switcher** in the practice pill. U6.2 question — out of V1 unless promoted.
- **Cmd-K palette implementation.** That's [B4](./task-ui-B4-cmd-k-global-search.md). B1 ships only the trigger button (or feature-flag-hides it).
- **Theme toggle wiring.** Placeholder only; U5.4 (dim mode) does the real wiring.
- **Doctor photo avatar.** Lucide `User` icon for V1; richer avatar later.
- **Fly-out search results in the header itself.** Search results live in the Cmd-K dialog, not inline.

---

## Files expected to touch

**Frontend:**
- `frontend/components/layout/Header.tsx` — **edit** (~150 LOC, full restructure).
- `frontend/components/layout/HeaderProfileMenu.tsx` — **new** (~80 LOC).
- `frontend/components/layout/PracticePill.tsx` — **new** (~50 LOC; or inline in `Header.tsx`).
- `frontend/components/LogoutButton.tsx` — **no edit** (preserved; consumed by dropdown).
- `frontend/app/dashboard/layout.tsx` — **possible edit** if the header needs a doctor-settings fetch hoisted to the layout (read `doctor_settings` server-side and pass to `<DashboardShell>`).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **`backdrop-filter` support.** Most modern browsers support it; Tailwind's `supports-[backdrop-filter]` arbitrary variant gracefully degrades. Keep both `bg-background/95` (fallback) and the supports-blur version.
2. **Sticky `z-40` value.** Mobile drawer overlay is `z-40` in the existing [`Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx); header sits at the same level. If the sidebar drawer needs to overlay the header on mobile, bump to `z-50` for the drawer specifically (already in code).
3. **Search trigger feature-flag default.** Hide until B4 lands. Prevents user confusion about a non-functional UI element. When B4 ships, flip the flag (or remove it entirely).
4. **Practice pill on `<md`.** Hidden to keep the mobile header uncluttered. Users on mobile rely less on visual identity confirmation; the menu drawer carries it instead.
5. **Why no global new-appointment CTA in the header.** Add-appointment lives in the Appointments list page (already there). Headers should have ONE primary CTA — Start consult is the workflow-relevant one.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch B](../plan-ui-system-redesign-batch.md#sub-batch-b--shell-4-items-15-days)
- **Source items:** U2.1 / U2.2 / U2.3 / U2.4 / U2.5 in [plan-ui-system-redesign.md](../../../../Product%20plans/plan-ui-system-redesign.md)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md), [task-ui-A4-lucide-icons.md](./task-ui-A4-lucide-icons.md)
- **Soft dep:** [task-ui-A5-brand-assets-and-doc.md](./task-ui-A5-brand-assets-and-doc.md)
- **Sibling tasks (same sub-batch):** B2 (sidebar regrouping), B3 (sidebar counts/collapse), B4 (Cmd-K)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on A2 close.
