/**
 * subj-10 close-gate — Subjective-tab integration smoke.
 *
 * Walks the whole documented fast-entry flow end to end:
 *   add 3 complaints → reorder → carry-forward from last visit → preset apply →
 *   smart-confirm defaults → autosave → reload restores the structured state.
 *
 * The reducer + helpers are exercised directly for deterministic assertions, and
 * a DOM mount confirms the wired-up tab (carry-forward + preset CTAs) renders and
 * autosaves. Verification only — no feature code is changed by this file.
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyComplaint,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  rxFormReducer,
  type Complaint,
  type RxFormState,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import {
  COPY_ALL_SUBJECTIVE_SELECTION,
  buildSubjectiveCarryForwardActions,
} from "@/lib/cockpit/carry-forward-subjective";
import {
  buildSubjectiveTemplateApplyActions,
} from "@/lib/cockpit/apply-subjective-template";
import {
  buildConfirmedDefaultsPatch,
  filterSuggestionsForEmptyFields,
  resolveComplaintAttributeDefaults,
} from "@/lib/cockpit/complaint-defaults";
import { resolveComplaintAttributeFields } from "@/lib/cockpit/complaint-schema";
import { normalizeCaffeineSection } from "@/lib/cockpit/social-history-caffeine";
import type { DoctorRxTemplate } from "@/types/rx-template";
import type { PrescriptionWithRelations } from "@/types/prescription";

const mockUpdatePrescription = vi.fn().mockResolvedValue({ data: {} });

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    updatePrescription: (...args: unknown[]) => mockUpdatePrescription(...args),
    createPrescription: vi.fn(),
  };
});

vi.mock("@/lib/api/last-subjective", () => ({
  getLastSubjectiveForPatient: vi.fn().mockResolvedValue({ data: { subjective: null } }),
}));

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn().mockResolvedValue({ data: { results: [] } }),
}));

vi.mock("@/hooks/useNoteFavorites", () => ({
  useNoteFavorites: () => ({
    favorites: [
      {
        id: "fav-1",
        fieldKey: "complaint_name",
        value: "Migraine",
        useCount: 5,
        lastUsedAt: "2026-06-01T00:00:00Z",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
    ],
    applyFavorite: vi.fn(),
    saveFavorite: vi.fn(),
    canSaveMore: true,
  }),
}));

function baseState(fields = createEmptyRxFormFields()): RxFormState {
  return {
    fields,
    isDirty: false,
    isSaving: false,
    isSubmitting: false,
    lastSavedAt: null,
    submitError: null,
  };
}

function named(id: string, name: string): Complaint {
  return { ...createEmptyComplaint(id), name };
}

describe("subj-10 close-gate · Subjective-tab integration smoke", () => {
  beforeEach(() => {
    mockUpdatePrescription.mockClear();
  });

  it("drives add → reorder → carry-forward → preset → smart-confirm → reload", () => {
    let state = baseState();

    // 1. Add 3 complaints.
    state = rxFormReducer(state, { type: "ADD_COMPLAINT", complaint: named("c-1", "Headache") });
    state = rxFormReducer(state, { type: "ADD_COMPLAINT", complaint: named("c-2", "Fever") });
    state = rxFormReducer(state, { type: "ADD_COMPLAINT", complaint: named("c-3", "Cough") });
    expect(state.fields.complaints.map((c) => c.name)).toEqual(["Headache", "Fever", "Cough"]);

    // 2. Reorder — move Cough to the front.
    state = rxFormReducer(state, { type: "REORDER_COMPLAINTS", fromIndex: 2, toIndex: 0 });
    expect(state.fields.complaints.map((c) => c.name)).toEqual(["Cough", "Headache", "Fever"]);

    // 3. Carry-forward from last visit (copy all) replaces the working set.
    const carryActions = buildSubjectiveCarryForwardActions(
      {
        complaints: [named("prev-1", "Migraine")],
        familyHistory: "Mother — migraine",
        socialHistory: null,
        socialHistoryStructured: {
          smoking: { status: "never", products: [] },
        },
        pastSurgicalHistory: null,
      },
      COPY_ALL_SUBJECTIVE_SELECTION,
    );
    for (const action of carryActions) state = rxFormReducer(state, action);
    expect(state.fields.complaints).toHaveLength(1);
    expect(state.fields.complaints[0].name).toBe("Migraine");
    expect(state.fields.complaints[0].id).not.toBe("prev-1"); // cloned with fresh id
    // Carry-forward parses free-text family history into the structured model
    // and re-serializes it canonically as "Relative: condition".
    expect(state.fields.familyHistory).toBe("Mother: migraine");
    expect(state.fields.socialHistoryStructured.smoking?.status).toBe("never");

    // 4. Apply a subjective preset (replaces complaints + histories).
    const template = {
      id: "tpl-1",
      doctor_id: "doc-1",
      name: "URI subjective",
      description: null,
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      investigations: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      medicines_json: [],
      subjective_json: {
        complaints: [{ id: "tc-1", name: "Sore throat", category: "default" }],
        familyHistory: null,
        socialHistoryStructured: { smoking: { status: "never", products: [] } },
        pastSurgicalHistory: null,
      },
      use_count: 3,
      last_used_at: null,
      archived_at: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    } as DoctorRxTemplate;

    for (const action of buildSubjectiveTemplateApplyActions(template)) {
      state = rxFormReducer(state, action);
    }
    expect(state.fields.complaints.map((c) => c.name)).toEqual(["Sore throat"]);
    expect(state.fields.socialHistoryStructured.smoking?.status).toBe("never");
    expect(state.fields.socialHistory).toBe("Smoking: Non-smoker");

    // 5. Smart-confirm defaults from a prior pool, applied via the reducer.
    const prior: Complaint[] = [
      { id: "p1", name: "Sore throat", duration: "2d", severity: "moderate", category: "default" },
      { id: "p2", name: "Sore throat", duration: "2d", severity: "mild", category: "default" },
    ];
    const attributeKeys = resolveComplaintAttributeFields({
      complaintName: "Sore throat",
      category: "default",
    }).map((f) => f.key);
    const suggestions = filterSuggestionsForEmptyFields(
      state.fields.complaints[0],
      resolveComplaintAttributeDefaults({
        complaintName: "Sore throat",
        category: "default",
        priorComplaints: prior,
        attributeKeys,
      }),
      attributeKeys,
    );
    expect(suggestions.duration).toBe("2d");
    state = rxFormReducer(state, {
      type: "UPDATE_COMPLAINT",
      index: 0,
      patch: buildConfirmedDefaultsPatch(suggestions),
    });
    expect(state.fields.complaints[0].duration).toBe("2d");

    // 6. Autosave payload derives cc/hopi from the structured complaints.
    const payload = buildRxPayload(state.fields);
    expect(payload.cc).toBe("Sore throat");
    expect(payload.hopi).toContain("Sore throat");

    // 7. Reload restores the structured state from the persisted row.
    const reloadedRow = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      cc: payload.cc,
      hopi: payload.hopi,
      provisional_diagnosis: null,
      investigations_orders: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      sent_to_patient_at: null,
      created_at: "2026-06-03T00:00:00Z",
      updated_at: "2026-06-03T00:00:00Z",
      complaints: payload.complaints,
      family_history: payload.familyHistory ?? null,
      social_history: payload.socialHistory ?? null,
      social_history_structured: payload.socialHistoryStructured ?? null,
      past_surgical_history: payload.pastSurgicalHistory ?? null,
    } as PrescriptionWithRelations;

    const restored = rxFormFieldsFromPrescription(reloadedRow);
    expect(restored.complaints.map((c) => c.name)).toEqual(["Sore throat"]);
    expect(restored.complaints[0].duration).toBe("2d");
    expect(restored.socialHistory).toBe("Smoking: Non-smoker");
    expect(restored.socialHistoryStructured.smoking?.status).toBe("never");
    // hopi is derived from complaints on reload (not duplicated into the fallback).
    expect(restored.hopi).toBe("");
    expect(restored.hopiManualOverride).toBe(false);
  });

  it("carry-forward and preset apply round-trip phase-2 social history (sh-08)", () => {
    let state = baseState();
    const normalizedDiet = { type: "vegetarian" as const };
    const normalizedCaffeine = normalizeCaffeineSection({
      status: "current",
      items: [
        {
          id: "caf-test",
          type: "tea",
          amount: 2,
          frequencyUnit: "day",
          frequency: 1,
          phase: "current",
        },
      ],
    });
    const phase2 = {
      diet: normalizedDiet,
      caffeine: normalizedCaffeine,
      sleep: { hoursPerNight: 6, quality: "poor" as const },
      stress: { level: "high" as const, support: "limited" as const },
      sexual: { enabled: true, active: true, protection: "sometimes" as const },
    };

    for (const action of buildSubjectiveCarryForwardActions(
      {
        complaints: [],
        familyHistory: null,
        socialHistory: null,
        socialHistoryStructured: phase2,
        pastSurgicalHistory: null,
      },
      COPY_ALL_SUBJECTIVE_SELECTION,
    )) {
      state = rxFormReducer(state, action);
    }

    expect(state.fields.socialHistoryStructured.diet).toEqual(normalizedDiet);
    expect(state.fields.socialHistoryStructured.caffeine).toMatchObject({
      status: "current",
      items: [{ type: "tea", amount: 2, frequencyUnit: "day", frequency: 1 }],
    });
    expect(state.fields.socialHistoryStructured.sexual).toMatchObject({
      enabled: true,
      active: true,
    });
    expect(state.fields.socialHistory).toContain("Sexual: active");

    const template = {
      id: "tpl-phase2",
      doctor_id: "doc-1",
      name: "Phase 2 subjective",
      description: null,
      cc: null,
      hopi: null,
      provisional_diagnosis: null,
      investigations: null,
      follow_up: null,
      patient_education: null,
      clinical_notes: null,
      medicines_json: [],
      subjective_json: {
        complaints: [],
        socialHistoryStructured: {
          travel: { recent: true, place: "Delhi" },
          sleep: { hoursPerNight: 7, quality: "good" as const },
        },
      },
      use_count: 0,
      last_used_at: null,
      archived_at: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    } as DoctorRxTemplate;

    for (const action of buildSubjectiveTemplateApplyActions(template)) {
      state = rxFormReducer(state, action);
    }

    expect(state.fields.socialHistoryStructured.travel?.place).toBe("Delhi");
    expect(state.fields.socialHistoryStructured.sleep?.hoursPerNight).toBe(7);
    expect(state.fields.socialHistory).toContain("Travel: Delhi");
  });

  it("mounts the wired-up tab with fast-entry CTAs and autosaves on edit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const prescriptionIdRef = { current: "rx-1" as string | null };

    function renderTab(ui: ReactElement) {
      return render(
        <RxFormProvider
          appointmentId="appt-1"
          patientId="pat-1"
          token="test-token"
          entryMode="structured"
          initialFields={createEmptyRxFormFields()}
          autosaveEnabled
          prescriptionIdRef={prescriptionIdRef}
          onPrescriptionCreated={() => {}}
        >
          {ui}
        </RxFormProvider>,
      );
    }

    renderTab(<SubjectiveSection heading={null} />);

    expect(screen.getByLabelText("Chief complaints")).toBeInTheDocument();
    expect(screen.getByTestId("subjective-template-trigger")).toBeInTheDocument();

    const capture = screen.getByPlaceholderText(/Type a complaint, press Enter/i);
    fireEvent.change(capture, { target: { value: "Headache" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await vi.advanceTimersByTimeAsync(1600);
    await waitFor(() => {
      expect(mockUpdatePrescription).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });
});
