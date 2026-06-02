# Task ui-B2: `Sidebar.tsx` 4-section regrouping + lucide icons

## 06 May 2026 — Batch [UI system redesign](../plan-ui-system-redesign-batch.md) — Sub-batch B (Shell) — **M item, ~4h**

---

## Task overview

Today [`frontend/components/layout/Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx) is a flat list of 6 links: `Dashboard`, `Appointments`, `Match reviews`, `OPD today`, `Patients`, `Settings`. No icons, no grouping, mixed casing, no hierarchy. "Settings" sits at the same visual weight as "Appointments" — telling the doctor the configuration tree is as important as their daily work.

This task regroups the nav into 4 sections matching how a doctor's day is structured, adds a lucide icon per item, and renames two items so casing is consistent. **Routes are preserved unchanged** — this is purely a labeling / grouping / iconography change. Existing deep links continue to work.

The 4 sections (per U2.6 in the source plan):

| Section header | Items | Routes (unchanged) |
|---|---|---|
| **TODAY** | Today, OPD queue | `/dashboard`, `/dashboard/opd-today` |
| **CARE** | Appointments, Patients | `/dashboard/appointments`, `/dashboard/patients` |
| **INBOX** | Match reviews, Notifications | `/dashboard/service-reviews`, `/dashboard#notifications` |
| **SETUP** | Settings, Integrations | `/dashboard/settings`, `/dashboard/settings/integrations` |

Renames: `Dashboard` → **Today**; `OPD today` → **OPD queue**. Match reviews stays.

**Estimated time:** ~4h.

**Status:** Drafted.

**Hard deps:** A2 close (uses `Button` ghost variant for collapse, `Tooltip` for icon-only tooltips). A4 (lucide icons).

**Soft deps:** none.

**Source:** [U2.6](../../../../Product%20plans/plan-ui-system-redesign.md#u26--sidebar-4-section-regrouping) + [U2.7](../../../../Product%20plans/plan-ui-system-redesign.md#u27--sidebar-lucide-icons-per-item) in plan-ui-system-redesign.md.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why this tier:** Bounded; one file to edit; pattern is straightforward (data-driven nav config + render loop). Sonnet handles this in a single turn.

**New chat?** Yes — fresh chat. Do not carry B1 context (different concerns).

**Pre-load (paste at start):**

- This task file (full).
- Current contents of [`Sidebar.tsx`](../../../../../frontend/components/layout/Sidebar.tsx).
- One sentence: "We use lucide-react via named imports."

**Estimated turns:** 1–2.

**Escalate to Opus if:** never for this task.

**Composer-OK sub-steps:** post-ship status sync only.

---

## Acceptance criteria

### Data-driven nav config

- [ ] **Replace the flat `topLevelNav` array** with a sectioned config:
  ```ts
  import { LayoutDashboard, Users, CalendarDays, User, Inbox, Bell, Settings as SettingsIcon, Plug } from "lucide-react";

  const navSections = [
    {
      heading: "TODAY",
      items: [
        { href: "/dashboard", label: "Today", icon: LayoutDashboard, exact: true },
        { href: "/dashboard/opd-today", label: "OPD queue", icon: Users },
      ],
    },
    {
      heading: "CARE",
      items: [
        { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
        { href: "/dashboard/patients", label: "Patients", icon: User },
      ],
    },
    {
      heading: "INBOX",
      items: [
        { href: "/dashboard/service-reviews", label: "Match reviews", icon: Inbox },
        { href: "/dashboard#notifications", label: "Notifications", icon: Bell },
      ],
    },
    {
      heading: "SETUP",
      items: [
        { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
        { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },
      ],
    },
  ] as const;
  ```
- [ ] **Section headings rendered** as small uppercase muted labels: `text-xs font-medium uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1`.
- [ ] **Item rendering** preserves the existing active-state logic (active when `pathname === href` for `exact: true` items, else `pathname.startsWith(href)`).
- [ ] Icons render at `h-4 w-4` aligned with the label, with `mr-2` spacing.

### Active-state visual

- [ ] Active item: `bg-primary/10 text-primary font-medium` (or `bg-accent text-accent-foreground` per shadcn convention — pick one and stay consistent with B3's collapsed state).
- [ ] Hover (non-active): `bg-muted/50 text-foreground`.
- [ ] Focus visible: shadcn ring pattern.

### Routes preserved

- [ ] `/dashboard` still routes to today / dashboard home (no actual route change).
- [ ] `/dashboard/opd-today` still routes correctly (just the label changed).
- [ ] `/dashboard/service-reviews` (no path change) still resolves.
- [ ] `/dashboard/settings/integrations` route — verify it exists; if it doesn't, the item should be hidden in V1 (don't ship a 404 link). Existing settings tree under [`frontend/app/dashboard/settings/integrations/page.tsx`](../../../../../frontend/app/dashboard/settings/integrations/page.tsx) suggests it does — confirm.
- [ ] `/dashboard#notifications` — anchor scrolls to the notifications feed on the dashboard home (already wired by [`DashboardEventsBell`](../../../../../frontend/components/dashboard/DashboardEventsBell.tsx) and the `id="notifications"` on the dashboard page). Smoke-test the anchor scroll.

### Mobile + accessibility

- [ ] Mobile drawer behavior preserved — overlay click closes; drawer slides; focus trap inside.
- [ ] `aria-label="Main navigation"` preserved on `<nav>`.
- [ ] Section headings are `<div>` elements with `role="presentation"` (they're visual hints, not headings users tab to). The `<nav>` already provides the landmark.
- [ ] Items remain `<Link>` elements with `aria-current="page"` on active.

### General

- [ ] All raw color classes replaced with tokens.
- [ ] Type-check + lint clean.
- [ ] Mobile breakpoints OK at 375 / 768 / 1024 / 1440.

---

## Out of scope

- **Badge counts / live polling.** That's [B3](./task-ui-B3-sidebar-counts-and-collapse.md). B2 sets up the data shape (`navSections` items can have an optional `badge?: number` field for B3 to fill); no fetching here.
- **Desktop collapse-to-icons.** Also B3.
- **Per-section permissions** (e.g., hiding INBOX for OPD-only doctors). Out of V1.
- **Adding new top-level routes.** Routes are unchanged; only labels and grouping are touched.

---

## Files expected to touch

**Frontend:**
- `frontend/components/layout/Sidebar.tsx` — **edit** (~150 LOC, full restructure of nav config and render loop).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **`/dashboard/settings/integrations` as a separate top-level item.** Reasoning: integrations (Instagram, etc.) drive the wedge; doctors should be able to reach it in one click without going through Settings. Alternative: keep it nested inside Settings only — verify with user before shipping.
2. **Section heading typography.** Uppercase + muted is standard (Linear, Notion, GitHub). If brand register prefers Title Case, swap; both are defensible.
3. **Icon stroke uniformity.** Lucide default stroke 2 across all 8 icons; don't deviate.
4. **`Notifications` item routes to `#notifications` anchor on the same page.** It's a hash link, not a new route. The bell already scrolls there on click — this is the redundant nav-only path. Acceptable redundancy; keeps the inbox section coherent.
5. **Renaming `Dashboard` → `Today`.** Aligns with the cockpit framing (C sub-batch). If the user finds this confusing, add `Today (Dashboard)` for one release and drop the parenthetical later — but the source plan says rename, so rename.

---

## References

- **Batch plan:** [plan-ui-system-redesign-batch.md § Sub-batch B](../plan-ui-system-redesign-batch.md#sub-batch-b--shell-4-items-15-days)
- **Source items:** [U2.6](../../../../Product%20plans/plan-ui-system-redesign.md#u26--sidebar-4-section-regrouping), [U2.7](../../../../Product%20plans/plan-ui-system-redesign.md#u27--sidebar-lucide-icons-per-item)
- **Hard deps:** [task-ui-A2-shadcn-bootstrap.md](./task-ui-A2-shadcn-bootstrap.md), [task-ui-A4-lucide-icons.md](./task-ui-A4-lucide-icons.md)
- **Sibling tasks:** B1 (header), B3 (counts + collapse), B4 (Cmd-K)
- **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Drafted; blocked on A2 + A4 close.
