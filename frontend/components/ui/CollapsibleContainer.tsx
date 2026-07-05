"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapse } from "@/components/ui/Collapse";
import {
  isCollapsibleAtStickyLine,
  reAnchorCollapsibleOnClose,
  scrollCollapsibleToTop,
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
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /** When true, smooth-scroll this section into view on expand (not on initial mount). */
  scrollOnExpand?: boolean;
  /**
   * When true, the header row pins to the top of the nearest scroll container
   * (`position: sticky`) so the section title stays visible while scrolling
   * through its body. Opt-in to avoid changing every section at once.
   */
  stickyHeader?: boolean;
  /**
   * Stack this sticky header beneath an ancestor that publishes
   * `--collapsible-sticky-top` (e.g. a parent `CollapsibleContainer` with
   * `stickyHeader`). Also sets `scroll-margin-top` on the section so open-scroll
   * lands under the parent header instead of hiding beneath it.
   */
  nestedSticky?: boolean;
  /**
   * `section` — top-level SOAP containers (muted panel, always-on sticky chrome).
   * `subsection` — nested rows inside a section (flat `bg-card`, exam-card parity:
   * shadow only when open, inline collapsed preview, body separated by `border-t`).
   */
  variant?: "section" | "subsection";
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
  className,
  headerClassName,
  bodyClassName,
  scrollOnExpand = false,
  stickyHeader = false,
  nestedSticky = false,
  variant = "section",
  children,
}: CollapsibleContainerProps) {
  const isSubsection = variant === "subsection";
  const reactId = useId();
  const bodyId = `collapsible-body-${reactId}`;
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState<boolean>(defaultOpen);
  const open = isControlled ? openProp : openState;

  // Publish the sticky header's live height as a CSS var so nested sticky
  // children (e.g. exam system cards) can offset their own `top` to stack
  // directly beneath this header instead of overlapping it.
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const header = headerRef.current;
    if (!stickyHeader || !section || !header) return;
    const apply = () => {
      section.style.setProperty("--collapsible-sticky-top", `${header.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, [stickyHeader]);

  const toggle = () => {
    const next = !open;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
    // Open → glide this section to the top (under sticky chrome), concurrently
    // with the expand. Close → stay put unless it scrolled above the sticky line.
    // Gated on the user toggle (not hydration/programmatic open) so the form
    // doesn't jump on load. Skip the open glide when the header already sits at its
    // sticky line: re-opening in place needs no scroll, and scrolling anyway makes a
    // nested sticky header jump while this ancestor's height animation clips it.
    if (scrollOnExpand) {
      if (next) {
        if (!isCollapsibleAtStickyLine(sectionRef.current)) {
          scrollCollapsibleToTop(sectionRef.current);
        }
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
    <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{preview}</span>
  ) : null;

  const subsectionPreviewNode = preview ? (
    <span className="min-w-0 truncate text-xs text-muted-foreground">
      {typeof preview === "string" ? preview.replace(/^[—–-]\s*/, "") : preview}
    </span>
  ) : null;

  const previewNode = isSubsection ? subsectionPreviewNode : sectionPreviewNode;
  const showInlinePreview = isSubsection ? !open && previewNode : Boolean(previewNode);

  return (
    <section
      ref={sectionRef}
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(
        "rounded-md border border-border",
        isSubsection ? "bg-card" : "bg-muted/20",
        stickyHeader && nestedSticky && "scroll-mt-[var(--collapsible-sticky-top,0px)]",
        className,
      )}
    >
      <div
        ref={headerRef}
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          isSubsection ? "rounded-t-md bg-card" : "rounded-md",
          stickyHeader &&
            (isSubsection
              ? cn(
                  nestedSticky
                    ? "sticky top-[var(--collapsible-sticky-top,0px)] z-10"
                    : "sticky top-0 z-20",
                  open && "shadow-sm",
                )
              : nestedSticky
                ? "sticky top-[var(--collapsible-sticky-top,0px)] z-10 rounded-b-none border-b border-border bg-background shadow-sm"
                : "sticky top-0 z-20 rounded-b-none border-b border-border bg-background shadow-sm"),
          headerClassName,
        )}
      >
        {leadingActions ? (
          <div className="flex shrink-0 items-center">{leadingActions}</div>
        ) : null}
        {interactiveTitle ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {interactiveTitle}
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
            <span className="shrink-0 text-sm font-medium text-foreground/80">{title}</span>
            {!isSubsection ? countPill : null}
            {showInlinePreview ? previewNode : null}
            {isSubsection && !open ? countPill : null}
          </button>
        )}
        {actions ? <span className="flex shrink-0 items-center gap-1">{actions}</span> : null}
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
      <Collapse
        open={open}
        id={bodyId}
        className={cn(
          isSubsection ? "border-t border-border px-3 py-2" : "px-3 pt-2 pb-3",
          bodyClassName,
        )}
      >
        {children}
      </Collapse>
    </section>
  );
}
