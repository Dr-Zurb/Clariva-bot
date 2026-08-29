/**
 * PaneShowHereButton — always-on swap targets for this leaf slot
 * (p6 · CTF-D18 / D22). Contained swap glyph + one-click pane icons
 * in Consult → S → O → A → P order. Collapses to a ⇄ dropdown the
 * instant tabs crowd the cluster — collapse is synchronous + unanimated
 * so icons never paint over tab names while resizing.
 */

"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeftRight, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getPalettePaneIcon } from "@/lib/patient-profile/v3/foundation";

export interface CompanionOption {
  id: string;
  title: string;
}

export interface PaneShowHereButtonProps {
  /** Title of the pane currently filling this slot. */
  currentTitle: string;
  /** Panes that can fill this slot. */
  options: readonly CompanionOption[];
  /** Id to mark selected (active pane in this slot). */
  selectedId?: string | null;
  onSelect: (paneId: string) => void;
  className?: string;
  /**
   * Force density (tests). When omitted, geometry vs the last tab chip
   * chooses expanded vs collapsed with hysteresis.
   */
  density?: "expanded" | "collapsed";
}

/** Clinical swap order: Consult, then SOAP initials. */
export const SWAP_ICON_ORDER = [
  "body",
  "subjective",
  "objective",
  "assessment",
  "plan",
] as const;

/**
 * Air (px) that must remain between tab chips and the swap cluster.
 * Sized above the tab-strip end-droppable min (1.5rem) so we collapse
 * while spacer still exists — never on the frame tabs are already under icons.
 */
export const SWAP_SAFE_GAP_PX = 36;
/** Approx width of one swap pick button (h-7 w-7). */
export const SWAP_ICON_BTN_PX = 28;
/** Slack before re-expanding (hysteresis). Expand may animate; collapse does not. */
export const SWAP_HYSTERESIS_PX = 20;

/** @deprecated Prefer SWAP_SAFE_GAP_PX. */
export const SWAP_MIN_TAB_AREA_PX = 120;
/** @deprecated Alias of SWAP_HYSTERESIS_PX. */
export const SWAP_EXPAND_SLACK_PX = SWAP_HYSTERESIS_PX;
/** @deprecated Prefer SWAP_SAFE_GAP_PX. */
export const SWAP_COLLAPSE_BELOW_PX = SWAP_SAFE_GAP_PX;
/** @deprecated Prefer nextSwapDensity(…). */
export const SWAP_EXPAND_ABOVE_PX = 280;

const SWAP_ICON_RANK = new Map<string, number>(
  SWAP_ICON_ORDER.map((id, i) => [id, i]),
);

/** Stable Consult → S → O → A → P; any other panes follow in input order. */
export function orderSwapOptions(
  options: readonly CompanionOption[],
): CompanionOption[] {
  const ranked: CompanionOption[] = [];
  const rest: CompanionOption[] = [];
  for (const opt of options) {
    if (SWAP_ICON_RANK.has(opt.id)) ranked.push(opt);
    else rest.push(opt);
  }
  ranked.sort(
    (a, b) => (SWAP_ICON_RANK.get(a.id) ?? 0) - (SWAP_ICON_RANK.get(b.id) ?? 0),
  );
  return [...ranked, ...rest];
}

export function iconRowWidthPx(iconCount: number): number {
  return Math.max(iconCount, 0) * SWAP_ICON_BTN_PX + 8;
}

export interface SwapDensityInput {
  /**
   * Free air (px) between tab chips and swap — the tighter of
   * last-tab→swap gap and (tab-region width − tab-content width).
   */
  gapPx: number;
  /** True when any visible tab title span is ellipsized. */
  titleTruncated: boolean;
  current: "expanded" | "collapsed";
  iconCount?: number;
}

/**
 * Proximity-based density: tabs win over swap icons.
 * Collapse early (safe gap); expand only with hysteresis after room returns.
 */
export function nextSwapDensity(
  gapOrInput: number | SwapDensityInput,
  currentArg?: "expanded" | "collapsed",
  iconCountArg = SWAP_ICON_ORDER.length,
): "expanded" | "collapsed" {
  const input: SwapDensityInput =
    typeof gapOrInput === "number"
      ? {
          gapPx: gapOrInput,
          titleTruncated: false,
          current: currentArg ?? "expanded",
          iconCount: iconCountArg,
        }
      : gapOrInput;

  const {
    gapPx,
    titleTruncated,
    current,
    iconCount = SWAP_ICON_ORDER.length,
  } = input;
  if (!Number.isFinite(gapPx)) return current;

  const iconsPx = iconRowWidthPx(iconCount);

  if (current === "expanded") {
    if (titleTruncated || gapPx < SWAP_SAFE_GAP_PX) return "collapsed";
    return "expanded";
  }

  if (titleTruncated) return "collapsed";
  return gapPx - iconsPx >= SWAP_SAFE_GAP_PX + SWAP_HYSTERESIS_PX
    ? "expanded"
    : "collapsed";
}

/**
 * Crowding geometry: how much air remains before icons hit tab chips.
 * Uses the tighter of edge-gap and region free-space so multi-tab strips
 * collapse as soon as chips approach the cluster (not after overlap).
 */
export function measureSwapTabGap(
  swapRoot: HTMLElement,
  strip: Element | null,
): { gapPx: number; titleTruncated: boolean } | null {
  if (!strip) return null;
  const tabs = strip.querySelectorAll<HTMLElement>('[role="tab"]');
  if (tabs.length === 0) return null;

  const firstTab = tabs[0]!;
  const lastTab = tabs[tabs.length - 1]!;
  const firstRect = firstTab.getBoundingClientRect();
  const lastRect = lastTab.getBoundingClientRect();
  const swapLeft = swapRoot.getBoundingClientRect().left;
  const edgeGapPx = swapLeft - lastRect.right;

  const tabRegion =
    strip.querySelector<HTMLElement>("[data-pane-tab-scroll]") ?? null;
  let freeInRegionPx = edgeGapPx;
  if (tabRegion) {
    const contentWidth = Math.max(lastRect.right - firstRect.left, 0);
    freeInRegionPx = tabRegion.clientWidth - contentWidth;
  }

  // Tighter signal wins — collapse at first hint of crowding.
  const gapPx = Math.min(edgeGapPx, freeInRegionPx);

  let titleTruncated = false;
  for (const tab of tabs) {
    const label = tab.querySelector<HTMLElement>("span.truncate");
    if (label && label.scrollWidth > label.clientWidth + 1) {
      titleTruncated = true;
      break;
    }
  }

  return { gapPx, titleTruncated };
}

const iconBtnClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-50";

export default function PaneShowHereButton({
  currentTitle,
  options,
  selectedId = null,
  onSelect,
  className,
  density: densityProp,
}: PaneShowHereButtonProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const densityRef = useRef<"expanded" | "collapsed">("collapsed");
  // Prefer collapsed until measured so a narrow / crowded strip never paints
  // icons over tab names on first frame.
  const [observedDensity, setObservedDensity] = useState<
    "expanded" | "collapsed"
  >("collapsed");
  const density = densityProp ?? observedDensity;
  densityRef.current = density;

  const ordered = useMemo(() => orderSwapOptions(options), [options]);
  /** Inline row = Consult + SOAP only (keeps density math + chrome tight). */
  const iconOptions = useMemo(
    () => ordered.filter((o) => SWAP_ICON_RANK.has(o.id)),
    [ordered],
  );
  const canPick = ordered.length >= 1;
  const swapTooltip = canPick
    ? "Swap another pane into this slot"
    : `Only ${currentTitle} is available here`;
  const expanded = density === "expanded";

  const measure = useCallback(() => {
    if (densityProp) return;
    const el = rootRef.current;
    if (!el) return;
    const strip = el.closest("[data-pane-tabs-group-id]");
    const geometry = measureSwapTabGap(el, strip);
    if (!geometry) return;
    const prev = densityRef.current;
    const next = nextSwapDensity({
      gapPx: geometry.gapPx,
      titleTruncated: geometry.titleTruncated,
      current: prev,
      iconCount: iconOptions.length,
    });
    if (next === prev) return;
    // Collapse must commit before the next paint so a fast gutter drag never
    // shows icons over tab names. Expand can be async (less critical).
    if (next === "collapsed") {
      flushSync(() => {
        densityRef.current = next;
        setObservedDensity(next);
      });
    } else {
      densityRef.current = next;
      setObservedDensity(next);
    }
  }, [densityProp, iconOptions.length]);

  useLayoutEffect(() => {
    if (densityProp) return;
    measure();
    const el = rootRef.current;
    const strip = el?.closest("[data-pane-tabs-group-id]");
    const tabRegion =
      strip?.querySelector<HTMLElement>("[data-pane-tab-scroll]") ?? null;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (strip) ro.observe(strip);
    if (tabRegion) ro.observe(tabRegion);
    if (el) ro.observe(el);
    if (!strip && el?.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [densityProp, measure]);

  return (
    <div
      ref={rootRef}
      role="group"
      data-testid="pane-show-here-button"
      data-density={density}
      aria-label={`Swap into this slot: ${currentTitle}`}
      aria-disabled={!canPick || undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-md border border-border/70 bg-muted px-0.5 shadow-sm",
        !canPick && "opacity-50",
        className,
      )}
    >
      {expanded ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              data-testid="pane-show-here-swap-glyph"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-foreground"
              aria-label={swapTooltip}
            >
              <ArrowLeftRight
                className="h-3.5 w-3.5 stroke-[2.25]"
                aria-hidden
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{swapTooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="pane-show-here-swap-glyph"
                  aria-label={swapTooltip}
                  aria-haspopup="menu"
                  disabled={!canPick}
                  className={cn(
                    iconBtnClass,
                    "text-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <ArrowLeftRight
                    className="h-3.5 w-3.5 stroke-[2.25]"
                    aria-hidden
                  />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{swapTooltip}</TooltipContent>
          </Tooltip>
          {canPick ? (
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Swap into this slot
              </DropdownMenuLabel>
              {ordered.map((c) => {
                const Icon = getPalettePaneIcon(c.id);
                const selected = c.id === selectedId;
                return (
                  <DropdownMenuItem
                    key={c.id}
                    data-testid={`pane-show-here-pick-${c.id}`}
                    onSelect={() => onSelect(c.id)}
                    className={cn(selected && "bg-accent")}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="flex-1">{c.title}</span>
                    {selected ? (
                      <Check className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      )}

      <div
        data-testid="pane-show-here-icon-row"
        aria-hidden={!expanded}
        className={cn(
          "inline-flex items-center gap-0.5 overflow-hidden",
          // Collapse snaps instantly (no slide-over-tabs). Expand may ease in.
          expanded
            ? "max-w-[14rem] opacity-100 transition-[max-width,opacity] duration-150 ease-out"
            : "pointer-events-none max-w-0 opacity-0",
        )}
      >
        {iconOptions.map((c) => {
          const Icon = getPalettePaneIcon(c.id);
          const selected = c.id === selectedId;
          const label = `Swap ${c.title} into this slot`;
          return (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={expanded ? 0 : -1}
                  data-testid={
                    expanded ? `pane-show-here-pick-${c.id}` : undefined
                  }
                  aria-label={label}
                  aria-pressed={selected}
                  disabled={!canPick || !expanded}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    iconBtnClass,
                    selected && "bg-accent text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{c.title}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
