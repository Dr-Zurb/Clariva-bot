"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  children,
}: CollapsibleContainerProps) {
  const reactId = useId();
  const bodyId = `collapsible-body-${reactId}`;
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState<boolean>(defaultOpen);
  const open = isControlled ? openProp : openState;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  };

  const countPill =
    typeof count === "number" && count > 0 ? (
      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
        {count}
      </span>
    ) : null;

  const previewNode = preview ? (
    <span className="truncate text-xs font-normal text-muted-foreground">{preview}</span>
  ) : null;

  return (
    <section
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn("rounded-md border border-border bg-muted/20", className)}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2",
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
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
          >
            <span className="truncate text-sm font-medium text-foreground/80">{title}</span>
            {countPill}
            {previewNode}
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
              open ? "rotate-0" : "-rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
      <div
        id={bodyId}
        aria-hidden={!open}
        className={cn("px-3 pb-3", bodyClassName)}
        style={open ? undefined : { display: "none" }}
      >
        {children}
      </div>
    </section>
  );
}
