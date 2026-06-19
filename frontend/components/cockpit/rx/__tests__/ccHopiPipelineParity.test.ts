/**
 * subj-10 close-gate — prescribe → send pipeline byte-parity.
 *
 * Gate-critical (ST-D2): the Subjective-tab program changed only HOW `cc`/`hopi`
 * are derived on the client (`buildRxPayload`) and persists them to the SAME
 * `prescriptions.cc` / `prescriptions.hopi` columns. Downstream consumers read
 * those columns verbatim and ignore the new structured fields:
 *   - PDF body (prescription-pdf-service): `body.cc = rx.cc`, `body.hopi = rx.hopi`.
 *   - SMS summary (notification-service `buildPrescriptionTextSummary`): reads only
 *     provisional_diagnosis / investigations_orders / follow_up / medicines.
 *
 * This test asserts that for an EQUIVALENT note the pipeline-consumed columns are
 * byte-identical, that legacy free-text notes pass through untouched, and that the
 * new subjective fields are isolated from the pipeline columns. Verification only —
 * no feature code is changed by this file.
 */

import { describe, expect, it } from "vitest";
import {
  buildRxPayload,
  createEmptyRxFormFields,
  deriveCcFromComplaints,
  deriveHopiFromComplaints,
  rxFormFieldsFromPrescription,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";
import type { PrescriptionWithRelations } from "@/types/prescription";

/** Columns the PDF body + SMS summary actually read off the prescription row. */
const PIPELINE_COLUMNS = [
  "cc",
  "hopi",
  "provisionalDiagnosis",
  "investigations",
  "followUp",
  "patientEducation",
  "clinicalNotes",
  "medicines",
] as const;

function pipelineProjection(payload: ReturnType<typeof buildRxPayload>) {
  return Object.fromEntries(
    PIPELINE_COLUMNS.map((key) => [key, payload[key] ?? null]),
  );
}

const HEADACHE: Complaint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Headache",
  onset: "2 days ago",
  duration: "2d",
  character: "Throbbing",
  severity: "severe",
};

const LEG_PAIN: Complaint = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Leg pain",
  location: "both calves",
  severity: "moderate",
};

describe("subj-10 close-gate · cc/hopi pipeline byte-parity", () => {
  it("legacy free-text note passes cc/hopi through byte-identically (pre-program path untouched)", () => {
    const fields = createEmptyRxFormFields();
    fields.cc = "Headache, Leg pain";
    fields.hopi = "Throbbing headache for 2 days with bilateral calf pain.";
    fields.provisionalDiagnosis = "Tension headache";

    const payload = buildRxPayload(fields);

    // No structured complaints → derivation MUST NOT touch the typed values.
    expect(payload.cc).toBe("Headache, Leg pain");
    expect(payload.hopi).toBe("Throbbing headache for 2 days with bilateral calf pain.");
    expect(payload.complaints).toEqual([]);
  });

  it("structured note and its equivalent free-text note yield byte-identical pipeline columns", () => {
    // Structured note (Subjective-tab program output).
    const structured = createEmptyRxFormFields();
    structured.complaints = [HEADACHE, LEG_PAIN];
    structured.provisionalDiagnosis = "Tension headache";
    structured.investigationsOrders = "CBC";
    structured.followUp = "1 week";

    // The "equivalent note" a doctor would have typed pre-program: the exact
    // bytes the derivation produces, entered as free text with no complaints.
    const equivalent = createEmptyRxFormFields();
    equivalent.cc = deriveCcFromComplaints([HEADACHE, LEG_PAIN]);
    equivalent.hopi = deriveHopiFromComplaints([HEADACHE, LEG_PAIN]);
    equivalent.provisionalDiagnosis = "Tension headache";
    equivalent.investigationsOrders = "CBC";
    equivalent.followUp = "1 week";

    const structuredPipeline = pipelineProjection(buildRxPayload(structured));
    const equivalentPipeline = pipelineProjection(buildRxPayload(equivalent));

    // Byte-for-byte identical on every column the PDF/SMS/snapshot consume.
    expect(structuredPipeline).toEqual(equivalentPipeline);
    expect(structuredPipeline.cc).toBe("Headache, Leg pain");
    expect(structuredPipeline.hopi).toBe(
      [
        "Headache — Onset: 2 days ago; Duration: 2d; How it feels: Throbbing; Severity: severe",
        "Leg pain — Site: both calves; Severity: moderate",
      ].join("\n\n"),
    );
  });

  it("subjective-only fields are isolated from the pipeline columns", () => {
    const withHistories = createEmptyRxFormFields();
    withHistories.complaints = [HEADACHE];
    withHistories.familyHistory = "Mother — migraine";
    withHistories.socialHistoryStructured = { notes: "Office worker" };
    withHistories.pastSurgicalHistory = "Appendectomy 2010";

    const withoutHistories = createEmptyRxFormFields();
    withoutHistories.complaints = [HEADACHE];

    // Adding family/social/surgical history must not perturb cc/hopi/Dx/meds —
    // those live in their own columns and never feed the PDF body or SMS summary.
    expect(pipelineProjection(buildRxPayload(withHistories))).toEqual(
      pipelineProjection(buildRxPayload(withoutHistories)),
    );

    // The histories ARE persisted (round-trip), just on their own columns.
    // Recognizable free-text family history is parsed into the structured model
    // and re-serialized in canonical "Relative: condition" form — this lives on
    // family_history, never on the cc/hopi pipeline columns asserted above.
    const payload = buildRxPayload(withHistories);
    expect(payload.familyHistory).toBe("Mother: migraine");
    expect(payload.socialHistory).toBe("Office worker");
    expect(payload.socialHistoryStructured?.notes).toBe("Office worker");
    // Free-text "Appendectomy 2010" is parsed into the structured model and
    // re-serialized canonically with the year detail in parentheses.
    expect(payload.pastSurgicalHistory).toBe("Appendectomy (2010)");
  });

  it("custom subsections do not perturb cc/hopi pipeline columns (subj-19)", () => {
    const withCustom = createEmptyRxFormFields();
    withCustom.complaints = [HEADACHE];
    withCustom.customSubsections = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        title: "Travel history",
        body: "Visited Kerala",
        children: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
            title: "Prophylaxis",
            body: "Doxycycline",
          },
        ],
      },
    ];

    const withoutCustom = createEmptyRxFormFields();
    withoutCustom.complaints = [HEADACHE];

    expect(pipelineProjection(buildRxPayload(withCustom))).toEqual(
      pipelineProjection(buildRxPayload(withoutCustom)),
    );
  });

  it("manual hopi override is preserved and appended (ST-D2 escape hatch)", () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [HEADACHE];
    fields.hopi = "Patient also reports photophobia.";
    fields.hopiManualOverride = true;

    const payload = buildRxPayload(fields);
    expect(payload.hopi).toBe(
      `${deriveHopiFromComplaints([HEADACHE])}\n\nPatient also reports photophobia.`,
    );
  });

  it("save → reload → re-save is a stable fixed point for the pipeline columns", () => {
    const fields = createEmptyRxFormFields();
    fields.complaints = [HEADACHE, LEG_PAIN];
    fields.provisionalDiagnosis = "Tension headache";
    fields.familyHistory = "Mother — migraine";

    const firstSave = buildRxPayload(fields);

    // Simulate the persisted row coming back from the API on reload.
    const reloadedRow = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: firstSave.cc,
      hopi: firstSave.hopi,
      provisional_diagnosis: firstSave.provisionalDiagnosis ?? null,
      investigations_orders: firstSave.investigations ?? null,
      follow_up: firstSave.followUp ?? null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      complaints: [HEADACHE, LEG_PAIN],
      family_history: firstSave.familyHistory ?? null,
      social_history: null,
      past_surgical_history: null,
    } as PrescriptionWithRelations;

    const secondSave = buildRxPayload(rxFormFieldsFromPrescription(reloadedRow));

    expect(pipelineProjection(secondSave)).toEqual(pipelineProjection(firstSave));
  });
});
