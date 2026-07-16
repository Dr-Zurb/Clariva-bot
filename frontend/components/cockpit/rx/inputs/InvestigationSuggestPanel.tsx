"use client";

/**
 * Catalog near-miss suggestions for Plan investigations (inv-lib-04).
 * Suggestion-only — doctor confirms or keeps typed free text.
 */
import {
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Sparkles, Plus } from "lucide-react";
import type { InvestigationOrderCatalogEntry } from "@/lib/cockpit/investigation-order-catalog";
import { cn } from "@/lib/utils";

/** `ready` (default) = local near-miss matches; `loading`/`error` = gated AI resolve (inv-lib-04). */
export type InvestigationSuggestStatus = "ready" | "loading" | "error";

export interface InvestigationSuggestPanelProps {
  suggestions: InvestigationOrderCatalogEntry[];
  typedText: string;
  onAccept: (entry: InvestigationOrderCatalogEntry) => void;
  onKeepAsTyped: () => void;
  /** Esc with no catalog matches — dismiss without adding (defaults to keep-as-typed). */
  onDismiss?: () => void;
  /** Defaults to "ready" so the local suggest path is unchanged. */
  status?: InvestigationSuggestStatus;
}

export function InvestigationSuggestPanel({
  suggestions,
  typedText,
  onAccept,
  onKeepAsTyped,
  onDismiss,
  status = "ready",
}: InvestigationSuggestPanelProps): JSX.Element {
  const hasSuggestions = status === "ready" && suggestions.length > 0;
  const keepIdx = hasSuggestions ? suggestions.length : 0;
  const rowCount = hasSuggestions ? suggestions.length + 1 : 1;
  const [activeIdx, setActiveIdx] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `${useId()}-listbox`;

  useEffect(() => {
    setActiveIdx(0);
  }, [suggestions, typedText, status]);

  useEffect(() => {
    // Focus the active option so Enter works without a mouse — including the
    // AI no-match "Keep as custom" row. Skip while loading (no confirm yet).
    if (status === "loading") return;
    itemRefs.current[activeIdx]?.focus();
  }, [activeIdx, suggestions, status]);

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
      if (hasSuggestions) {
        onKeepAsTyped();
        return;
      }
      (onDismiss ?? onKeepAsTyped)();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateActiveRow();
    }
  }

  const kindBadge = (kind: InvestigationOrderCatalogEntry["kind"]) => {
    if (kind === "panel") return "Panel";
    if (kind === "imaging") return "Imaging";
    return "Test";
  };

  const statusLabel =
    status === "loading"
      ? "Finding a matching order…"
      : status === "error"
        ? "Couldn’t match — keep your typed text or try again."
        : suggestions.length === 0
          ? "No matching order found."
          : suggestions.length === 1
            ? "Did you mean this order?"
            : `Did you mean one of these (${suggestions.length})?`;

  const keyboardHint = hasSuggestions
    ? "↑↓ navigate · Enter to use · Esc to keep typed text"
    : status === "loading"
      ? "Enter to keep as custom · Esc to cancel"
      : "Enter to keep as custom · Esc to cancel";

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
      data-testid="investigation-suggest-panel"
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
        aria-label="Investigation suggestions"
        className="mt-1.5 space-y-1"
      >
        {hasSuggestions
          ? suggestions.map((suggestion, index) => {
              const active = index === activeIdx;
              return (
                <li key={suggestion.value} role="none">
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
                    aria-label={`Use ${suggestion.label}`}
                    data-testid={`investigation-suggest-accept-${index}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {suggestion.label}
                    </span>
                    <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {kindBadge(suggestion.kind)}
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
            data-testid="investigation-suggest-keep-as-typed"
          >
            Keep “{typedText}” as custom order
          </button>
        </li>
      </ul>

      <p className="mt-1 px-0.5 text-[11px] text-muted-foreground" aria-hidden>
        {keyboardHint}
      </p>
    </div>
  );
}
