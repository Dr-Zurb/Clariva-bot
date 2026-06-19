"use client";

import { Sparkles, Plus, X } from "lucide-react";

import type { AiParsedComplaint } from "@/lib/api/complaint-parse";

export type AiRefineStatus = "loading" | "error" | "ready";

interface AiRefineProposalProps {
  status: AiRefineStatus;
  complaints: AiParsedComplaint[];
  onAdd: (index: number) => void;
  onAddAll: () => void;
  onDismiss: () => void;
  /**
   * subj-14 auto-gate: commit the doctor's original typed line as-is. When set
   * (Enter path), a "Keep as typed" action replaces the dismiss "✕" so the typed
   * text is never silently lost. Absent on the explicit ✨ refine path (the text
   * is still sitting in the capture bar there).
   */
  onKeepAsTyped?: () => void;
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/** One-line summary of an AI-detected complaint's fields + associated symptoms. */
function summarize(complaint: AiParsedComplaint): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(complaint.patch)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${humanizeKey(key)}: ${value}`);
  }
  for (const name of complaint.associated) parts.push(name);
  return parts.join(" · ");
}

/**
 * Suggestion-only proposal panel for the subj-14 AI parse (confirm-to-apply).
 * Non-blocking: it never gates capture. The doctor adds detected complaints
 * explicitly (per-item or "Add all"); nothing is committed silently.
 */
export function AiRefineProposal({
  status,
  complaints,
  onAdd,
  onAddAll,
  onDismiss,
  onKeepAsTyped,
}: AiRefineProposalProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-xs font-medium text-foreground">
          {status === "loading"
            ? "Refining with AI…"
            : status === "error"
              ? "Couldn’t refine — keeping your typed text."
              : complaints.length === 0
                ? "No extra detail found."
                : complaints.length === 1
                  ? "AI suggestion"
                  : `AI found ${complaints.length} complaints`}
        </span>
        {status === "ready" && complaints.length > 1 ? (
          <button
            type="button"
            onClick={onAddAll}
            className="rounded-sm border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Add all
          </button>
        ) : null}
        {onKeepAsTyped ? (
          <button
            type="button"
            onClick={onKeepAsTyped}
            className="rounded-sm border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Keep as typed
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss AI suggestions"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {status === "ready" && complaints.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {complaints.map((complaint, index) => {
            const detail = summarize(complaint);
            return (
              <li
                key={`${complaint.name}-${index}`}
                className="flex items-start gap-1.5 rounded-sm bg-background/60 px-1.5 py-1"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground">{complaint.name}</span>
                  {detail ? (
                    <span className="ml-1 text-xs text-muted-foreground">{detail}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(index)}
                  className="flex shrink-0 items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                  aria-label={`Add ${complaint.name}`}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Add
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
