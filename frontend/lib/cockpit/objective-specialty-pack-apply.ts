/**
 * obj-18 — bridge specialty packs into obj-17's apply engine without touching it.
 */
import type { DoctorRxTemplate } from "@/types/rx-template";
import type { ObjectiveSpecialtyPack } from "@/lib/cockpit/objective-specialty-packs";

/** Synthetic template row for `buildObjectiveTemplateApplyActions` (not persisted). */
export function specialtyPackToSyntheticTemplate(
  pack: ObjectiveSpecialtyPack,
): DoctorRxTemplate {
  return {
    id: `specialty-pack-${pack.id}`,
    doctor_id: "00000000-0000-4000-8000-000000000000",
    name: pack.name,
    description: pack.description,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    medicines_json: [],
    subjective_json: {},
    objective_json: pack.objective,
    pmh_json: {},
    allergies_json: {},
    scope: "objective_full",
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
