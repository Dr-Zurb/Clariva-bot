"use client";

import { Stethoscope, User } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
  RX_SECTION_HEADING_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { parseExam, serializeExam } from "@/lib/cockpit/exam-findings";

const EXAM_TEXTAREA_CLASS =
  "block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export interface ObjectiveSectionProps {
  heading?: string | null;
  disabled?: boolean;
}

export function ObjectiveSection({
  heading = "Objective",
  disabled = false,
}: ObjectiveSectionProps) {
  const { state, setField } = useRxForm();
  const { fields } = state;
  const exam = parseExam(fields.examinationFindings);

  return (
    <section aria-label="Objective" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}

      <div>
        <span className={RX_FIELD_LABEL_CLASS}>Vitals</span>
        <div className="mt-1">
          <VitalsGrid />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          <label
            htmlFor="exam-general"
            className="text-xs font-medium text-foreground"
          >
            General Examination
          </label>
        </div>
        <textarea
          id="exam-general"
          rows={3}
          value={exam.general}
          onChange={(e) =>
            setField(
              "examinationFindings",
              serializeExam(e.target.value, exam.systemic),
            )
          }
          className={EXAM_TEXTAREA_CLASS}
          placeholder="e.g. Alert, oriented, in no distress"
          maxLength={3000}
          disabled={disabled}
        />

        <div className="h-px bg-border" aria-hidden />

        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Stethoscope className="h-4 w-4 text-muted-foreground" aria-hidden />
          <label
            htmlFor="exam-systemic"
            className="text-xs font-medium text-foreground"
          >
            Systemic Examination
          </label>
        </div>
        <textarea
          id="exam-systemic"
          rows={4}
          value={exam.systemic}
          onChange={(e) =>
            setField(
              "examinationFindings",
              serializeExam(exam.general, e.target.value),
            )
          }
          className={EXAM_TEXTAREA_CLASS}
          placeholder="e.g. Chest clear, HS S1+S2 normal, abdomen soft"
          maxLength={3000}
          disabled={disabled}
        />
      </div>

      <div>
        <label htmlFor="testResults" className={RX_FIELD_LABEL_CLASS}>
          Test results (patient-brought)
        </label>
        <textarea
          id="testResults"
          rows={3}
          value={fields.testResults}
          onChange={(e) => setField("testResults", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Reports / labs the patient brought to this visit"
          maxLength={3000}
          disabled={disabled}
        />
      </div>

      <details className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">
          Show legacy free-text vitals
        </summary>
        <div className="mt-2">
          <label htmlFor="vitalsText" className={RX_FIELD_LABEL_CLASS}>
            Vitals (free-text — legacy)
          </label>
          <input
            id="vitalsText"
            type="text"
            value={fields.vitalsText}
            onChange={(e) => setField("vitalsText", e.target.value)}
            className={RX_FIELD_INPUT_CLASS}
            placeholder="Free-text vitals (deprecated — use the grid above)"
            maxLength={1000}
            disabled={disabled}
          />
        </div>
      </details>
    </section>
  );
}
