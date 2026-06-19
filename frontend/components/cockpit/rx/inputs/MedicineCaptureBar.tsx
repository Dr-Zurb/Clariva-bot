"use client";

/**
 * <MedicineCaptureBar> — one-line medicine capture (medicine card
 * redesign). Mirrors the chief-complaint capture pattern:
 *
 *   - Type a drug name → <DrugAutocomplete> dropdown → pick a row →
 *     a card is added pre-filled from drug_master (strength, form,
 *     default route + dose unit).
 *   - Type a full sig line ("amlodipine 5 mg 2 tab od 30 days after
 *     food") → press Enter → the deterministic parser structures the
 *     whole line into a card. Unrecognised words land in the card's
 *     notes so nothing is lost.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import DrugAutocomplete from "@/components/ehr/DrugAutocomplete";
import type { DrugMasterRow } from "@/types/drug-master";
import {
  lineHasSigDetails,
  parseMedicineLine,
  type ParsedMedicineLine,
} from "@/lib/cockpit/medicine-line-parse";
import { formatMedicineSigLine } from "@/lib/medicineCodes";

export interface MedicineCaptureBarProps {
  token: string;
  disabled?: boolean;
  /** A dropdown drug was picked — seed a card from drug_master. */
  onAddDrug: (drug: DrugMasterRow) => void;
  /** Enter on a free-text line — seed a card from the parsed sig. */
  onAddParsed: (parsed: ParsedMedicineLine) => void;
}

export function MedicineCaptureBar({
  token,
  disabled = false,
  onAddDrug,
  onAddParsed,
}: MedicineCaptureBarProps) {
  const [text, setText] = useState("");

  const parsedPreview = useMemo(() => {
    if (!text.trim() || !lineHasSigDetails(text)) return null;
    return parseMedicineLine(text);
  }, [text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const parsed = parseMedicineLine(text);
    if (!parsed) return;
    e.preventDefault();
    onAddParsed(parsed);
    setText("");
  };

  return (
    <div className="mt-2">
      <div onKeyDown={handleKeyDown}>
        <DrugAutocomplete
          inputId="medicine-capture-bar"
          value={text}
          onChange={setText}
          onSelect={(drug) => {
            onAddDrug(drug);
            setText("");
          }}
          token={token}
          placeholder="Add medicine — search, or type a full line and press Enter (e.g. amlodipine 5 mg 2 tab od 30 days after food)"
          disabled={disabled}
        />
      </div>
      {parsedPreview ? (
        <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
          <kbd className="rounded border border-border bg-muted px-1">↵</kbd>{" "}
          adds <span className="font-medium text-foreground">{parsedPreview.medicineName}</span>
          {(() => {
            const sig = formatMedicineSigLine(parsedPreview);
            return sig ? <> · {sig}</> : null;
          })()}
        </p>
      ) : null}
    </div>
  );
}
