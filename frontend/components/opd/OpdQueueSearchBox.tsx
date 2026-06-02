"use client";

/**
 * OpdQueueSearchBox — controlled search input for the OPD queue.
 *
 * The parent owns the canonical value (URL-backed via useOpdQueueFilters).
 * To give the user immediate visual feedback while keeping URL writes
 * debounced (200 ms), this component maintains a local `draft` state that
 * mirrors the external `value` and flushes to `onChange` after the timer.
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-08-search-box.md
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trackOpdQueueEvent, trackOpdSlotEvent } from "./opdQueueTelemetry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpdQueueSearchBoxProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional placeholder; defaults to "Search name, phone, token, or MRN". */
  placeholder?: string;
  /**
   * Forwarded ref to the underlying <input> element.
   * Enables the parent (OpdTodayClient) to programmatically focus the search
   * box when the `/` hotkey fires (task-oq-13).
   */
  inputRef?: React.RefObject<HTMLInputElement>;
  /**
   * Which hub emits search-length telemetry (queue vs slot). Defaults to queue.
   */
  searchTelemetryChannel?: "queue" | "slot";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 200;

export function OpdQueueSearchBox({
  value,
  onChange,
  placeholder = "Search name, phone, token, or MRN",
  inputRef,
  searchTelemetryChannel = "queue",
}: OpdQueueSearchBoxProps): JSX.Element {
  // Local draft for immediate visual feedback; flushes to onChange after debounce.
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync draft when URL value changes externally (browser back/forward).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setDraft(next);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (searchTelemetryChannel === "slot") {
          trackOpdSlotEvent({
            event: "opd_slot.filter_changed",
            kind: "search",
            statusValue: null,
            queryLength: next.length,
          });
        } else {
          trackOpdQueueEvent({
            event: "opd_queue.filter_changed",
            kind: "search",
            statusValue: null,
            queryLength: next.length, // length proxy only — do NOT log the query string
          });
        }
        onChange(next);
      }, DEBOUNCE_MS);
    },
    [onChange, searchTelemetryChannel]
  );

  const handleClear = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setDraft("");
    onChange("");
  }, [onChange]);

  return (
    <div className={cn("relative w-full md:w-72")}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={
          searchTelemetryChannel === "slot"
            ? "Search today's slots"
            : "Search the OPD queue"
        }
        className="pl-8 pr-8"
      />
      {draft !== "" && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
