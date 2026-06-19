"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import type { Complaint } from "@/types/prescription";
import { isComplaintCategory } from "@/lib/cockpit/complaint-schema";
import {
  ComplaintAutocomplete,
  type ComplaintCommitPayload,
} from "@/components/cockpit/rx/subjective/ComplaintAutocomplete";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";

export interface ComplaintCapturePayload {
  name: string;
  category?: Complaint["category"];
  /** Doctor's original typed text when a catalog row matched — parsed for fields
   *  while `name` stays the canonical catalog name. Absent for free text. */
  rawText?: string;
}

export interface ComplaintCaptureBarProps {
  disabled?: boolean;
  token?: string;
  onCapture: (payload: ComplaintCapturePayload) => void;
  /** subj-14: when set, shows a "✨ Refine" button that hands the typed line to
   *  the gated AI parser. Absent → no AI affordance (e.g. unauthenticated). */
  onRefine?: (text: string) => void;
  inputId?: string;
  /** Accessible name when no external <label htmlFor> is present. */
  inputAriaLabel?: string;
}

/** Show the refine affordance only once the line carries enough to be worth it. */
const REFINE_MIN_WORDS = 3;

export function ComplaintCaptureBar({
  disabled = false,
  token,
  onCapture,
  onRefine,
  inputId = "complaint-capture",
  inputAriaLabel = "Add chief complaint",
}: ComplaintCaptureBarProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canRefine =
    !!onRefine &&
    !disabled &&
    draft.trim().split(/\s+/).filter(Boolean).length >= REFINE_MIN_WORDS;

  const handleRefineClick = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onRefine?.(trimmed);
  }, [draft, onRefine]);

  const refineButton = canRefine ? (
    <button
      type="button"
      onClick={handleRefineClick}
      className="flex shrink-0 items-center gap-1 rounded-md border border-primary/40 px-2 text-xs font-medium text-primary hover:bg-primary/10"
      aria-label="Refine complaint with AI"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      Refine
    </button>
  ) : null;

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const emitCapture = useCallback(
    (payload: ComplaintCapturePayload) => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      onCapture({ name: trimmed, category: payload.category, rawText: payload.rawText });
      setDraft("");
      focusInput();
    },
    [onCapture, focusInput],
  );

  const handleCommit = useCallback(
    (payload: ComplaintCommitPayload) => {
      if (payload.source === "master") {
        const category = isComplaintCategory(payload.complaint.category)
          ? payload.complaint.category
          : undefined;
        emitCapture({ name: payload.complaint.name, category, rawText: payload.rawText });
      } else {
        emitCapture({ name: payload.name });
      }
    },
    [emitCapture],
  );

  const handlePlainKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || disabled) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    e.preventDefault();
    emitCapture({ name: trimmed });
  };

  if (token) {
    return (
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1">
          <ComplaintAutocomplete
            inputId={inputId}
            value={draft}
            onChange={setDraft}
            onCommit={handleCommit}
            token={token}
            disabled={disabled}
            ariaLabel={inputAriaLabel}
            placeholder="Type a complaint, press Enter"
            inputRef={(el) => {
              inputRef.current = el;
            }}
            className="min-h-11"
          />
        </div>
        {refineButton}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handlePlainKeyDown}
        placeholder="Type a complaint, press Enter"
        disabled={disabled}
        className={`${RX_FIELD_INPUT_CLASS} min-h-11 flex-1`}
        maxLength={200}
        autoComplete="off"
        aria-label={inputAriaLabel}
      />
      {refineButton}
    </div>
  );
}
