"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  resolveDepthToneRail,
  type SoapTabFamily,
  useSoapTabFamily,
} from "@/components/cockpit/rx/sections/section-chrome";

/**
 * Recursive sticky-header stacking.
 *
 * Every collapsible whose header pins (`position: sticky`) contributes its live
 * height to a running total that is passed *down the React tree* (not through the
 * CSS cascade, which can't accumulate without self-referential `var()` cycles and
 * mis-orders on mount). A child pins directly beneath the stack of its pinned
 * ancestors, so headers stack correctly at any depth — up to {@link DEFAULT_CAP}
 * levels, after which deeper headers scroll normally to keep the pinned chrome from
 * eating the viewport.
 *
 * The accumulated offset is also published as the `--sticky-stack` CSS variable on
 * each pinned container's body, so non-pinning descendants (finding cards, allergy
 * cards, …) can set their `scroll-margin-top` to land just under the live stack.
 */
export interface StickyStackValue {
  /** Total px height of the pinned headers stacked above this subtree. */
  offset: number;
  /** How many headers are already pinned above this subtree. */
  level: number;
  /** Maximum headers allowed to pin in a single stack. */
  cap: number;
}

/** Three stacked headers max (e.g. section → card → nested card). */
export const DEFAULT_CAP = 3;

export const DEFAULT_STICKY_STACK: StickyStackValue = {
  offset: 0,
  level: 0,
  cap: DEFAULT_CAP,
};

const StickyStackContext = createContext<StickyStackValue>(DEFAULT_STICKY_STACK);

/** Current sticky-stack context (offset/level/cap for the calling subtree). */
export function useStickyStack(): StickyStackValue {
  return useContext(StickyStackContext);
}

export interface StickyHeaderResult {
  /** Ref for the header element whose height feeds the stack below it. */
  headerRef: (node: HTMLElement | null) => void;
  /** True when this header should pin (enabled AND under the cap). */
  pinned: boolean;
  /** Inline style for the header: sticky + top + descending z-index when pinned. */
  headerStyle: CSSProperties | undefined;
  /** Context to provide to this container's children (offset advanced by this header). */
  childValue: StickyStackValue;
  /**
   * Inline style for the container's body: publishes the advanced offset as
   * `--sticky-stack` so non-pinning descendants can offset their scroll-margin.
   */
  bodyStyle: CSSProperties;
  /**
   * Depth-aware shadow class when pinned — stronger at deeper stack levels so the
   * boundary reads over tinted bodies (vh-04). Intensity only; no offset change.
   */
  pinnedShadowClass: string | undefined;
}

/**
 * Pinned-header shadow ramps with stack depth (vh-04). Shallow pins stay light;
 * deeper pins pick up more elevation so the chrome reads over tinted bodies.
 */
export function resolveStickyPinShadowClass(stackLevel: number): string {
  if (stackLevel <= 1) return "shadow-sm";
  if (stackLevel === 2) return "shadow-md";
  return "shadow-lg";
}

/**
 * Register a pinning header with the sticky stack. Attach {@link StickyHeaderResult.headerRef}
 * to the header, spread {@link StickyHeaderResult.headerStyle} onto it, wrap the body's
 * children in {@link StickyStackProvider} with {@link StickyHeaderResult.childValue}, and
 * spread {@link StickyHeaderResult.bodyStyle} onto the body element.
 *
 * @param enabled Whether this container wants to pin at all (e.g. `stickyHeader`).
 */
export function useStickyHeader(enabled: boolean): StickyHeaderResult {
  const parent = useContext(StickyStackContext);
  const [headerHeight, setHeaderHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const headerRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) {
      setHeaderHeight(0);
      return;
    }
    setHeaderHeight(node.offsetHeight);
    const observer = new ResizeObserver(() => setHeaderHeight(node.offsetHeight));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const pinned = enabled && parent.level < parent.cap;

  const childValue: StickyStackValue = pinned
    ? {
        offset: parent.offset + headerHeight,
        level: parent.level + 1,
        cap: parent.cap,
      }
    : parent;

  const headerStyle: CSSProperties | undefined = pinned
    ? {
        position: "sticky",
        top: parent.offset,
        // Outer (shallower) headers paint above inner ones as they stack.
        zIndex: 40 - childValue.level,
      }
    : undefined;

  const bodyStyle: CSSProperties = {
    "--sticky-stack": `${childValue.offset}px`,
  } as CSSProperties;

  const pinnedShadowClass = pinned
    ? resolveStickyPinShadowClass(childValue.level)
    : undefined;

  return { headerRef, pinned, headerStyle, childValue, bodyStyle, pinnedShadowClass };
}

/** Provides an advanced sticky-stack context to a container's descendants. */
export function StickyStackProvider({
  value,
  children,
}: {
  value: StickyStackValue;
  children: ReactNode;
}) {
  return <StickyStackContext.Provider value={value}>{children}</StickyStackContext.Provider>;
}

/**
 * Opt-in nesting depth for tonal alternation (visual hierarchy).
 *
 * Distinct from the sticky-stack `level` (which only counts *pinned* headers): this
 * tracks the collapsible-card nesting depth so descendants can alternate their
 * surface tone (recessed well ↔ raised card) and know how deep they sit. It is
 * `null` by default so the treatment is off everywhere; a root opts in (e.g. via
 * `CollapsibleContainer`'s `depthTone`) which seeds depth `0` and every nested
 * collapsible advances it by one. Kept separate from {@link StickyStackValue} so
 * enabling tone never perturbs the pin math.
 */
const CollapsibleDepthContext = createContext<number | null>(null);

/** Current collapsible nesting depth, or `null` when tonal alternation is off. */
export function useCollapsibleDepth(): number | null {
  return useContext(CollapsibleDepthContext);
}

/** Provides the nesting depth for a collapsible's descendants. */
export function CollapsibleDepthProvider({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) {
  return (
    <CollapsibleDepthContext.Provider value={depth}>{children}</CollapsibleDepthContext.Provider>
  );
}

/**
 * Canonical depth-tone ladder — the only surface values downstream tasks should use
 * when opting into {@link useCollapsibleDepth} / {@link useDepthToneSurface}.
 *
 * Even depths → recessed well; odd depths → raised card; nested cards (depth ≥ 1)
 * carry a family-keyed left rail (accent for subjective, primary for objective).
 */
export const DEPTH_TONE_RECESSED_SURFACE = "bg-muted/30";
export const DEPTH_TONE_RAISED_SURFACE = "bg-card";
/** Default depth rail (objective / no family context). Prefer {@link resolveDepthToneRail}. */
export const DEPTH_TONE_RAIL = resolveDepthToneRail(null);

export interface DepthToneSurface {
  /** Whether tonal alternation is active for this node. */
  active: boolean;
  /** Current nesting depth, or `null` when inactive. */
  depth: number | null;
  /** True when this depth sits in a recessed "well" (even depth). */
  recessed: boolean;
  /** Background class for the current depth; `undefined` when inactive. */
  surface: string | undefined;
  /** Left accent rail when active and depth ≥ {@link railMinDepth}; else `undefined`. */
  rail: string | undefined;
}

/**
 * Pure resolver for depth-based surface tone. No React context — safe for bespoke
 * cards (exam finding cards, etc.) that read depth manually.
 */
export function resolveDepthToneSurface(
  depth: number | null,
  options?: { railMinDepth?: number; tabFamily?: SoapTabFamily | null },
): DepthToneSurface {
  const railMinDepth = options?.railMinDepth ?? 1;
  const railClass = resolveDepthToneRail(options?.tabFamily ?? null);
  if (depth === null) {
    return { active: false, depth: null, recessed: false, surface: undefined, rail: undefined };
  }
  const recessed = depth % 2 === 0;
  return {
    active: true,
    depth,
    recessed,
    surface: recessed ? DEPTH_TONE_RECESSED_SURFACE : DEPTH_TONE_RAISED_SURFACE,
    rail: depth >= railMinDepth ? railClass : undefined,
  };
}

export interface UseDepthToneSurfaceOptions {
  /**
   * Explicit depth override. When omitted, reads {@link useCollapsibleDepth} and
   * optionally seeds depth `0` when {@link seedWhenNull} is true.
   */
  depth?: number | null;
  /** When context depth is `null`, seed depth `0` (root opt-in via `depthTone`). */
  seedWhenNull?: boolean;
  /** Minimum depth before the left rail appears (default `1`; entry cards use `0`). */
  railMinDepth?: number;
  /** Override SOAP tab family for rail hue; defaults to {@link useSoapTabFamily} context. */
  tabFamily?: SoapTabFamily | null;
}

/**
 * Hook wrapper around {@link resolveDepthToneSurface} for collapsible surfaces.
 * Bespoke cards can call this with no options (inherit depth) or pass an explicit
 * depth when they manage their own nesting.
 */
export function useDepthToneSurface(options?: UseDepthToneSurfaceOptions): DepthToneSurface {
  const inheritedDepth = useCollapsibleDepth();
  const contextFamily = useSoapTabFamily();
  const depth =
    options?.depth !== undefined
      ? options.depth
      : inheritedDepth ?? (options?.seedWhenNull ? 0 : null);
  const tabFamily = options?.tabFamily !== undefined ? options.tabFamily : contextFamily;
  return resolveDepthToneSurface(depth, {
    railMinDepth: options?.railMinDepth,
    tabFamily,
  });
}
