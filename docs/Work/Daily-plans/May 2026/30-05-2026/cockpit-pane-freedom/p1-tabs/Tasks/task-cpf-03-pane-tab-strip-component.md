# cpf-03 · `<PaneTabStrip>` component — tab UI for multi-pane leaves

> **Wave 2, lane α** of [cockpit-pane-freedom](../plan-p1-cockpit-pane-freedom-batch.md). The new user-visible primitive — a compact tab strip rendered above the body of any leaf with > 1 pane.

| **Size** | S | **Model** | Auto | **Wave** | 2 | **Depends on** | cpf-02 (ops; for `setActiveTab` handler) | **Blocks** | cpf-04 |

---

## Why this task

When a leaf becomes a multi-pane tabs container (after a doctor moves panes via cpf-05 or future-Phase-2 DnD), the user needs to:
1. See which panes live in the container — one tab button per pane.
2. Know which is active — visual distinction (background + border).
3. Switch active tab with a click.
4. Identify each pane at a glance — title + icon from `PaneDefinition`.
5. Handle overflow when > 4 tabs — horizontal scroll + chevron + popover (DL-3.2).
6. Right-click a tab to open the existing pane context menu for that pane.

`<PaneTabStrip>` is a thin presentational primitive — pure props in, click events out. No layout knowledge, no shell integration. cpf-04 mounts it inside `<PaneSubtreeGroup>`'s leaf branch.

---

## What to do

### 1. New `frontend/components/patient-profile/PaneTabStrip.tsx`

```tsx
"use client";

import { useCallback } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PaneDefinition } from "@/lib/patient-profile/types";
import { cn } from "@/lib/utils";

const VISIBLE_TAB_LIMIT = 4;

export interface PaneTabStripProps {
  /** Stable id of the tabs container (the leaf node's id in the tree). */
  groupId: string;
  /** Ordered pane ids living in this container. */
  paneIds: string[];
  /** Which paneId is the active tab. Invariant: paneIds.includes(activeTabId). */
  activeTabId: string;
  /** Lookup map for pane metadata (title + icon). */
  paneById: Record<string, PaneDefinition>;
  /** Fired when the user clicks a tab. */
  onActivateTab: (paneId: string) => void;
  /**
   * Optional context-menu opener for an individual tab. When provided, right-click
   * on a tab button invokes this (the shell's existing `PaneContextMenu` is the
   * intended consumer).
   */
  onContextMenuTab?: (paneId: string, event: React.MouseEvent) => void;
  /** Optional className for the outer strip. */
  className?: string;
}

export default function PaneTabStrip({
  groupId,
  paneIds,
  activeTabId,
  paneById,
  onActivateTab,
  onContextMenuTab,
  className,
}: PaneTabStripProps): JSX.Element {
  const visiblePaneIds = paneIds.slice(0, VISIBLE_TAB_LIMIT);
  const overflowPaneIds = paneIds.slice(VISIBLE_TAB_LIMIT);

  const handleContextMenu = useCallback(
    (paneId: string) => (e: React.MouseEvent) => {
      if (!onContextMenuTab) return;
      e.preventDefault();
      onContextMenuTab(paneId, e);
    },
    [onContextMenuTab],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="tablist"
        aria-label="Pane tabs"
        data-pane-tabs-group-id={groupId}
        className={cn(
          "flex h-9 shrink-0 items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1",
          className,
        )}
      >
        {visiblePaneIds.map((paneId) => {
          const pane = paneById[paneId];
          if (!pane) return null;
          const Icon = pane.icon;
          const isActive = paneId === activeTabId;
          return (
            <Tooltip key={paneId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`pane-body-${paneId}`}
                  data-pane-tab-id={paneId}
                  onClick={() => onActivateTab(paneId)}
                  onContextMenu={handleContextMenu(paneId)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/60"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  <span className="truncate max-w-[140px]">{pane.title}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {pane.title}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {overflowPaneIds.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${overflowPaneIds.length} more tabs`}
                className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                <span>+{overflowPaneIds.length}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowPaneIds.map((paneId) => {
                const pane = paneById[paneId];
                if (!pane) return null;
                const Icon = pane.icon;
                const isActive = paneId === activeTabId;
                return (
                  <DropdownMenuItem
                    key={paneId}
                    onSelect={() => onActivateTab(paneId)}
                    onContextMenu={handleContextMenu(paneId)}
                    className={isActive ? "font-medium" : undefined}
                  >
                    {Icon ? <Icon className="mr-2 h-4 w-4" aria-hidden /> : null}
                    {pane.title}
                    {isActive ? <ChevronRight className="ml-auto h-3 w-3 opacity-60" aria-hidden /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
```

### 2. Tests in `frontend/components/patient-profile/__tests__/PaneTabStrip.test.tsx`

```ts
describe("<PaneTabStrip>", () => {
  it("renders one tab button per paneId");
  it("marks the activeTabId button as aria-selected=true and others as false");
  it("calls onActivateTab with the paneId when a tab is clicked");
  it("renders only VISIBLE_TAB_LIMIT (=4) tabs visibly; rest into overflow menu");
  it("overflow menu's chevron shows '+N' where N is overflow count");
  it("overflow menu items invoke onActivateTab on select");
  it("does not render when paneIds is empty (component invariant)");
  it("fires onContextMenuTab(paneId, event) on right-click of a tab button");
  it("renders pane icon when paneById[id].icon is present");
  it("does not render an icon when paneById[id].icon is undefined");
  it("truncates long titles with max-w-[140px]");
});
```

### 3. Verify

```powershell
cd frontend
npx tsc --noEmit
pnpm test components/patient-profile/__tests__/PaneTabStrip.test.tsx
```

---

## Acceptance gate

- [x] Component file exported as default from `frontend/components/patient-profile/PaneTabStrip.tsx`.
- [x] Accepts `groupId`, `paneIds`, `activeTabId`, `paneById`, `onActivateTab`, `onContextMenuTab?`, `className?`.
- [x] Active tab visually distinct (background + border + shadow).
- [x] Tabs render with pane title + icon (from `PaneDefinition`).
- [x] Overflow menu engages above `VISIBLE_TAB_LIMIT = 4` tabs.
- [x] Right-click a tab → `onContextMenuTab(paneId, event)` fires; `preventDefault()` called.
- [x] Tooltips on tabs show full pane title (for truncated long titles).
- [x] ARIA: `role="tablist"` on container, `role="tab"` on buttons, `aria-selected` per tab, `aria-controls` linking to body id.
- [x] All tests green.
- [x] `cd frontend; npx tsc --noEmit` clean.

---

## Anti-goals

- ❌ Don't read or mutate the layout tree directly — pure presentational primitive.
- ❌ Don't fire telemetry — the consuming page wires telemetry (cpf-05 / cpf-06).
- ❌ Don't add DnD reordering of tabs within a strip — Phase 2.
- ❌ Don't add a "Close tab" button — Phase 3 (handled via "Hide pane" in context menu, which already removes the pane from the tabs container via cpf-02's logic).
- ❌ Don't render anything when `paneIds.length === 0` — invariant violation; let it throw / return null silently.
- ❌ Don't render anything when `paneIds.length === 1` — caller (cpf-04) is responsible for the single-pane skip; if invoked with 1 pane, render the single tab anyway (defensive).

---

## Risks (executor-facing)

- **`VISIBLE_TAB_LIMIT` vs MAX_PANES_PER_TABS** — the cosmetic overflow cap is 4 (DL-3.2 / V2-Q5 pattern), the mutation cap is 6 (cpf-02). When `paneIds.length` is between 4 and 6, the strip overflows but the mutation layer still accepts more adds up to 6.
- **Long titles** — `<SubjectivePane>` title is "Subjective" but `<InvestigationsPane>` is "Investigations" which truncates at ~10 chars in narrow containers. `max-w-[140px]` + tooltip is the v1 answer; iterate in Phase 3 polish.
- **Icon source** — `pane.icon` is `LucideIcon | undefined`. Some panes don't set an icon (template fixtures, walk-in fallback). Defensive: render label only when icon is undefined.
- **Right-click integration** — onContextMenuTab calls `event.preventDefault()` to suppress the browser context menu. cpf-05 wires this to open the shell's `<PaneContextMenu>` programmatically at the click position.
