"use client";

import { ExamSystemCard } from "@/components/cockpit/rx/inputs/ExamSystemCard";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { EXAM_CORE_SYSTEM_ORDER, listExamSystems } from "@/lib/cockpit/exam-schema";
import type { ExamSystemFinding } from "@/types/prescription";

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
  const { state, dispatch } = useRxForm();
  const systems = listExamSystems();

  function markAllNormal() {
    if (disabled) return;
    dispatch({
      type: "MARK_ALL_EXAM_NORMAL",
      systemIds: [...EXAM_CORE_SYSTEM_ORDER],
    });
  }

  return (
    <div className="space-y-2" data-testid="exam-system-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={RX_FIELD_LABEL_CLASS}>Structured examination</span>
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
      <div className="space-y-2">
        {systems.map((definition) => (
          <ExamSystemCard
            key={definition.systemId}
            definition={definition}
            finding={findExamFinding(state.fields.examFindings, definition.systemId)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
