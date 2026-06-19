import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeleteCustomSectionDialog } from "@/components/cockpit/rx/subjective/DeleteCustomSectionDialog";

describe("DeleteCustomSectionDialog (subj-41)", () => {
  it("enumerates linked template counts and passes archive ids on opt-in confirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <DeleteCustomSectionDialog
        open
        sectionTitle="Diet advice"
        counts={{
          customBlockTemplates: [
            {
              id: "cb-1",
              doctor_id: "doc",
              name: "Diet",
              description: null,
              cc: null,
              hopi: null,
              provisional_diagnosis: null,
              investigations: null,
              follow_up: null,
              patient_education: null,
              clinical_notes: null,
              medicines_json: [],
              subjective_json: {},
              pmh_json: {},
              allergies_json: {},
              scope: "custom_block",
              use_count: 0,
              last_used_at: null,
              archived_at: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          subjectiveFullTemplates: [
            {
              id: "sf-1",
              doctor_id: "doc",
              name: "Full",
              description: null,
              cc: null,
              hopi: null,
              provisional_diagnosis: null,
              investigations: null,
              follow_up: null,
              patient_education: null,
              clinical_notes: null,
              medicines_json: [],
              subjective_json: {},
              pmh_json: {},
              allergies_json: {},
              scope: "subjective_full",
              use_count: 0,
              last_used_at: null,
              archived_at: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
          customBlockCount: 1,
          subjectiveFullCount: 1,
        }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getAllByText(/1 linked Template/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/appears in 1 whole-subjective template/i).length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByTestId("delete-custom-section-archive-checkbox"));
    fireEvent.click(screen.getByTestId("delete-custom-section-confirm"));

    expect(onConfirm).toHaveBeenCalledWith({ archiveCustomBlockTemplateIds: ["cb-1"] });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel is a no-op", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <DeleteCustomSectionDialog
        open
        sectionTitle="Diet"
        counts={{
          customBlockTemplates: [],
          subjectiveFullTemplates: [],
          customBlockCount: 0,
          subjectiveFullCount: 0,
        }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
