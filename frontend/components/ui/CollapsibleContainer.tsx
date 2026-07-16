"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapse } from "@/components/ui/Collapse";
import {
  CollapsibleDepthProvider,
  StickyStackProvider,
  useDepthToneSurface,
  useStickyHeader,
} from "@/components/ui/sticky-stack";
import {
  resolveSoapNestedStatusDotClass,
  SOAP_TAB_FAMILY_ACCENT,
  useSoapTabFamily,
} from "@/components/cockpit/rx/sections/section-chrome";
import { RX_EXAM_SYSTEM_TITLE_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  isCollapsibleAtStickyLine,
  reAnchorCollapsibleOnClose,
  scrollCollapsibleToStickyTop,
} from "@/lib/cockpit/collapse-scroll";
import { cn } from "@/lib/utils";

export interface CollapsibleContainerProps {
  /** Header title text/node (static label inside the toggle control). */
  title?: ReactNode;
  /**
   * Editable / interactive header content rendered outside the toggle control
   * so inputs and buttons inside do not collapse the section on click. When set,
   * only the chevron toggles expand/collapse.
   */
  interactiveTitle?: ReactNode;
  /** Initial open state for the uncontrolled variant. */
  defaultOpen?: boolean;
  /** Controlled open state. When provided, `onOpenChange` should update it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional count pill shown next to the title. */
  count?: number | null;
  /** Inline hint shown after the title (e.g. a one-line collapsed preview). */
  preview?: ReactNode;
  /** Left-aligned actions before the title (e.g. a drag handle). Never trigger toggle. */
  leadingActions?: ReactNode;
  /** Right-aligned actions rendered before the chevron (e.g. a "+ Add" button). */
  actions?: ReactNode;
  /** Accessible label for the wrapper region. */
  ariaLabel?: string;
  /** Accessible name for the toggle control (defaults to a sensible label). */
  toggleLabel?: string;
  /** Stable id for the outer element (anchor / scroll targets). */
  id?: string;
  /** Forwarded to `data-testid` on the outer element. */
  testId?: string;
  /** Optional leading glyph for L1 section headers (vh-04 scanning aid). */
  sectionIcon?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /** When true, smooth-scroll this section into view on expand (not on initial mount). */
  scrollOnExpand?: boolean;
  /**
   * When set, closing glides the nearest ancestor matching this selector (the
   * card's "bigger container") to the top — e.g. top-level objective sections
   * scroll the whole Objective tab back up. Takes precedence over the default
   * re-anchor-on-close behavior.
   */
  closeScrollToSelector?: string;
  /**
   * When true, the header row pins to the top of the nearest scroll container
   * (`position: sticky`) so the section title stays visible while scrolling
   * through its body. Opt-in to avoid changing every section at once.
   *
   * Stacking is automatic: a pinned header parks directly beneath the stack of its
   * pinned ancestors (via {@link useStickyHeader}), up to the sticky-stack cap.
   */
  stickyHeader?: boolean;
  /**
   * @deprecated Nesting is now derived from the sticky-stack context — a pinned
   * header always stacks beneath its pinned ancestors automatically. Retained only
   * so existing call sites keep compiling; the value is ignored.
   */
  nestedSticky?: boolean;
  /**
   * `section` — top-level SOAP containers (muted panel, always-on sticky chrome).
   * `subsection` — nested rows inside a section (flat `bg-card`, exam-card parity:
   * shadow only when open, inline collapsed preview, body separated by `border-t`).
   */
  variant?: "section" | "subsection";
  /**
   * Opt into depth-based tonal alternation for this container and its nested
   * collapsibles: levels alternate between a recessed tint and a raised card so
   * deep nesting stays legible, and each card gets a left accent rail. Set on the
   * outermost container only — descendants inherit via context. Off by default so
   * unrelated sections keep their flat surfaces.
   */
  depthTone?: boolean;
  /**
   * Exam-style status dot before subsection titles. Defaults to on when
   * `variant="subsection"` inside an active depth-tone tree.
   */
  showStatusDot?: boolean;
  /** Dot fill state; defaults to `(count ?? 0) > 0`. */
  statusDotFilled?: boolean;
  children: ReactNode;
}

/**
 * Unified collapse affordance for every subjective-tab container.
 *
 * - The title and chevron both toggle; a single chevron rotates 180° between states.
 * - Optional `leadingActions` (e.g. drag handle) sit left of the title and never
 *   trigger the toggle.
 * - Optional `actions` (e.g. a "+ Add" button) sit between the title and chevron and
 *   never trigger the toggle.
 * - Children stay mounted and are hidden via the `hidden` attribute when collapsed,
 *   so form state and labelled inputs survive a collapse/expand cycle.
 */
export function CollapsibleContainer({
  title,
  interactiveTitle,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  count,
  preview,
  leadingActions,
  actions,
  ariaLabel,
  toggleLabel,
  id,
  testId,
  sectionIcon,
  className,
  headerClassName,
  bodyClassName,
  scrollOnExpand = false,
  closeScrollToSelector,
  stickyHeader = false,
  nestedSticky: _nestedSticky = false,
  variant = "section",
  depthTone = false,
  showStatusDot: showStatusDotProp,
  statusDotFilled: statusDotFilledProp,
  children,
}: CollapsibleContainerProps) {
  const isSubsection = variant === "subsection";
  const reactId = useId();
  const bodyId = `collapsible-body-${reactId}`;
  const sectionRef = useRef<HTMLElement>(null);
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState<boolean>(defaultOpen);
  const open = isControlled ? openProp : openState;

  // Pin this header beneath the live stack of its pinned ancestors (up to the
  // sticky-stack cap), and publish the advanced offset to descendants.
  const { headerRef, pinned, headerStyle, childValue, bodyStyle, pinnedShadowClass } =
    useStickyHeader(stickyHeader);

  // Depth-based tonal alternation (opt-in): a root sets `depthTone`, seeding depth
  // 0; descendants inherit + advance via context. Even depths are a recessed tint
  // (a "well"), odd depths are raised cards — so nesting reads as alternating
  // layers. `null` → treatment off (flat surfaces, unchanged).
  const tone = useDepthToneSurface({ seedWhenNull: depthTone });
  const depth = tone.depth;
  // L1-only family accent (vh-04): additive rail on top-level section shells when
  // the tab family context is set. Never at L2/L3 (subsection variant) and never
  // a background — the depth-tone rail still carries hierarchy when opted in.
  const tabFamily = useSoapTabFamily();
  const l1FamilyAccent =
    !isSubsection && tabFamily && (depth === null || depth === 0)
      ? SOAP_TAB_FAMILY_ACCENT[tabFamily]
      : undefined;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
    // Open → glide this section to the top (under sticky chrome), concurrently
    // with the expand. Close → glide the bigger container to the top when
    // {@link closeScrollToSelector} is set; otherwise stay put unless the header
    // scrolled above the sticky line. Gated on the user toggle (not hydration/
    // programmatic open) so the form doesn't jump on load.
    if (scrollOnExpand) {
      if (next) {
        if (!isCollapsibleAtStickyLine(sectionRef.current)) {
          scrollCollapsibleToStickyTop(sectionRef.current);
        }
      } else if (closeScrollToSelector) {
        const container =
          sectionRef.current?.closest<HTMLElement>(closeScrollToSelector) ?? null;
        scrollCollapsibleToStickyTop(container);
      } else {
        reAnchorCollapsibleOnClose(sectionRef.current);
      }
    }
  };

  const countPill =
    typeof count === "number" && count > 0 ? (
      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
        {count}
      </span>
    ) : null;

  const sectionPreviewNode = preview ? (
    <span
      className={cn(
        // Prefer the heading — preview only shows when the pane is wide enough,
        // and then it is the flex item that truncates (never the title).
        "hidden min-w-0 truncate text-xs font-normal text-muted-foreground",
        "@[22rem]/collapsible:inline @[22rem]/collapsible:min-w-0 @[22rem]/collapsible:flex-1",
      )}
    >
      {preview}
    </span>
  ) : null;

  const subsectionPreviewNode = preview ? (
    <span
      className={cn(
        "hidden min-w-0 truncate text-xs text-muted-foreground",
        "@[22rem]/collapsible:inline @[22rem]/collapsible:min-w-0 @[22rem]/collapsible:flex-1",
      )}
    >
      {typeof preview === "string" ? preview.replace(/^[—–-]\s*/, "") : preview}
    </span>
  ) : null;

  const previewNode = isSubsection ? subsectionPreviewNode : sectionPreviewNode;
  const showInlinePreview = isSubsection ? !open && previewNode : Boolean(previewNode);

  // Depth-tone hierarchy: L1 wells (recessed, soft edge, family accent) vs nested
  // inset cards (raised + shadow + rail) or deeper recessed rows — exam parity.
  const depthToneSectionWell = tone.active && !isSubsection && tone.recessed;
  const depthToneRaisedCard = tone.active && isSubsection && !tone.recessed;
  const depthToneNestedWell = tone.active && isSubsection && tone.recessed;

  const showStatusDot = showStatusDotProp ?? (isSubsection && tone.active);
  const statusDotFilled =
    statusDotFilledProp ?? (typeof count === "number" && count > 0);
  const statusDotTier =
    depth !== null && depth >= 2 ? ("leaf" as const) : ("cluster" as const);
  const statusDotNode = showStatusDot ? (
    <span
      className={resolveSoapNestedStatusDotClass(
        tabFamily ?? "objective",
        statusDotFilled,
        statusDotTier,
      )}
      aria-hidden
    />
  ) : null;

  const nestedBody =
    tone.active && depth !== null ? (
      <CollapsibleDepthProvider depth={depth + 1}>
        {depthToneSectionWell ? <div className="space-y-2 pl-2">{children}</div> : children}
      </CollapsibleDepthProvider>
    ) : (
      children
    );

  const hasHeaderActions = Boolean(actions);

  return (
    <section
      ref={sectionRef}
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(
        // Named container so header stacking follows *pane* width, not viewport.
        "@container/collapsible min-w-0 rounded-md",
        // Flat surfaces (depth tone off).
        !tone.active &&
          cn(
            "border border-border",
            isSubsection ? "bg-card" : "bg-muted/20",
            l1FamilyAccent,
          ),
        // L1 section well — container, not a card; family accent strip only here.
        depthToneSectionWell &&
          cn("border border-border/30", tone.surface, l1FamilyAccent),
        // L2+ raised inset card — shadow + white surface, no accent rail.
        depthToneRaisedCard && cn("border border-border/60 shadow-sm", tone.surface),
        // L3+ nested recessed row inside a raised card.
        depthToneNestedWell && cn("border border-border/60", tone.surface),
        // Depth tone without variant split (objective vitals etc. if ever opted in).
        tone.active &&
          !depthToneSectionWell &&
          !depthToneRaisedCard &&
          !depthToneNestedWell &&
          cn("border border-border", tone.surface, l1FamilyAccent),
        pinned && "scroll-mt-[var(--sticky-stack,0px)]",
        className,
      )}
    >
      <div
        ref={headerRef}
        style={headerStyle}
        className={cn(
          "flex gap-2",
          hasHeaderActions
            ? "flex-col @[20rem]/collapsible:flex-row @[20rem]/collapsible:items-center"
            : "flex-row items-center",
          depthToneRaisedCard || depthToneNestedWell ? "px-2.5 py-1.5" : "px-3 py-2",
          isSubsection && !tone.active ? "rounded-t-md bg-card" : "rounded-md",
          // Raised-card header fill only while unpinned — pinned always paints
          // opaque `bg-background` below so body content cannot bleed through
          // translucent depth-tone wells (`bg-muted/30`).
          depthToneRaisedCard &&
            cn("rounded-t-md", !pinned && "bg-card", open && "border-b border-border/60"),
          pinned &&
            cn(
              isSubsection ? "rounded-t-md" : "rounded-b-none",
              "border-b border-border bg-background",
              pinnedShadowClass,
            ),
          headerClassName,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leadingActions ? (
            <div className="flex shrink-0 items-center">{leadingActions}</div>
          ) : null}
          {statusDotNode}
          {interactiveTitle ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <div className="min-w-0 shrink-0">{interactiveTitle}</div>
              {countPill}
              {previewNode}
            </div>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              className={cn(
                "flex min-w-0 flex-1 rounded-sm text-left",
                isSubsection ? "items-baseline gap-2" : "items-center gap-2",
              )}
            >
              {sectionIcon ? <span className="shrink-0">{sectionIcon}</span> : null}
              <span className={cn("shrink-0", RX_EXAM_SYSTEM_TITLE_CLASS)}>{title}</span>
              {!isSubsection ? countPill : null}
              {showInlinePreview ? previewNode : null}
              {isSubsection && !open ? countPill : null}
            </button>
          )}
          {/* When there are no action icons, keep the chevron on the title row. */}
          {!hasHeaderActions ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={toggleLabel ?? (open ? "Collapse section" : "Expand section")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  open ? "-rotate-180" : "rotate-0",
                )}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
        {hasHeaderActions ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              "w-full justify-end @[20rem]/collapsible:w-auto @[20rem]/collapsible:justify-start",
              leadingActions ? "pl-8 @[20rem]/collapsible:pl-0" : null,
            )}
          >
            <span className="flex shrink-0 items-center gap-1">{actions}</span>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={toggleLabel ?? (open ? "Collapse section" : "Expand section")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  open ? "-rotate-180" : "rotate-0",
                )}
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>
      <Collapse
        open={open}
        id={bodyId}
        style={bodyStyle}
        className={cn(
          isSubsection
            ? cn(
                "border-t border-border/60 py-2",
                depthToneRaisedCard || depthToneNestedWell ? "px-2.5" : "px-3",
              )
            : "px-3 pt-2 pb-3",
          bodyClassName,
        )}
      >
        <StickyStackProvider value={childValue}>{nestedBody}</StickyStackProvider>
      </Collapse>
    </section>
  );
}
