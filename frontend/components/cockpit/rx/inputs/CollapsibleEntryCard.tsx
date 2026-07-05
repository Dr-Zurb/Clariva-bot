"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  reAnchorCollapsibleOnClose,
  scrollCollapsibleToStickyTop,
} from "@/lib/cockpit/collapse-scroll";
import { Collapse } from "@/components/ui/Collapse";
import { cn } from "@/lib/utils";

/**
 * Sticky-aware scroll offset for a collapsible entry card nested inside an exam
 * finding card (stacks under the section header + exam card header). Callers in
 * flatter contexts can pass a smaller offset via `scrollMarginClassName`.
 */
export const COLLAPSIBLE_ENTRY_CARD_EXAM_SCROLL_MARGIN =
  "scroll-mt-[calc(var(--collapsible-sticky-top,2.75rem)_+_var(--exam-card-sticky-top,2.75rem))]";

export interface CollapsibleEntryCardProps {
  /** Header title (e.g. the site / condition name). */
  title: ReactNode;
  /** One-line summary shown next to the title while collapsed. */
  preview?: string;
  /** Whether the body is expanded. */
  open: boolean;
  /** Toggle the expanded state. */
  onToggle: () => void;
  /** Optional remove handler — renders a trailing X button when provided. */
  onRemove?: () => void;
  /** Accessible label for the remove button (defaults to `Remove {title}`). */
  removeLabel?: string;
  /** Accessible label for the header toggle (defaults to expand/collapse + title). */
  toggleLabel?: string;
  disabled?: boolean;
  testId?: string;
  /** Stable id used to wire `aria-controls` → the collapsible body. */
  bodyId?: string;
  /**
   * Close behavior. `"reanchor"` (default) settles the card back to its sticky line
   * (pull-up-only) — use for cards nested inside another card (edema/lymph). `"none"`
   * lets the caller drive the close scroll (e.g. glide the whole section to top).
   */
  closeBehavior?: "reanchor" | "none";
  /**
   * When set, closing glides the nearest ancestor matching this selector (the card's
   * "bigger container") to the top instead of re-anchoring the card itself — e.g. a
   * PMH condition card scrolls the whole Past medical history section back up. Takes
   * precedence over {@link closeBehavior}.
   */
  closeScrollToSelector?: string;
  /** Override the scroll-margin class (sticky-header awareness on open). */
  scrollMarginClassName?: string;
  /** Extra classes for the outer card shell. */
  className?: string;
  children: ReactNode;
}

/**
 * A chip-companion card that starts collapsed (no scroll when it appears), glides to
 * the top of the scroll area when opened, and settles back when closed — the same
 * single-motion behavior used by the exam finding cards and Allergies. The body stays
 * mounted (form state survives) via {@link Collapse}.
 *
 * The whole header row is the toggle; a decorative chevron sits at the right (down
 * collapsed, flips up open). Interactive controls placed in `title` or as `onRemove`
 * must stop propagation so they don't also toggle the card.
 */
export function CollapsibleEntryCard({
  title,
  preview,
  open,
  onToggle,
  onRemove,
  removeLabel,
  toggleLabel,
  disabled = false,
  testId,
  bodyId,
  closeBehavior = "reanchor",
  closeScrollToSelector,
  scrollMarginClassName = COLLAPSIBLE_ENTRY_CARD_EXAM_SCROLL_MARGIN,
  className,
  children,
}: CollapsibleEntryCardProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(open);

  // Only move the viewport on an actual open/close transition — never when the card
  // first mounts (added collapsed) or on unrelated re-renders. Standard motion:
  // open → glide this card's header beneath the stacked sticky headers; close →
  // glide the "bigger container" (or re-anchor the card) to the top. All smooth.
  useLayoutEffect(() => {
    if (open === prevOpen.current) return;
    prevOpen.current = open;
    if (open) {
      scrollCollapsibleToStickyTop(cardRef.current);
    } else if (closeScrollToSelector) {
      const container = cardRef.current?.closest<HTMLElement>(closeScrollToSelector) ?? null;
      scrollCollapsibleToStickyTop(container);
    } else if (closeBehavior === "reanchor") {
      reAnchorCollapsibleOnClose(cardRef.current);
    }
  }, [open, closeBehavior, closeScrollToSelector]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      ref={cardRef}
      data-testid={testId}
      data-open={open ? "true" : "false"}
      className={cn(
        scrollMarginClassName,
        "rounded-md border border-border/60 bg-background transition-colors",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5",
          open && "border-b border-border/60 bg-muted/25",
        )}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={
          toggleLabel ??
          (typeof title === "string"
            ? `${open ? "Collapse" : "Expand"} ${title}`
            : undefined)
        }
        data-testid={testId ? `${testId}-toggle` : undefined}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {typeof title === "string" ? (
            <span className="shrink-0 font-medium text-foreground">{title}</span>
          ) : (
            title
          )}
          {!open && preview ? (
            <span className="min-w-0 truncate text-muted-foreground">— {preview}</span>
          ) : null}
        </div>

        {onRemove ? (
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={removeLabel ?? (typeof title === "string" ? `Remove ${title}` : "Remove")}
            data-testid={testId ? `${testId}-remove` : undefined}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "-rotate-180" : "rotate-0",
          )}
          aria-hidden
        />
      </div>

      <Collapse open={open} id={bodyId} className="space-y-2 px-2.5 pb-2.5 pt-2">
        {children}
      </Collapse>
    </div>
  );
}
