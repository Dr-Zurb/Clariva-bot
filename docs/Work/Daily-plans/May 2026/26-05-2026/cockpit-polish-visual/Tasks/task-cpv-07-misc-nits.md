# cpv-07 · Misc visual nits

> **Status:** ✅ Done (2026-05-26). Search collapses below xl; pane icons centralized; problem list wraps.

> **Wave 3 / Lane β** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issues #20, #21, #22 — search collapse, pane icon mismatch, problem-list overflow.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~80 LOC delta + ~50 LOC tests) |
| **Model** | Auto |
| **Wave** | 3 |
| **Depends on** | cpv-05 (waits on column-header sync — same file region possible) |
| **Blocks** | cpv-08 (close-out) |

---

## Goal

Three small unrelated changes bundled:

A. **Header search collapse** — search input collapses to an icon + popover below 1280px (DL-8).
B. **Pane-icon single source of truth** — `frontend/lib/patient-profile/pane-icons.ts` (new) maps `paneId → LucideIcon`. Templates.tsx imports from this single source (DL-9).
C. **Problem-list text wrapping** — `break-words` + `min-w-0` so long problem strings wrap within pane bounds (DL-10).

---

## What to do

### A. Header search collapse (DL-8)

#### A1. Locate the header search

Likely in `frontend/components/layout/Header.tsx` or `frontend/components/patient-profile/PatientProfileHeader.tsx`. Search:

```powershell
rg "Search\b" frontend/components/layout/ frontend/components/patient-profile/ -l
```

#### A2. Add the responsive collapse

Two implementation paths:

**Path A — CSS media query (simplest):**

```tsx
<div className="hidden xl:block">
  {/* full search input — xl breakpoint = 1280px */}
  <Input
    type="search"
    placeholder="Search…"
    className="w-64"
  />
</div>
<div className="xl:hidden">
  {/* collapsed icon + popover */}
  <Popover>
    <PopoverTrigger asChild>
      <button aria-label="Search">
        <Search className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80">
      <Input type="search" placeholder="Search…" autoFocus />
    </PopoverContent>
  </Popover>
</div>
```

**Path B — single component with container query:**

If the codebase already uses container queries (cmi-01 / cmr-06 introduced them), use one here too. CSS media query is fine if simpler.

Pick Path A; it's the standard pattern in the codebase.

#### A3. Tests for the search collapse

Resize-window testing is impractical in JSDOM; instead, test that both branches exist (the `hidden xl:block` and `xl:hidden` divs):

```tsx
it("renders both expanded and collapsed search markup", () => {
  render(<Header />);
  const search = screen.getAllByPlaceholderText("Search…");
  expect(search.length).toBeGreaterThanOrEqual(1); // at least one renders in JSDOM
});
```

### B. Pane-icon single source of truth (DL-9)

#### B1. Create `frontend/lib/patient-profile/pane-icons.ts`

```ts
import {
  Heart,
  Clock,
  Beaker,
  Pill,
  MessageSquare,
  Activity,
  Video,
  Phone,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for pane icons (cpv-07 / DL-9, 2026-05-26).
 * Templates.tsx + any future pane-rendering surface imports from here.
 */
export const PANE_ICONS: Record<string, LucideIcon> = {
  snapshot: Heart,
  history: Clock,
  body: Video,
  "investigations-orders": Beaker,
  plan: Pill,
  subjective: MessageSquare,
  objective: Activity,
  // Future extensions land here.
};

export function getPaneIcon(paneId: string): LucideIcon | undefined {
  return PANE_ICONS[paneId];
}

// Variant icons for body pane:
export const BODY_VARIANT_ICONS: Record<"video" | "voice" | "text" | "review", LucideIcon> = {
  video: Video,
  voice: Phone,
  text: MessageSquare,
  review: Video,
};
```

#### B2. Refactor `templates.tsx` to import from the new module

Replace the inline imports + the inline `variantIcon` function (lines 167-178) with:

```tsx
import { PANE_ICONS, BODY_VARIANT_ICONS, getPaneIcon } from "./pane-icons";

// Replace `variantIcon(variant)` calls with `BODY_VARIANT_ICONS[variant]`.
// Replace inline `icon: Heart`, `icon: Beaker`, etc. with `icon: PANE_ICONS.snapshot`, etc.
```

Remove the duplicate imports from `lucide-react` in `templates.tsx` (they live in `pane-icons.ts` now).

#### B3. Verify consistency

`<InvestigationsPane>` may also import Lucide icons directly for its empty-state (cnc-03 uses `Beaker`). That's fine — it's a leaf using the same Beaker icon. The SoT module is for the **pane definition** (the icon in the column header / tab), not internal pane visuals.

### C. Problem-list text wrapping (DL-10)

#### C1. Locate the problem list

Likely inside `<HistoryPane>` body or a dedicated `<ProblemList>` component. Search:

```powershell
rg "problem" frontend/components/patient-profile/ -i -l
```

#### C2. Add wrapping classes

For each problem row:

```tsx
<li className="break-words min-w-0 text-sm">
  {problem.label}
</li>
```

For the containing list:

```tsx
<ul className="space-y-1 overflow-x-hidden">
  {problems.map((p) => (
    <li key={p.id} className="break-words min-w-0 text-sm">
      {p.label}
    </li>
  ))}
</ul>
```

`overflow-x-hidden` prevents long unbroken strings (URLs, lab values) from blowing out the column.

#### C3. Tests

```tsx
describe("Problem list wrapping (cpv-07 C)", () => {
  it("applies break-words to each row", () => {
    const longProblem = "Pyelonephritis with bilateral hydronephrosis pending urology follow-up scheduled for next week.";
    renderProblemList({ problems: [{ id: "1", label: longProblem }] });
    const li = screen.getByText(longProblem);
    expect(li.className).toMatch(/break-words/);
  });

  it("ul has overflow-x-hidden", () => {
    renderProblemList({ problems: [] });
    const list = screen.getByRole("list");
    expect(list.className).toMatch(/overflow-x-hidden/);
  });
});
```

### Verify (all three)

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] **A:** Header search collapses below 1280px (xl breakpoint); expanded above.
- [x] **A:** Collapsed search renders a Popover with the input + autoFocus.
- [x] **B:** `frontend/lib/patient-profile/pane-icons.ts` exists as the SoT.
- [x] **B:** Templates.tsx imports from the new module; no duplicate Lucide imports.
- [x] **B:** All pane definitions use icons from `PANE_ICONS`.
- [x] **C:** Problem list rows have `break-words min-w-0`.
- [x] **C:** Problem list `<ul>` has `overflow-x-hidden`.
- [x] Tests cover each change.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't redesign the search bar's behavior — collapse only.
- ❌ Don't truncate long problem strings — wrap, don't cut.
- ❌ Don't introduce pane-icon variant by modality at the SoT level (`BODY_VARIANT_ICONS` is the one exception; nothing else needs variants).
- ❌ Don't refactor the History pane's other sub-cards' overflow behavior — scope is problem list only.

---

## Notes

- Three nits bundled because each is < 30 LOC; separate tasks would be over-bureaucracy.
- The search collapse path uses `xl` (1280px) as the Tailwind breakpoint — already wired in the codebase, no new screen size needed.
- The pane-icon SoT is small but unlocks future evolution: e.g., per-doctor icon customization, theme variants. Capture-inbox if those come up.
- For C, "wrap, don't truncate" is the deliberate choice — doctors need to read full problem strings; truncation hides important context.
