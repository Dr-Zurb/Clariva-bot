"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { DdxChipList } from "@/components/cockpit/rx/inputs/DdxChipList";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";

export interface AssessmentSectionProps {
  heading?: string | null;
  disabled?: boolean;
  /**
   * When true, the Dx input + DDx chip-row are hidden — the
   * <AssessmentStrip> above the bottom-row owns them instead (cmr-01).
   * Renders a passive read-only summary label that links to the strip.
   */
  dxLifted?: boolean;
}

export function AssessmentSection({
  heading = "Assessment",
  disabled = false,
  dxLifted = false,
}: AssessmentSectionProps) {
  const { state, setField } = useRxForm();
  const { fields } = state;

  if (dxLifted) {
    return (
      <section id="rx-diagnosis" aria-label="Assessment (summary)" className="space-y-2">
        {heading !== null && (
          <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
        )}
        <div className="text-xs text-muted-foreground">
          Working Dx is in the strip above the bottom-row.{" "}
          <button
            type="button"
            onClick={() => document.getElementById("diagnosis")?.focus()}
            className="text-primary underline-offset-2 hover:underline"
          >
            {fields.provisionalDiagnosis || "—"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="rx-diagnosis" aria-label="Assessment" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}
      <div>
        <label htmlFor="diagnosis" className={RX_FIELD_LABEL_CLASS}>
          Provisional diagnosis
        </label>
        <input
          id="diagnosis"
          type="text"
          value={fields.provisionalDiagnosis}
          onChange={(e) => setField("provisionalDiagnosis", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Provisional diagnosis"
          maxLength={500}
          disabled={disabled}
        />
      </div>

      <DdxChipList />
    </section>
  );
}
