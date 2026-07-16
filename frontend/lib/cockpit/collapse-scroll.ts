/**
 * Shared scroll behavior for every collapsible in the SOAP form (sections, exam
 * system cards, finding cards). Open and close are different gestures, but each is
 * a *single coherent* motion — the scroll and the body fold are kept on matching
 * clocks/curves so the content never moves non-monotonically ("clutter").
 *
 * - On OPEN  → *travel*: smoothly glide the opened header to the top of the scroll
 *   area, under any stacked sticky chrome (offset via CSS `scroll-margin-top`).
 *   Concurrent with the expand; fixed-duration ease-out, re-measured each frame so
 *   it lands correctly even as the body grows or a sibling accordion card collapses.
 * - On CLOSE → *settle*: the page often must scroll up by nearly a viewport (closing
 *   the top section reveals the content above it, since there isn't a screenful below
 *   to hold it). That settle is **locked to the body fold** — same duration and the
 *   same ease-out ramp (see `COLLAPSE_CLOSE_MS`, also consumed by `Collapse`) — so
 *   the header, the content above, and the content below all move as one motion. The
 *   resting target is estimated up front so the reveal eases across the whole
 *   duration instead of stalling then rushing at the end.
 *
 * Honors `prefers-reduced-motion` (instant jump, no tween).
 */

/**
 * Open body-fold + travel duration. The fold (`Collapse`) and the open travel
 * scroll share this exact value, and both use ease-out, so the expand and the
 * glide-to-top read as one decelerating motion (mirrors the close lock) instead of
 * a quick fold racing a separate scroll.
 */
export const COLLAPSE_OPEN_MS = 260;

/**
 * Close body-fold + page-settle duration. The fold (`Collapse`) and the settle
 * scroll share this exact value so they read as one motion; longer than open so a
 * near-viewport reveal lands gently instead of snapping.
 */
export const COLLAPSE_CLOSE_MS = 300;

/** Open travel duration — locked to the open fold so they settle together. */
export const COLLAPSE_SCROLL_MS = COLLAPSE_OPEN_MS;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Nearest scroll-pane ancestor, detected by overflow *style* alone.
 *
 * Intentionally does NOT require `scrollHeight > clientHeight`: a section's own
 * expansion is often what creates the overflow, so gating on current overflow
 * made the open-scroll fire only when the pane already happened to overflow —
 * the source of the "sometimes it scrolls, sometimes it doesn't" inconsistency.
 */
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

let activeRaf: number | null = null;

function stickyMarginTop(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
}

/** Live distance (px) from the element's top to its sticky line — 0 means parked. */
function offsetToStickyLine(parent: HTMLElement, el: HTMLElement, marginTop: number): number {
  return el.getBoundingClientRect().top - parent.getBoundingClientRect().top - marginTop;
}

interface GlideOptions {
  durationMs: number;
  easing: (t: number) => number;
  /**
   * `live` (open): re-measure the target every frame — keeps the landing exact while
   * the body grows or a sibling accordion card collapses above it.
   * `final` (close): estimate the resting scroll position once (body is still full at
   * call time) and ease toward it across the whole duration, so the reveal settles
   * evenly instead of stalling then rushing when the live clamp finally engages.
   */
  mode: "live" | "final";
  /**
   * Only ever pull the header *up to* the sticky line (clamp the offset at 0), never
   * push a fully-visible header upward. Used on close.
   */
  pullUpOnly: boolean;
}

/**
 * Predict the resting `scrollTop` after the fold, while the body is still at full
 * height. Reads the height about to be shed (the open Collapse region inside `el`)
 * to derive the post-collapse scroll height, hence the final max + park target.
 */
function estimateFinalTarget(
  parent: HTMLElement,
  el: HTMLElement,
  marginTop: number,
  pullUpOnly: boolean,
): number {
  const offset = offsetToStickyLine(parent, el, marginTop);
  const park = parent.scrollTop + (pullUpOnly ? Math.min(0, offset) : offset);
  const body = el.querySelector<HTMLElement>('[aria-hidden="false"]');
  const shedding = body ? body.offsetHeight : 0;
  const finalMax = Math.max(0, parent.scrollHeight - shedding - parent.clientHeight);
  return Math.max(0, Math.min(park, finalMax));
}

/**
 * Tween `parent.scrollTop` so `el` settles at the sticky line. `live` mode
 * re-measures the target every frame; `final` mode eases toward a precomputed
 * resting target. Both re-clamp to the live max each frame so they never fight the
 * browser's own scroll bounds while the document is resizing.
 */
function glide(parent: HTMLElement, el: HTMLElement, options: GlideOptions): void {
  if (activeRaf != null) {
    cancelAnimationFrame(activeRaf);
    activeRaf = null;
  }

  const marginTop = stickyMarginTop(el);
  const startScroll = parent.scrollTop;
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, parent.scrollHeight - parent.clientHeight));

  const finalTarget =
    options.mode === "final"
      ? estimateFinalTarget(parent, el, marginTop, options.pullUpOnly)
      : 0;
  const target = (): number => {
    if (options.mode === "final") return finalTarget;
    const offset = offsetToStickyLine(parent, el, marginTop);
    return parent.scrollTop + (options.pullUpOnly ? Math.min(0, offset) : offset);
  };

  if (prefersReducedMotion()) {
    activeRaf = requestAnimationFrame(() => {
      parent.scrollTop = clamp(target());
      activeRaf = null;
    });
    return;
  }

  const startedAt = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / options.durationMs);
    parent.scrollTop = clamp(startScroll + (target() - startScroll) * options.easing(t));
    if (t < 1) {
      activeRaf = requestAnimationFrame(step);
    } else {
      activeRaf = null;
    }
  };
  activeRaf = requestAnimationFrame(step);
}

/**
 * True when `el`'s top already sits at (or above) its sticky line within the scroll
 * parent — i.e. re-opening it in place needs no scroll. A small tolerance absorbs
 * sub-pixel rounding. When there's no scroll parent we can't tell, so return false
 * (let the caller fall back to a native scroll).
 *
 * Guards the re-open glide: without this, expanding a section whose header is
 * already parked still animates the viewport, and a *nested* sticky header can
 * jump while its collapsing ancestor temporarily clips it (overflow-hidden during
 * the height animation) and then re-anchors — the "moves up an inch, snaps back" bug.
 */
export function isCollapsibleAtStickyLine(el: HTMLElement | null, tolerancePx = 2): boolean {
  if (!el) return false;
  const parent = getScrollParent(el);
  if (!parent) return false;
  const marginTop = stickyMarginTop(el);
  return offsetToStickyLine(parent, el, marginTop) <= tolerancePx;
}

/**
 * OPEN: bring an element to the top of its scroll area, accounting for stacked
 * sticky headers (via `scroll-margin-top`). Smooth ease-out; native fallback when
 * there's no scroll container (page-level / test env).
 */
export function scrollCollapsibleToTop(el: HTMLElement | null): void {
  if (!el) return;
  const parent = getScrollParent(el);
  if (!parent) {
    el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return;
  }
  glide(parent, el, {
    durationMs: COLLAPSE_SCROLL_MS,
    easing: easeOut,
    mode: "live",
    pullUpOnly: false,
  });
}

/**
 * Sum the heights of the sticky headers of every collapsible ancestor between
 * `el` and its scroll parent. Each `CollapsibleContainer` renders `[header, body]`
 * where the header is `position: sticky` when the section pins; only headers that
 * precede the branch containing `el` (i.e. actually stack above it) are counted.
 *
 * This makes the open/close landing correct at *any* nesting depth without relying
 * on hand-tuned `scroll-margin` CSS vars (which get clobbered when two sticky
 * containers nest — e.g. Patient background → Past medical history).
 */
export function measureStackedStickyOffset(el: HTMLElement): number {
  const parent = getScrollParent(el);
  let total = 0;
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== parent) {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      // Headers precede the body branch — stop once we reach the branch holding `el`.
      if (child.contains(el)) break;
      if (getComputedStyle(child).position === "sticky") {
        total += child.offsetHeight;
      }
    }
    node = node.parentElement;
  }
  return total;
}

/**
 * OPEN / CLOSE glide that lands `el` just beneath the *live* stack of sticky headers
 * above it. The measured offset is written to inline `scroll-margin-top` so the
 * shared glide parks it exactly under the stacked chrome, then it glides smoothly —
 * the standard "bring this to the top" motion, correct at any nesting depth.
 */
export function scrollCollapsibleToStickyTop(el: HTMLElement | null): void {
  if (!el) return;
  el.style.scrollMarginTop = `${measureStackedStickyOffset(el)}px`;
  scrollCollapsibleToTop(el);
}

/** Like {@link scrollCollapsibleToStickyTop} but accepts a precomputed margin (e.g. sibling complaint cards). */
export function scrollCollapsibleToStickyTopWithMargin(
  el: HTMLElement | null,
  scrollMarginTopPx: number,
): void {
  if (!el) return;
  el.style.scrollMarginTop = `${scrollMarginTopPx}px`;
  scrollCollapsibleToTop(el);
}

/**
 * CLOSE: settle the header to the sticky line as one motion locked to the body fold
 * — same duration (`COLLAPSE_CLOSE_MS`) and ease-out ramp — easing toward the
 * precomputed resting position so the reveal of content above glides in calmly.
 * Pulls up only. No-ops cleanly when there's no scroll container.
 */
export function reAnchorCollapsibleOnClose(el: HTMLElement | null): void {
  if (!el) return;
  const parent = getScrollParent(el);
  if (!parent) return;
  glide(parent, el, {
    durationMs: COLLAPSE_CLOSE_MS,
    easing: easeOut,
    mode: "final",
    pullUpOnly: true,
  });
}
