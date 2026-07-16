"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  scrollExamSystemCardIntoView,
  scrollObjectiveExamSectionToTop,
} from "@/lib/cockpit/exam-card-scroll";
import { ExamSystemCard } from "@/components/cockpit/rx/inputs/ExamSystemCard";
import { ClearAllConfirmDialog } from "@/components/cockpit/rx/ClearAllConfirmDialog";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { EXAM_CORE_SYSTEM_ORDER, listExamSystems } from "@/lib/cockpit/exam-schema";
import type { ExamSystemFinding } from "@/types/prescription";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface ExamSystemListProps {
  disabled?: boolean;
}

function findExamFinding(
  examFindings: ExamSystemFinding[],
  systemId: string,
): ExamSystemFinding | undefined {
  return examFindings.find((f) => f.systemId === systemId);
}

export function ExamSystemList({ disabled = false }: ExamSystemListProps) {
  const { state, dispatch, focusExamSystemRequest } = useRxForm();
  const systems = listExamSystems();
  const examFindings = state.fields.examFindings;
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Accordion: manual open keeps one system card expanded; expand/collapse-all are
  // bulk survey/reset. Open → glide under the Examination sticky header; close →
  // re-anchor unless already above the sticky line. Bulk actions do not scroll.
  const setOpen = useCallback((systemId: string, open: boolean) => {
    setOpenIds((prev) => {
      if (open) return new Set([systemId]);
      const next = new Set(prev);
      next.delete(systemId);
      return next;
    });
    if (open) scrollExamSystemCardIntoView(systemId);
    else scrollObjectiveExamSectionToTop();
  }, []);

  // External request (e.g. a Vitals shortcut) to open + scroll a system card.
  useEffect(() => {
    if (!focusExamSystemRequest) return;
    const { systemId } = focusExamSystemRequest;
    if (!systems.some((s) => s.systemId === systemId)) return;
    setOpen(systemId, true);
  }, [focusExamSystemRequest, setOpen, systems]);

  function expandAll() {
    setOpenIds(new Set(systems.map((s) => s.systemId)));
  }

  function collapseAll() {
    setOpenIds(new Set());
  }

  function markAllNormal() {
    if (disabled) return;
    dispatch({
      type: "MARK_ALL_EXAM_NORMAL",
      systemIds: [...EXAM_CORE_SYSTEM_ORDER],
    });
    collapseAll();
  }

  function confirmClearAllExam() {
    if (disabled) return;
    dispatch({ type: "SET_EXAM_FINDINGS", examFindings: [] });
    collapseAll();
    setClearConfirmOpen(false);
  }

  const counts = useMemo(() => {
    let normal = 0;
    let abnormal = 0;
    for (const systemId of EXAM_CORE_SYSTEM_ORDER) {
      const finding = findExamFinding(examFindings, systemId);
      if (finding?.status === "normal") normal += 1;
      else if (finding?.status === "abnormal") abnormal += 1;
    }
    const notExamined = EXAM_CORE_SYSTEM_ORDER.length - normal - abnormal;
    return { normal, abnormal, notExamined };
  }, [examFindings]);

  const hasDocumentedExam =
    counts.normal + counts.abnormal > 0 ||
    Boolean(findExamFinding(examFindings, "additional_notes")?.notes?.trim());

  const summaryLabel = `${counts.normal} normal · ${counts.abnormal} abnormal · ${counts.notExamined} not examined`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-2" data-testid="exam-system-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className={RX_FIELD_LABEL_CLASS}>Structured examination</span>
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="exam-summary-counts"
          >
            {summaryLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
            data-testid="exam-expand-all"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground"
            data-testid="exam-collapse-all"
          >
            Collapse all
          </button>
          <button
            type="button"
            disabled={disabled || !hasDocumentedExam}
            onClick={() => setClearConfirmOpen(true)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
            data-testid="exam-clear-all"
          >
            Clear all
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={markAllNormal}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/60 hover:bg-muted/40 disabled:opacity-50"
            data-testid="exam-mark-all-normal"
          >
            Mark entire exam normal
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {systems.map((definition) => (
          <ExamSystemCard
            key={definition.systemId}
            definition={definition}
            finding={findExamFinding(examFindings, definition.systemId)}
            disabled={disabled}
            open={openIds.has(definition.systemId)}
            onOpenChange={(open) => setOpen(definition.systemId, open)}
          />
        ))}
      </div>
      <ClearAllConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear all examination findings?"
        descriptionLead="This will reset every system to not examined."
        bullets={[
          "Normal and abnormal findings",
          "Per-system notes and finding details",
          "Additional notes",
        ]}
        testId="exam-clear-all-dialog"
        onConfirm={confirmClearAllExam}
      />
      </div>
    </TooltipProvider>
  );
}
