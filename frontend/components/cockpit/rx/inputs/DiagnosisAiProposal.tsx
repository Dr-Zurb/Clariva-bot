"use client";

import {
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Sparkles, Plus } from "lucide-react";

import type { DiagnosisResolveSuggestion } from "@/lib/api/diagnosis-parse";
import { cn } from "@/lib/utils";

export type DiagnosisAiStatus = "loading" | "error" | "ready";

interface DiagnosisAiProposalProps {
  status: DiagnosisAiStatus;
  suggestions: DiagnosisResolveSuggestion[];
  /** The doctor's original typed text (kept when a suggestion is declined). */
  typedText: string;
  /** Apply a suggestion → coded diagnosis card (label + ICD code). */
  onAccept: (suggestion: DiagnosisResolveSuggestion) => void;
  /** Commit the doctor's original typed line as an uncoded diagnosis (ASMT-D3). */
  onKeepAsTyped: () => void;
}

/**
 * Suggestion-only proposal panel for the asmt-07 AI ICD-11 resolver
 * (confirm-to-apply). Fires only on the free-text (no catalog match) path.
 * Non-blocking: nothing is committed silently — the doctor either accepts a
 * catalog-constrained suggestion or keeps their typed text as an uncoded card.
 *
 * Keyboard: when ready, focus lands on the first match; ↑/↓ moves through
 * suggestions and the trailing "Keep as free text" row; Enter activates the
 * highlighted row; Escape keeps the typed text.
 */
export function DiagnosisAiProposal({
  status,
  suggestions,
  typedText,
  onAccept,
  onKeepAsTyped,
}: DiagnosisAiProposalProps) {
  const hasSuggestions = status === "ready" && suggestions.length > 0;
  // Navigable rows = ICD suggestions + trailing Keep row (always present).
  const keepIdx = suggestions.length;
  const rowCount = hasSuggestions ? suggestions.length + 1 : 1;
  const [activeIdx, setActiveIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `${useId()}-listbox`;

  // Fresh suggestion set → highlight the first ICD match.
  useEffect(() => {
    setActiveIdx(0);
  }, [suggestions, status]);

  // Pull focus into the panel once matches are ready (and follow arrow moves).
  useEffect(() => {
    if (status !== "ready" && status !== "error" && status !== "loading") return;
    // Only steal focus when the panel has actionable rows (ready/error/loading
    // all expose Keep; ready also exposes ICD matches).
    itemRefs.current[activeIdx]?.focus();
  }, [status, activeIdx, suggestions]);

  function activateActiveRow() {
    if (hasSuggestions && activeIdx < suggestions.length) {
      onAccept(suggestions[activeIdx]!);
      return;
    }
    onKeepAsTyped();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rowCount - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onKeepAsTyped();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateActiveRow();
    }
  }

  const statusLabel =
    status === "loading"
      ? "Finding ICD match…"
      : status === "error"
        ? "Couldn’t match — keep your typed text or try again."
        : suggestions.length === 0
          ? "No ICD match found."
          : suggestions.length === 1
            ? "Suggested ICD-11 match"
            : `Suggested ICD-11 matches (${suggestions.length})`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
      data-testid="diagnosis-ai-proposal"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {statusLabel}
        </span>
      </div>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="ICD-11 suggestions"
        className="mt-1.5 space-y-1"
      >
        {hasSuggestions
          ? suggestions.map((suggestion, index) => {
              const active = index === activeIdx;
              return (
                <li key={`${suggestion.code}-${index}`} role="none">
                  <button
                    type="button"
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    role="option"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => onAccept(suggestion)}
                    onMouseEnter={() => setActiveIdx(index)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1.5 text-left transition-colors",
                      active
                        ? "bg-primary/15 font-medium text-foreground ring-1 ring-primary/30"
                        : "bg-background/60 text-foreground hover:bg-muted/50",
                    )}
                    aria-label={`Use ${suggestion.title} (${suggestion.code})`}
                    data-testid={`diagnosis-ai-accept-${index}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {suggestion.title}
                    </span>
                    <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {suggestion.code}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary">
                      <Plus className="h-3 w-3" aria-hidden />
                      Use
                    </span>
                  </button>
                </li>
              );
            })
          : null}

        <li role="none">
          <button
            type="button"
            ref={(el) => {
              itemRefs.current[keepIdx] = el;
            }}
            role="option"
            aria-selected={activeIdx === keepIdx}
            tabIndex={activeIdx === keepIdx ? 0 : -1}
            onClick={onKeepAsTyped}
            onMouseEnter={() => setActiveIdx(keepIdx)}
            className={cn(
              "w-full rounded-sm border border-dashed px-2 py-1.5 text-left text-sm transition-colors",
              activeIdx === keepIdx
                ? "border-border bg-muted font-medium text-foreground ring-1 ring-border"
                : "border-border/70 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-testid="diagnosis-ai-keep-as-typed"
          >
            Keep “{typedText}” as free text (no code)
          </button>
        </li>
      </ul>

      {hasSuggestions ? (
        <p className="mt-1 px-0.5 text-[11px] text-muted-foreground" aria-hidden>
          ↑↓ navigate · Enter to use · Esc to keep typed text
        </p>
      ) : null}
    </div>
  );
}
