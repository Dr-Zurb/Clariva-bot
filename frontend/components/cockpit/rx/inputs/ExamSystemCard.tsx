"use client";

import { type KeyboardEvent } from "react";
import type { ExamSystemDefinition } from "@/lib/cockpit/exam-schema";
import type { ExamSystemFinding } from "@/types/prescription";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  CHART_SELECT_CHIP_GROUP_CLASS,
  chartSelectChipClass,
} from "@/components/ehr/chart/chart-chip-styles";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

export type ExamSystemCardStatus = "not_examined" | "normal" | "abnormal";

const STATUS_OPTIONS: readonly {
  value: ExamSystemCardStatus;
  label: string;
}[] = [
  { value: "not_examined", label: "Not examined" },
  { value: "normal", label: "Normal" },
  { value: "abnormal", label: "Abnormal" },
];

export function resolveExamCardStatus(
  finding: ExamSystemFinding | undefined,
): ExamSystemCardStatus {
  if (!finding) return "not_examined";
  return finding.status;
}

export interface ExamSystemCardProps {
  definition: ExamSystemDefinition;
  finding?: ExamSystemFinding;
  disabled?: boolean;
}

export function ExamSystemCard({
  definition,
  finding,
  disabled = false,
}: ExamSystemCardProps) {
  const { dispatch } = useRxForm();
  const status = resolveExamCardStatus(finding);
  const { systemId, label, normalLine, abnormalChips } = definition;
  const selectedFindings = finding?.findings ?? [];

  function setStatus(next: ExamSystemCardStatus) {
    if (disabled || next === status) return;
    if (next === "not_examined") {
      dispatch({ type: "CLEAR_EXAM_SYSTEM", systemId });
      return;
    }
    if (next === "normal") {
      dispatch({
        type: "SET_EXAM_SYSTEM",
        systemId,
        status: "normal",
        findings: [],
        notes: null,
      });
      return;
    }
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId,
      status: "abnormal",
      findings: selectedFindings,
      notes: finding?.notes ?? null,
    });
  }

  function toggleFinding(chip: string) {
    if (disabled) return;
    const next = selectedFindings.includes(chip)
      ? selectedFindings.filter((f) => f !== chip)
      : [...selectedFindings, chip];
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId,
      status: "abnormal",
      findings: next,
      notes: finding?.notes ?? null,
    });
  }

  function setNotes(notes: string) {
    if (disabled) return;
    dispatch({
      type: "SET_EXAM_SYSTEM",
      systemId,
      status: "abnormal",
      findings: selectedFindings,
      notes: notes.trim() || null,
    });
  }

  function handleStatusKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: ExamSystemCardStatus,
  ) {
    const idx = STATUS_OPTIONS.findIndex((o) => o.value === option);
    if (idx === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
      setStatus(next.value);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        STATUS_OPTIONS[(idx - 1 + STATUS_OPTIONS.length) % STATUS_OPTIONS.length];
      setStatus(next.value);
    }
  }

  return (
    <article
      className="rounded-md border border-border bg-card"
      data-testid={`exam-system-card-${systemId}`}
      aria-label={`${label} examination`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-medium text-foreground">{label}</h4>
          {status === "normal" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{normalLine}</p>
          ) : null}
        </div>
        <div
          className="flex shrink-0 gap-0.5"
          role="radiogroup"
          aria-label={`${label} examination status`}
          data-testid={`exam-status-${systemId}`}
        >
          {STATUS_OPTIONS.map((option) => {
            const isSelected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={option.label}
                disabled={disabled}
                data-testid={`exam-status-${systemId}-${option.value}`}
                onClick={() => setStatus(option.value)}
                onKeyDown={(event) => handleStatusKeyDown(event, option.value)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
                  isSelected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {status === "abnormal" ? (
        <div className="space-y-2 px-3 py-2">
          <div>
            <span className={RX_FIELD_LABEL_CLASS}>Findings</span>
            <div
              className={cn(CHART_SELECT_CHIP_GROUP_CLASS, "mt-1")}
              role="group"
              aria-label={`${label} abnormal findings`}
              data-testid={`exam-findings-${systemId}`}
            >
              {abnormalChips.map((chip) => {
                const isSelected = selectedFindings.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isSelected}
                    aria-label={chip}
                    data-testid={`exam-finding-${systemId}-${chip.replace(/\s+/g, "-").toLowerCase()}`}
                    onClick={() => toggleFinding(chip)}
                    className={chartSelectChipClass(isSelected)}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label
              htmlFor={`exam-notes-${systemId}`}
              className={RX_FIELD_LABEL_CLASS}
            >
              Notes
            </label>
            <input
              id={`exam-notes-${systemId}`}
              type="text"
              value={finding?.notes ?? ""}
              onChange={(event) => setNotes(event.target.value)}
              disabled={disabled}
              className={RX_FIELD_INPUT_CLASS}
              placeholder="Additional detail (optional)"
              maxLength={1000}
              data-testid={`exam-notes-${systemId}`}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
