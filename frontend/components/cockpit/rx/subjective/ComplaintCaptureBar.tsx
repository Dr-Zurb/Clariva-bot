"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Complaint } from "@/types/prescription";
import { isComplaintCategory } from "@/lib/cockpit/complaint-schema";
import {
  ComplaintAutocomplete,
  type ComplaintCommitPayload,
} from "@/components/cockpit/rx/subjective/ComplaintAutocomplete";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { parseComplaintText } from "@/lib/cockpit/parse-complaint-text";
import {
  COMPLAINT_PARSE_WARNING_COPY,
  complaintParseWarning,
} from "@/lib/cockpit/should-request-ai-parse";
import { createEmptyComplaint } from "@/components/cockpit/rx/RxFormContext";
import { buildComplaintDetailSummary } from "@/lib/cockpit/complaint-card-state";
import { useDoctorComplaintCombos } from "@/hooks/useDoctorComplaintCombos";
import type { DoctorComplaintCombo } from "@/lib/api/doctor-complaint-combos";
import {
  formatComplaintComboHint,
  matchComplaintCombos,
} from "@/lib/cockpit/complaint-combos";

export interface ComplaintComboCapture {
  complaintName: string;
  category: string | null;
  severityBand: string | null;
  laterality: string | null;
  character: string | null;
  associatedNames: string[];
}

export interface ComplaintCapturePayload {
  name: string;
  category?: Complaint["category"];
  /** Doctor's original typed text when a catalog row matched — parsed for fields
   *  while `name` stays the canonical catalog name. Absent for free text. */
  rawText?: string;
  /** Attested habit pack — apply fields, skip duration/parse. */
  combo?: ComplaintComboCapture;
}

export interface ComplaintCaptureBarProps {
  disabled?: boolean;
  token?: string;
  onCapture: (payload: ComplaintCapturePayload) => void;
  inputId?: string;
  /** Accessible name when no external <label htmlFor> is present. */
  inputAriaLabel?: string;
}

function capturePreviewLine(rawText: string): {
  details: string;
  warning: string | null;
} {
  const parsed = parseComplaintText(rawText);
  const warningReason = complaintParseWarning(rawText, parsed);
  const warning = warningReason
    ? COMPLAINT_PARSE_WARNING_COPY[warningReason]
    : null;
  if (warning) return { details: "", warning };

  const draft = createEmptyComplaint();
  draft.name = parsed.name;
  Object.assign(draft, parsed.patch);
  const summary = buildComplaintDetailSummary(draft).fullText;
  const duration =
    typeof parsed.patch.duration === "string" ? parsed.patch.duration.trim() : "";
  const associated =
    parsed.associated.length > 0 ? `+ ${parsed.associated.join(", ")}` : "";
  const details = [duration, summary, associated].filter(Boolean).join(" · ");
  return { details, warning: null };
}

export function ComplaintCaptureBar({
  disabled = false,
  token,
  onCapture,
  inputId = "complaint-capture",
  inputAriaLabel = "Add chief complaint",
}: ComplaintCaptureBarProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { combos, clearCombo } = useDoctorComplaintCombos(token ?? "");

  const matchingCombos = useMemo(
    () => (token ? matchComplaintCombos(combos, draft) : []),
    [combos, draft, token]
  );

  const extraOptions = useMemo(
    () =>
      matchingCombos.map((combo, idx) => ({
        id: `${combo.nameKey}:${combo.lastUsedAt}:${idx}`,
        label: formatComplaintComboHint(combo),
        badge: idx === 0 ? "Most frequent" : undefined,
      })),
    [matchingCombos]
  );

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const emitCapture = useCallback(
    (payload: ComplaintCapturePayload) => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      onCapture({
        name: trimmed,
        category: payload.category,
        rawText: payload.rawText,
        combo: payload.combo,
      });
      setDraft("");
      focusInput();
    },
    [onCapture, focusInput],
  );

  const comboCapture = useCallback((combo: DoctorComplaintCombo): ComplaintComboCapture => ({
    complaintName: combo.complaintName,
    category: combo.category,
    severityBand: combo.severityBand,
    laterality: combo.laterality,
    character: combo.character,
    associatedNames: combo.associatedNames,
  }), []);

  const commitComboById = useCallback(
    (id: string) => {
      const idx = extraOptions.findIndex((option) => option.id === id);
      const combo = matchingCombos[idx];
      if (!combo) return;
      const category = combo.category && isComplaintCategory(combo.category)
        ? combo.category
        : undefined;
      emitCapture({
        name: combo.complaintName,
        category,
        combo: comboCapture(combo),
      });
    },
    [comboCapture, emitCapture, extraOptions, matchingCombos]
  );

  const clearComboById = useCallback(
    (id: string) => {
      const idx = extraOptions.findIndex((option) => option.id === id);
      const combo = matchingCombos[idx];
      if (!combo) return;
      void clearCombo(combo);
    },
    [clearCombo, extraOptions, matchingCombos]
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

  const preview = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed) return { details: "", warning: null };
    return capturePreviewLine(trimmed);
  }, [draft]);

  const hint = preview.warning ? (
    <p className="text-[11px] text-muted-foreground" aria-live="polite">
      <kbd className="rounded border border-border bg-muted px-1">↵</kbd>{" "}
      {preview.warning}
    </p>
  ) : preview.details ? (
    <p className="text-[11px] text-muted-foreground" aria-live="polite">
      <kbd className="rounded border border-border bg-muted px-1">↵</kbd>
      {" · "}
      {preview.details}
    </p>
  ) : null;

  if (token) {
    return (
      <div className="space-y-1">
        <div className="flex items-stretch gap-1.5">
          <div className="min-w-0 flex-1">
            <ComplaintAutocomplete
              inputId={inputId}
              value={draft}
              onChange={setDraft}
              onCommit={handleCommit}
              extraOptions={extraOptions}
              onSelectExtra={commitComboById}
              onClearExtra={clearComboById}
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
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className="space-y-1">
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
      </div>
      {hint}
    </div>
  );
}
