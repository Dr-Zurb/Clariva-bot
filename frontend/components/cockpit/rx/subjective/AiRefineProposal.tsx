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
   * Card-refine: merge this suggestion into the existing card (empty fields
   * only). When set, the first row shows Apply instead of Add.
   */
  onApply?: (index: number) => void;
  /** Opt-in rename when the AI title differs from the typed card. */
  renameTo?: string | null;
  onRename?: () => void;
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
 * Non-blocking: capture already committed the typed card. The doctor applies
 * fields to that card or adds extras explicitly — nothing is committed silently.
 */
export function AiRefineProposal({
  status,
  complaints,
  onAdd,
  onAddAll,
  onDismiss,
  onApply,
  renameTo,
  onRename,
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
            {onApply ? "Apply all" : "Add all"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss AI suggestions"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
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
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {index === 0 && renameTo && onRename ? (
                    <button
                      type="button"
                      onClick={onRename}
                      className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Use name ${renameTo}`}
                    >
                      Use “{renameTo}”
                    </button>
                  ) : null}
                  {index === 0 && onApply ? (
                    <button
                      type="button"
                      onClick={() => onApply(index)}
                      className="flex items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                      aria-label={`Apply ${complaint.name} to this complaint`}
                    >
                      Apply
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(index)}
                      className="flex items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                      aria-label={`Add ${complaint.name}`}
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                      Add
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
