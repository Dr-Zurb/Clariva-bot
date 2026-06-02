"use client";

/**
 * `<CascadeHandle>` — drop-in replacement for `<ResizableHandle>` that
 * implements the patient-profile shell's *cascading* resize behaviour.
 *
 * Behaviour summary (full spec lives in `cascade-resize.ts`):
 *
 *   [  A  |  B  |  C  ]
 *
 *   • Dragging the A↔B handle to the right grows A and shrinks B; once
 *     B reaches its minimum size, *the drag continues* by shrinking C.
 *   • Symmetric for left drags / for the B↔C handle.
 *   • Holding the cascade target's minimum is honoured strictly — no
 *     pane is ever rendered below the floor it declared via `minSizePx` /
 *     `minSizePct` in its `PaneDefinition`.
 *
 * Why a custom handle (and not the library's `<Separator>`):
 *
 *   `react-resizable-panels` `<Separator>` only knows about its two
 *   adjacent panels. The cascade we want is a *layout-wide* operation, so
 *   we bypass the library's pointer handlers, read the live layout via
 *   `groupRef.current.getLayout()`, run `applyDragWithCascade()` on every
 *   pointermove, and commit via the imperative `groupRef.current.setLayout()`
 *   — the same channel the shell's structural-rebalance effect uses
 *   (see the long comment near `sizeSnapshot` in `Shell.tsx`).
 *
 *   Because we go through `setLayout()`, the library still fires
 *   `onResize` for each changed panel, which routes through `Shell`'s
 *   existing `handleResize` → `setPaneSize` persistence pipeline.
 *   Persistence is therefore *automatic* and doesn't need a parallel
 *   commit path.
 *
 * Accessibility:
 *
 *   • `role="separator"` + `aria-orientation="vertical"` matches the
 *     library's built-in separator and exposes the handle to ATs.
 *   • `tabIndex=0` makes it keyboard-focusable.
 *   • Arrow Left / Arrow Right move the handle by 1% (5% with Shift).
 *   • `aria-label` includes the two pane titles so screen-readers can
 *     announce which separator is focused.
 *
 * Pointer plumbing:
 *
 *   • `setPointerCapture` on pointerdown ensures pointermove events keep
 *     flowing to this handle even when the user's pointer leaves the
 *     handle's bounding box during a fast drag.
 *   • `onLostPointerCapture` covers tab-switches / app-switches that
 *     would otherwise leave us stuck in a "still dragging" state.
 *   • `touch-action: none` (`className="touch-none"`) prevents the
 *     browser from interpreting horizontal pointer movement as scroll.
 *   • While a drag is active we set a `data-cascade-dragging` attribute
 *     on `<html>` so a single global rule (in the consumer's stylesheet
 *     or this component's CSS-in-JS) can apply `cursor: col-resize` and
 *     `user-select: none` document-wide.
 */

import React, { useCallback, useRef } from "react";
import { GripVertical } from "lucide-react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import { applyDragWithCascade } from "@/lib/patient-profile/cascade-resize";
import { cn } from "@/lib/utils";

export interface CascadeHandleProps {
  /** Imperative ref to the parent `<ResizablePanelGroup>`. */
  groupRef: React.RefObject<GroupImperativeHandle | null>;
  /**
   * Ref to an element whose `clientWidth` represents the panel-group's
   * available width in pixels. The shell's `containerRef` is a good fit;
   * it's measured by a `ResizeObserver` to stay current. We re-measure
   * at pointerdown so window resizes between drags are picked up.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Visible pane ids in left-to-right order. Used to map the cascade
   * algorithm's index-based output back to pane ids for `setLayout()`,
   * and to look up `minByPaneId` for each cascade pane.
   */
  visiblePaneOrder: string[];
  /**
   * Per-pane minimum sizes in viewport percent (already combines the
   * per-pane `minSizePct` and `minSizePx` floors — same value that the
   * shell passes to `<ResizablePanel minSize=…>` so the library and the
   * cascade algorithm agree on the floor).
   */
  minByPaneId: Record<string, number>;
  /** Handle index `i` — separates `visiblePaneOrder[i]` and `visiblePaneOrder[i+1]`. */
  handleIndex: number;
  /** Pane title to the left of the handle (used in aria-label). */
  prevPaneTitle: string;
  /** Pane title to the right of the handle (used in aria-label). */
  nextPaneTitle: string;
  /** Render the small grip icon in the centre of the handle. */
  withHandle?: boolean;
  /** Optional className for the handle root. */
  className?: string;
  /**
   * Orientation of the parent panel group. Drives the axis we read
   * pointer deltas from (`clientX` vs `clientY`), the container
   * dimension we divide by (width vs height) for px → pct conversion,
   * the cursor + ARIA orientation, and the arrow-key bindings.
   *
   * Defaults to `"horizontal"` so existing call sites that omit the
   * prop keep their previous behaviour unchanged. cv2-01 introduces
   * vertical handles for inner-vertical groups in nested PaneDefinition
   * trees (see `Shell.tsx` `<PaneSubtreeGroup>`).
   */
  orientation?: "horizontal" | "vertical";
}

/**
 * Width (in px) of the keyboard nudge step in *percent* terms. Tuned to
 * match the library's default `keyboardResizeBy=10` for chunky moves
 * but feels small enough to make fine adjustments practical.
 */
const KEY_STEP_PCT = 1;
const KEY_STEP_SHIFT_PCT = 5;

/** Identifier we attach to `<html>` while a cascade drag is active. */
const DRAGGING_ATTR = "data-cascade-dragging";

function setDocumentDragging(
  active: boolean,
  orientation: "horizontal" | "vertical",
) {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.setAttribute(DRAGGING_ATTR, "true");
    // Global cursor + selection lock during drag. Mirrors what the library
    // does internally for its built-in separator. We inject inline styles
    // on body so we don't have to add a global CSS rule.
    document.body.style.userSelect = "none";
    document.body.style.cursor =
      orientation === "horizontal" ? "col-resize" : "row-resize";
  } else {
    document.documentElement.removeAttribute(DRAGGING_ATTR);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }
}

export function CascadeHandle({
  groupRef,
  containerRef,
  visiblePaneOrder,
  minByPaneId,
  handleIndex,
  prevPaneTitle,
  nextPaneTitle,
  withHandle,
  className,
  orientation = "horizontal",
}: CascadeHandleProps) {
  /**
   * Drag session state, captured at pointerdown and cleared at
   * pointerup/pointercancel/lostpointercapture. We keep this in a ref —
   * not state — so pointermove updates never trigger a re-render of
   * this component (drag perf path stays cheap).
   *
   * `startClientPos` holds clientX (horizontal) or clientY (vertical);
   * `containerSizePx` holds container width or height accordingly. The
   * orientation choice is made at pointerdown time and cached in the
   * session so an in-flight drag is unaffected by an orientation prop
   * change mid-drag (which would only happen from a structural
   * rebalance — the panel-group library would also bail).
   */
  const sessionRef = useRef<{
    startClientPos: number;
    /** Snapshot of `groupRef.current.getLayout()` at pointerdown. */
    startLayout: number[];
    /** Pane ids in the order matching `startLayout`. */
    paneOrder: string[];
    /** Mins for each pane in `paneOrder`, in viewport-pct units. */
    mins: number[];
    /** Container size in px (width or height) at pointerdown. */
    containerSizePx: number;
    /** Pointer id captured for this session. */
    pointerId: number;
    /** Orientation captured at pointerdown. */
    orientation: "horizontal" | "vertical";
  } | null>(null);

  const beginSession = useCallback(
    (clientPos: number, pointerId: number, target: HTMLElement): boolean => {
      const group = groupRef.current;
      const container = containerRef.current;
      if (!group || !container) return false;

      let liveLayout: Record<string, number>;
      try {
        liveLayout = group.getLayout();
      } catch {
        return false;
      }

      // Translate the library's `{ [paneId]: pct }` into an index-ordered
      // array aligned with `visiblePaneOrder` (the cascade algorithm's
      // contract). If any pane is missing from the library's snapshot we
      // bail — the library and our state are temporarily out of sync
      // (typically the tail end of a structural rebalance), and the user
      // can retry the drag once it settles.
      const startLayout: number[] = [];
      const mins: number[] = [];
      for (const id of visiblePaneOrder) {
        const pct = liveLayout[id];
        if (typeof pct !== "number" || !Number.isFinite(pct)) return false;
        startLayout.push(pct);
        mins.push(minByPaneId[id] ?? 0);
      }

      const rect = container.getBoundingClientRect();
      const containerSizePx =
        orientation === "horizontal" ? rect.width : rect.height;
      if (!Number.isFinite(containerSizePx) || containerSizePx <= 0) {
        return false;
      }

      sessionRef.current = {
        startClientPos: clientPos,
        startLayout,
        paneOrder: [...visiblePaneOrder],
        mins,
        containerSizePx,
        pointerId,
        orientation,
      };

      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Some test environments (jsdom) don't implement pointer capture;
        // silently ignore — we still get pointermove on the same element.
      }
      setDocumentDragging(true, orientation);
      return true;
    },
    [groupRef, containerRef, visiblePaneOrder, minByPaneId, orientation],
  );

  const applyDelta = useCallback((deltaPct: number) => {
    const s = sessionRef.current;
    const group = groupRef.current;
    if (!s || !group) return;

    const result = applyDragWithCascade({
      layout: s.startLayout,
      mins: s.mins,
      handleIndex,
      deltaPct,
    });

    const layoutObj: Record<string, number> = {};
    for (let i = 0; i < s.paneOrder.length; i++) {
      layoutObj[s.paneOrder[i]] = result.layout[i];
    }
    try {
      group.setLayout(layoutObj);
    } catch {
      // Library can throw transiently during structural reconciliation
      // (panel unmount/remount window). The next pointermove will retry.
    }
  }, [groupRef, handleIndex]);

  const endSession = useCallback((target: HTMLElement | null) => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    if (target) {
      try {
        target.releasePointerCapture(s.pointerId);
      } catch {
        // capture was never granted (jsdom) or already released
      }
    }
    setDocumentDragging(false, s.orientation);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only the primary pointer button — secondary clicks / middle clicks
      // should pass through so e.g. middle-click-to-reset (future) works.
      if (e.button !== 0) return;
      const clientPos = orientation === "horizontal" ? e.clientX : e.clientY;
      const ok = beginSession(clientPos, e.pointerId, e.currentTarget);
      if (!ok) return;
      // Prevent text selection / focus stealing while a drag is in flight.
      e.preventDefault();
    },
    [beginSession, orientation],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = sessionRef.current;
      if (!s) return;
      const clientPos =
        s.orientation === "horizontal" ? e.clientX : e.clientY;
      const dPx = clientPos - s.startClientPos;
      const deltaPct = (dPx / s.containerSizePx) * 100;
      applyDelta(deltaPct);
    },
    [applyDelta],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endSession(e.currentTarget);
    },
    [endSession],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endSession(e.currentTarget);
    },
    [endSession],
  );

  const onLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endSession(e.currentTarget);
    },
    [endSession],
  );

  /**
   * Keyboard handler runs independently of pointer sessions — we read
   * the live layout fresh on every key press so consecutive ArrowRight
   * presses accumulate correctly (each press shifts the handle, the
   * next press reads the new baseline).
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Map the orientation to its natural axis keys: ←/→ for horizontal,
      // ↑/↓ for vertical. Shift accelerates by 5×; Home/End jump to the
      // nearest min on either side.
      const decKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const incKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      let step = 0;
      if (e.key === decKey) step = -(e.shiftKey ? KEY_STEP_SHIFT_PCT : KEY_STEP_PCT);
      else if (e.key === incKey) step = e.shiftKey ? KEY_STEP_SHIFT_PCT : KEY_STEP_PCT;
      else if (e.key === "Home") step = -100;
      else if (e.key === "End") step = 100;
      else return;
      e.preventDefault();

      const group = groupRef.current;
      if (!group) return;
      let liveLayout: Record<string, number>;
      try {
        liveLayout = group.getLayout();
      } catch {
        return;
      }
      const layout: number[] = [];
      const mins: number[] = [];
      for (const id of visiblePaneOrder) {
        const pct = liveLayout[id];
        if (typeof pct !== "number" || !Number.isFinite(pct)) return;
        layout.push(pct);
        mins.push(minByPaneId[id] ?? 0);
      }
      const result = applyDragWithCascade({
        layout,
        mins,
        handleIndex,
        deltaPct: step,
      });
      const layoutObj: Record<string, number> = {};
      for (let i = 0; i < visiblePaneOrder.length; i++) {
        layoutObj[visiblePaneOrder[i]] = result.layout[i];
      }
      try {
        group.setLayout(layoutObj);
      } catch {
        // ignore — same rationale as the pointermove path
      }
    },
    [groupRef, handleIndex, visiblePaneOrder, minByPaneId, orientation],
  );

  // ARIA convention: a separator's `aria-orientation` describes the axis
  // of the *separator itself*, not the axis of resizing. A separator
  // between two horizontally-arranged panels is a vertical line, hence
  // `aria-orientation="vertical"` for a horizontal panel group.
  const ariaOrientation =
    orientation === "horizontal" ? "vertical" : "horizontal";

  return (
    <div
      role="separator"
      aria-orientation={ariaOrientation}
      aria-label={`Resize ${prevPaneTitle} and ${nextPaneTitle}`}
      tabIndex={0}
      data-cascade-handle
      data-handle-index={handleIndex}
      data-handle-orientation={orientation}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex shrink-0 touch-none select-none items-center justify-center bg-border",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        orientation === "horizontal"
          ? "h-full w-px cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2"
          : "h-px w-full cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2",
        className,
      )}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex items-center justify-center rounded-sm border bg-border",
            orientation === "horizontal" ? "h-4 w-3" : "h-3 w-4",
          )}
        >
          <GripVertical
            className={cn(
              "h-2.5 w-2.5",
              orientation === "vertical" && "rotate-90",
            )}
          />
        </div>
      )}
    </div>
  );
}
