"use client";

import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAccordionOpenState } from "@/lib/cockpit/accordion-open-state";
import { EXAM_SUBSECTION_ATTR, scrollExamSubsectionIntoView, scrollExamSystemCardToTop } from "@/lib/cockpit/exam-card-scroll";
import { RX_EXAM_SUBSECTION_HEADING_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { resolveSoapNestedStatusDotClass } from "@/components/cockpit/rx/sections/section-chrome";
import { Collapse } from "@/components/ui/Collapse";
import {
  CollapsibleDepthProvider,
  StickyStackProvider,
  useDepthToneSurface,
  useStickyHeader,
} from "@/components/ui/sticky-stack";
import {
  listSubsectionsByFeasibility,
  resolveInPersonSubsectionRemoteHint,
  resolveSubsectionRemoteFeasibility,
  type ExamRemoteFeasibility,
} from "@/lib/cockpit/exam-schema";
import type { ExamFindingEntry } from "@/types/prescription";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Header pill (teleconsult-exam · tc-02). Text-first so screen readers announce
 * the feasibility state — never colour-only. `muted` = "In-person only" (not yet
 * done remotely); `info` = "Patient-assisted" (a workaround finding was recorded).
 */
export interface ExamSubsectionTag {
  label: string;
  tone: "muted" | "info";
  /** Shown on the "In-person only" tag (teleconsult); omitted for Patient-assisted. */
  hint?: string;
}

export interface ExamSubsectionCollapsibleProps {
  /** System slug, used for the toggle/body test ids (`<systemId>-subsection-…`). */
  systemId: string;
  subsectionId: string;
  label: string;
  /** `data-exam-subsection` scroll target (keep stable: `<systemId>-<subsectionId>`). */
  scrollKey: string;
  open: boolean;
  onToggle: () => void;
  /** Dot + preview shown in the collapsed header when the subsection has content. */
  hasData?: boolean;
  preview?: string;
  disabled?: boolean;
  /** Teleconsult (tc-02): mute the container for an un-performable subsection. */
  deemphasised?: boolean;
  /** Teleconsult (tc-02): a textual feasibility pill in the header. */
  tag?: ExamSubsectionTag;
  children: ReactNode;
}

const EXAM_SUBSECTION_TAG_TONE_CLASS: Record<ExamSubsectionTag["tone"], string> = {
  muted: "border-border/60 bg-muted/50 text-muted-foreground",
  info: "border-primary/30 bg-primary/10 text-primary",
};

function ExamSubsectionFeasibilityTag({
  systemId,
  subsectionId,
  tag,
}: {
  systemId: string;
  subsectionId: string;
  tag: ExamSubsectionTag;
}) {
  const pillClass = cn(
    "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium",
    EXAM_SUBSECTION_TAG_TONE_CLASS[tag.tone],
  );

  if (!tag.hint) {
    return (
      <span
        data-testid={`${systemId}-subsection-tag-${subsectionId}`}
        className={pillClass}
      >
        {tag.label}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="note"
          tabIndex={0}
          data-testid={`${systemId}-subsection-tag-${subsectionId}`}
          className={cn(pillClass, "cursor-help")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {tag.label}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[16rem] text-left"
        data-testid={`${systemId}-subsection-tag-hint-${subsectionId}`}
      >
        {tag.hint}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Collapsible exam subsection: a labelled header (with an abnormal dot + one-line
 * preview when collapsed) over a height-animating `Collapse` body. Children stay
 * mounted so form state survives collapse. Shared by every exam system body.
 */
export function ExamSubsectionCollapsible({
  systemId,
  subsectionId,
  label,
  scrollKey,
  open,
  onToggle,
  hasData = false,
  preview = "",
  disabled = false,
  deemphasised = false,
  tag,
  children,
}: ExamSubsectionCollapsibleProps) {
  const hintId = tag?.hint ? `${systemId}-subsection-hint-${subsectionId}` : undefined;
  // Pin this subsection header beneath the section + system-card headers (3rd
  // level, under the cap), publishing the advanced offset to the finding cards.
  const { headerRef, pinned, headerStyle, childValue, bodyStyle, pinnedShadowClass } =
    useStickyHeader(true);
  // Depth-tone (opt-in via the exam depth context seeded on the system card):
  // subsections are the recessed L2 well. Layered UNDER the teleconsult
  // de-emphasis — a de-emphasised subsection keeps its exact muted/dashed
  // treatment. The left rail lives on L3 finding rows only so the first row
  // in a list does not pick up a double spine.
  const tone = useDepthToneSurface({ railMinDepth: 0 });

  return (
    <section
      data-testid={`${systemId}-subsection-${subsectionId}`}
      data-open={open ? "true" : "false"}
      data-deemphasised={deemphasised ? "true" : "false"}
      {...{ [EXAM_SUBSECTION_ATTR]: scrollKey }}
      className={cn(
        "scroll-mt-[var(--sticky-stack,2.75rem)] rounded-md border border-border/60 px-2.5 py-2",
        deemphasised
          ? "border-dashed border-border/50 bg-muted/25"
          : tone.active
            ? tone.surface
            : "bg-muted/15",
      )}
    >
      <div
        ref={headerRef}
        style={headerStyle}
        className={cn(
          "flex w-full items-center gap-2",
          // Full-bleed opaque header so finding cards scroll cleanly beneath it.
          pinned && "-mx-2.5 -mt-2 rounded-t-md bg-card px-2.5 py-2",
          pinned && open && "border-b border-border/60",
          pinned && pinnedShadowClass,
        )}
      >
        <span
          className={resolveSoapNestedStatusDotClass("objective", hasData, "leaf")}
          aria-hidden
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${systemId}-subsection-body-${subsectionId}`}
          aria-describedby={hintId}
          data-testid={`${systemId}-subsection-toggle-${subsectionId}`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50",
            deemphasised && "text-muted-foreground",
          )}
        >
          <h4
            className={cn(
              "shrink-0",
              RX_EXAM_SUBSECTION_HEADING_CLASS,
              deemphasised && "text-muted-foreground/70",
            )}
          >
            {label}
          </h4>
          {!open && preview ? (
            <span className="truncate text-xs text-muted-foreground">— {preview}</span>
          ) : null}
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "-rotate-180" : "rotate-0",
            )}
            aria-hidden
          />
        </button>
        {tag ? (
          <ExamSubsectionFeasibilityTag
            systemId={systemId}
            subsectionId={subsectionId}
            tag={tag}
          />
        ) : null}
      </div>
      {tag?.hint ? (
        <span id={hintId} className="sr-only">
          {tag.hint}
        </span>
      ) : null}

      <Collapse open={open} id={`${systemId}-subsection-body-${subsectionId}`} style={bodyStyle}>
        <StickyStackProvider value={childValue}>
          {tone.active && tone.depth !== null ? (
            <CollapsibleDepthProvider depth={tone.depth + 1}>{children}</CollapsibleDepthProvider>
          ) : (
            children
          )}
        </StickyStackProvider>
      </Collapse>
    </section>
  );
}

/** A subsection carrying an optional remote-feasibility flag (tc-01). */
interface FeasibilityLike {
  id: string;
  remote?: ExamRemoteFeasibility;
}

/**
 * Teleconsult (tc-02) subsection ordering: `assessable` first, `in_person_only`
 * after — stable within each group. In-clinic returns the list untouched, so the
 * in-clinic render is byte-identical.
 */
export function orderSubsectionsForModality<S extends FeasibilityLike>(
  subsections: readonly S[],
  isTeleconsult: boolean,
): readonly S[] {
  if (!isTeleconsult) return subsections;
  return [
    ...listSubsectionsByFeasibility(subsections, "assessable"),
    ...listSubsectionsByFeasibility(subsections, "in_person_only"),
  ];
}

/**
 * Teleconsult (tc-02) header affordance for a subsection. `in_person_only` with
 * no recorded data → greyed + "In-person only"; with recorded data → "Patient-
 * assisted" (a remote workaround finding exists). Everything else is untouched.
 */
export function resolveTeleconsultSubsectionTag(
  isTeleconsult: boolean,
  subsection: FeasibilityLike,
  hasData: boolean,
): { deemphasised: boolean; tag?: ExamSubsectionTag } {
  if (!isTeleconsult || resolveSubsectionRemoteFeasibility(subsection) !== "in_person_only") {
    return { deemphasised: false };
  }
  if (hasData) {
    return { deemphasised: false, tag: { label: "Patient-assisted", tone: "info" } };
  }
  return {
    deemphasised: true,
    tag: {
      label: "In-person only",
      tone: "muted",
      hint: resolveInPersonSubsectionRemoteHint(subsection.id),
    },
  };
}

/** One-line collapsed summary for a subsection from its recorded entries. */
export function examSubsectionSummary(
  ownedFindingIds: Set<string>,
  entries: ExamFindingEntry[],
  previewEntry: (entry: ExamFindingEntry) => string,
): { hasData: boolean; preview: string } {
  const recorded = entries.filter((e) => ownedFindingIds.has(e.findingId));
  if (recorded.length === 0) return { hasData: false, preview: "" };
  const head = recorded.slice(0, 2).map(previewEntry).filter(Boolean);
  const extra = recorded.length - head.length;
  const preview = extra > 0 ? `${head.join(" · ")} · +${extra}` : head.join(" · ");
  return { hasData: true, preview };
}

interface SubsectionLike {
  id: string;
}

export interface UseExamSubsectionOpenStateOptions<S extends SubsectionLike> {
  /** Exam system slug (`general`, `cvs`, …) — used to scroll the parent card on close. */
  systemId: string;
  subsections: readonly S[];
  /** Entries at mount — used to auto-expand subsections that already have content. */
  initialEntries: ExamFindingEntry[];
  ownedFindingIds: (subsection: S) => Set<string>;
  scrollKeyFor: (subsectionId: string) => string;
  /** Subsection ids to open at mount when nothing has recorded data (e.g. the first). */
  fallbackOpenIds?: readonly string[];
  /** Extra subsection ids to force-open at mount (e.g. vitals subsections with data). */
  initialExtraOpenIds?: readonly string[];
  /**
   * Teleconsult (tc-02): subsections for which the caller returns `true` are
   * excluded from every auto-open path (data-bearing auto-expand, fallback, and
   * initial-extra) so `in_person_only` subsections start collapsed even if they
   * carry data. They still open on explicit user toggle.
   */
  excludeFromAutoOpen?: (subsection: S) => boolean;
}

/** Accordion default: at most one subsection open — first match in registry order. */
export { pickAccordionOpenId } from "@/lib/cockpit/accordion-open-state";

/**
 * Subsection collapse state (accordion on manual toggle; bulk expand/collapse-all).
 * Auto-expands the first subsection (in registry order) that has recorded findings
 * at mount; otherwise opens `fallbackOpenIds`. Opening a subsection via toggle
 * closes siblings; expand-all opens every subsection for survey mode.
 */
export function useExamSubsectionOpenState<S extends SubsectionLike>({
  systemId,
  subsections,
  initialEntries,
  ownedFindingIds,
  scrollKeyFor,
  fallbackOpenIds,
  initialExtraOpenIds,
  excludeFromAutoOpen,
}: UseExamSubsectionOpenStateOptions<S>) {
  const accordion = useAccordionOpenState({
    items: subsections,
    initialOpenIds: (() => {
      const excludedIds = new Set<string>(
        excludeFromAutoOpen
          ? subsections.filter((s) => excludeFromAutoOpen(s)).map((s) => s.id)
          : [],
      );
      const initial: string[] = [];
      for (const id of initialExtraOpenIds ?? []) {
        if (!excludedIds.has(id)) initial.push(id);
      }
      for (const subsection of subsections) {
        if (excludedIds.has(subsection.id)) continue;
        const owned = ownedFindingIds(subsection);
        if (initialEntries.some((e) => owned.has(e.findingId))) initial.push(subsection.id);
      }
      if (initial.length === 0) {
        for (const id of fallbackOpenIds ?? []) {
          if (!excludedIds.has(id)) initial.push(id);
        }
      }
      return initial;
    })(),
  });

  function isOpen(subsectionId: string): boolean {
    return accordion.isOpen(subsectionId);
  }

  function toggle(subsectionId: string) {
    const willOpen = !accordion.openIds.has(subsectionId);
    accordion.toggle(subsectionId);
    if (willOpen) scrollExamSubsectionIntoView(scrollKeyFor(subsectionId));
    else scrollExamSystemCardToTop(systemId);
  }

  return {
    isOpen,
    toggle,
    expandAll: accordion.expandAll,
    collapseAll: accordion.collapseAll,
  };
}
