"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ExamAbdSystemBody } from "@/components/cockpit/rx/inputs/ExamAbdSystemBody";
import { ExamCnsSystemBody } from "@/components/cockpit/rx/inputs/ExamCnsSystemBody";
import { ExamCvsSystemBody } from "@/components/cockpit/rx/inputs/ExamCvsSystemBody";
import { ExamGeneralSystemBody } from "@/components/cockpit/rx/inputs/ExamGeneralSystemBody";
import { ExamRespSystemBody } from "@/components/cockpit/rx/inputs/ExamRespSystemBody";
import type { ExamSystemDefinition } from "@/lib/cockpit/exam-schema";
import type { ExamFindingEntry, ExamSystemFinding } from "@/types/prescription";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  chipLabelToFindingId,
  examSystemPreviewText,
  findExamFindingEntry,
} from "@/lib/cockpit/exam-finding-utils";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_FIELD_INPUT_CLASS,
  RX_EXAM_ADDITIONAL_NOTES_LABEL,
  RX_EXAM_SUBSECTION_HEADING_CLASS,
  RX_EXAM_SYSTEM_TITLE_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { EXAM_SYSTEM_CARD_ATTR } from "@/lib/cockpit/exam-card-scroll";
import { ExamSystemStatusToolbar } from "@/components/cockpit/rx/inputs/ExamSystemStatusToolbar";
import { Collapse } from "@/components/ui/Collapse";

import { cn } from "@/lib/utils";

export type ExamSystemCardStatus = "not_examined" | "normal" | "abnormal";

export function resolveExamCardStatus(
  finding: ExamSystemFinding | undefined,
): ExamSystemCardStatus {
  if (!finding) return "not_examined";
  return finding.status;
}

function chipTestId(systemId: string, chip: string): string {
  return `exam-finding-${systemId}-${chip
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .toLowerCase()}`;
}

const STATUS_DOT_CLASS: Record<ExamSystemCardStatus, string> = {
  not_examined: "bg-muted-foreground/40",
  normal: "bg-emerald-500",
  abnormal: "bg-amber-500",
};

export interface ExamSystemCardProps {
  definition: ExamSystemDefinition;
  finding?: ExamSystemFinding;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExamSystemCard({
  definition,
  finding,
  disabled = false,
  open,
  onOpenChange,
}: ExamSystemCardProps) {
  const { dispatch } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const { systemId, label, subsections } = definition;
  const entries = finding?.findings ?? [];
  const previewText = examSystemPreviewText(finding);

  // Publish this card header's live height as a CSS var so nested finding cards
  // can offset their own scroll-margin to land *under* both the sticky section
  // header and this sticky card header (the stacked-sticky offset).
  const articleRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const article = articleRef.current;
    const header = headerRef.current;
    if (!article || !header) return;
    const apply = () => {
      article.style.setProperty("--exam-card-sticky-top", `${header.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  function clearSystem() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId });
    onOpenChange(false);
  }

  function clearSection() {
    if (disabled) return;
    dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId });
  }

  function markNormal() {
    if (disabled) return;
    if (status === "normal") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId,
      status: "normal",
      findings: [],
      notes: null,
    });
  }

  function commitEntries(nextEntries: ExamFindingEntry[], notes: string | null) {
    if (nextEntries.length === 0 && !notes?.trim()) {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId,
      status: "abnormal",
      findings: nextEntries,
      notes,
    });
  }

  function toggleFindingChip(chip: string) {
    if (disabled) return;
    const findingId = chipLabelToFindingId(chip);
    const existing = findExamFindingEntry(entries, findingId);
    const next = existing
      ? entries.filter((e) => e.findingId !== findingId)
      : [...entries, { findingId, attributes: {} }];
    commitEntries(next, finding?.notes ?? null);
  }

  function setNotes(notes: string) {
    if (disabled) return;
    commitEntries(entries, notes.trim() || null);
  }

  return (
    <article
      ref={articleRef}
      className="scroll-mt-[var(--collapsible-sticky-top,2.75rem)] rounded-md border border-border bg-card"
      {...{ [EXAM_SYSTEM_CARD_ATTR]: systemId }}
      data-testid={`exam-system-card-${systemId}`}
      aria-label={`${label} examination`}
    >
      <div
        ref={headerRef}
        className={cn(
          "sticky z-10 flex flex-wrap items-center gap-2 rounded-t-md bg-card px-3 py-2",
          "top-[var(--collapsible-sticky-top,2.75rem)]",
          open && "py-2.5 shadow-sm",
        )}
      >
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS[status])}
          aria-hidden
        />
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm text-left"
          data-testid={`exam-toggle-${systemId}`}
        >
          <span className={cn("shrink-0", RX_EXAM_SYSTEM_TITLE_CLASS)}>{label}</span>
          {!open && previewText ? (
            <span
              className="truncate text-xs text-muted-foreground"
              data-testid={`exam-summary-${systemId}`}
            >
              {previewText}
            </span>
          ) : null}
        </button>

        {status !== "not_examined" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={clearSystem}
            aria-label={`Clear ${label} — mark not examined`}
            data-testid={`exam-clear-${systemId}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          data-testid={`exam-chevron-${systemId}`}
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

      <Collapse open={open} className="border-t border-border px-3 py-2">
          {systemId === "general" ? (
            <ExamGeneralSystemBody
              finding={finding}
              disabled={disabled}
              onDone={() => onOpenChange(false)}
            />
          ) : systemId === "cvs" ? (
            <ExamCvsSystemBody
              finding={finding}
              disabled={disabled}
              onDone={() => onOpenChange(false)}
            />
          ) : systemId === "resp" ? (
            <ExamRespSystemBody
              finding={finding}
              disabled={disabled}
              onDone={() => onOpenChange(false)}
            />
          ) : systemId === "abd" ? (
            <ExamAbdSystemBody
              finding={finding}
              disabled={disabled}
              onDone={() => onOpenChange(false)}
            />
          ) : systemId === "cns" ? (
            <ExamCnsSystemBody
              finding={finding}
              disabled={disabled}
              onDone={() => onOpenChange(false)}
            />
          ) : (
            <div className="space-y-3">
              <ExamSystemStatusToolbar
                systemId={systemId}
                status={status}
                normalLine={definition.normalLine}
                disabled={disabled}
                onMarkNormal={markNormal}
                onClear={clearSection}
              />

              {status !== "normal" ? (
                <>
              {subsections.map((subsection) => (
                <section
                  key={subsection.id}
                  data-testid={`exam-subsection-${systemId}-${subsection.id}`}
                  className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2"
                >
                  <h4 className={RX_EXAM_SUBSECTION_HEADING_CLASS}>{subsection.label}</h4>
                  <div
                    className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-2")}
                    role="group"
                    aria-label={`${label} — ${subsection.label}`}
                    data-testid={`exam-findings-${systemId}-${subsection.id}`}
                  >
                    {subsection.chips.map((chip) => {
                      const findingId = chipLabelToFindingId(chip);
                      const isSelected = Boolean(findExamFindingEntry(entries, findingId));
                      return (
                        <button
                          key={chip}
                          type="button"
                          disabled={disabled}
                          aria-pressed={isSelected}
                          aria-label={chip}
                          data-testid={chipTestId(systemId, chip)}
                          onClick={() => toggleFindingChip(chip)}
                          className={chartSelectChipClass(isSelected)}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
                <label htmlFor={`exam-notes-${systemId}`} className={RX_EXAM_SUBSECTION_HEADING_CLASS}>
                  {RX_EXAM_ADDITIONAL_NOTES_LABEL}
                </label>
                <input
                  id={`exam-notes-${systemId}`}
                  type="text"
                  value={finding?.notes ?? ""}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={disabled}
                  className={cn(RX_FIELD_INPUT_CLASS, "mt-2")}
                  placeholder="Additional detail (optional)"
                  maxLength={1000}
                  data-testid={`exam-notes-${systemId}`}
                />
              </div>

              <div className="flex justify-center pt-0.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onOpenChange(false)}
                  aria-label={`Collapse ${label}`}
                  data-testid={`exam-done-${systemId}`}
                  className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <ChevronUp className="h-3 w-3" aria-hidden />
                  Done
                </button>
              </div>
                </>
              ) : null}
            </div>
          )}
      </Collapse>
    </article>
  );
}
