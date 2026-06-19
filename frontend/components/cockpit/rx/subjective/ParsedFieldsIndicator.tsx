"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Sparkles } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ParsedCueItem } from "@/lib/cockpit/parsed-fields-signal";

interface ParsedFieldsIndicatorProps {
  items: ParsedCueItem[];
  className?: string;
}

/**
 * Compact, persistent "auto-filled" marker (subj-13 §3, redesigned subj-14): a
 * small ✨ next to the complaint name instead of a full-width strip, so a card —
 * or a stack of rapid-captured cards — never looks cramped. Source-agnostic:
 * deterministic parse, AI parse, and associated-symptom parse all feed the same
 * signal. Hover/focus/tap reveals which fields were filled; higher-risk fields
 * (laterality/severity) are emphasised. Labelled for screen readers via the
 * trigger's `aria-label` (no auto-fade, no dismiss — it's a quiet marker).
 */
export function ParsedFieldsIndicator({ items, className }: ParsedFieldsIndicatorProps) {
  if (items.length === 0) return null;

  const summary = `Auto-filled from your text: ${items.map((i) => i.label).join(", ")}`;

  // Keep taps/keys on the marker from bubbling to the card's expand handler.
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  const stopKeys = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={stop}
            onKeyDown={stopKeys}
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-primary/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
            aria-label={summary}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem]">
          <span className="font-medium">Auto-filled:</span>{" "}
          {items.map((item, idx) => (
            <span key={`${item.label}-${idx}`}>
              {idx > 0 ? <span className="opacity-50"> · </span> : null}
              <span className={item.emphasized ? "font-semibold underline" : undefined}>
                {item.label}
              </span>
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
