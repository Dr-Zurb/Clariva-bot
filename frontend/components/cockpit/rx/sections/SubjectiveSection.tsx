"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";

export interface SubjectiveSectionProps {
  /** Section heading label. Defaults to "Subjective" — pass null to hide. */
  heading?: string | null;
  disabled?: boolean;
}

export function SubjectiveSection({
  heading = "Subjective",
  disabled = false,
}: SubjectiveSectionProps) {
  const { state, setField } = useRxForm();
  const { fields } = state;

  return (
    <section id="rx-symptoms" aria-label="Subjective" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}
      <div>
        <label htmlFor="cc" className={RX_FIELD_LABEL_CLASS}>
          Chief complaint (CC)
        </label>
        <input
          id="cc"
          type="text"
          value={fields.cc}
          onChange={(e) => setField("cc", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Chief complaint"
          maxLength={500}
          disabled={disabled}
        />
      </div>
      <div>
        <label htmlFor="hopi" className={RX_FIELD_LABEL_CLASS}>
          History of present illness (HOPI)
        </label>
        <textarea
          id="hopi"
          rows={3}
          value={fields.hopi}
          onChange={(e) => setField("hopi", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="History of present illness"
          maxLength={2000}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
