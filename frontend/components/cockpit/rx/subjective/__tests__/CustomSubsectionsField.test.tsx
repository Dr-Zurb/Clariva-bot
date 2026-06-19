import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
  };
});

vi.mock("@/components/ehr/sections/ProblemOrientedMedicalSection", () => ({
  default: () => <div data-testid="problem-oriented-stub" />,
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="allergies-stub" />,
}));

const SECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const CHILD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";

function TestHarness({
  disabled = false,
  initialFields = createEmptyRxFormFields(),
  children,
}: {
  disabled?: boolean;
  initialFields?: RxFormFields;
  children?: ReactNode;
}) {
  const prescriptionIdRef = useRef<string | null>("rx-1");
  const [fields] = useState(initialFields);
  return (
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="token-1"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={vi.fn()}
    >
      {children}
      <SubjectiveSection heading={null} disabled={disabled} />
    </RxFormProvider>
  );
}

function renameSectionViaPencil(displayName = "Untitled section", newTitle: string) {
  fireEvent.click(screen.getByRole("button", { name: `Rename ${displayName}` }));
  const titleInput = screen.getByLabelText("Section title");
  fireEvent.change(titleInput, { target: { value: newTitle } });
  fireEvent.keyDown(titleInput, { key: "Enter" });
  return titleInput;
}

describe("CustomSubsectionsField (subj-20)", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: { settings: { subjective_section_order: [] } },
    });
  });

  it("shows empty state and adds a custom section", async () => {
    render(<TestHarness />);

    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
    expect(screen.getByTestId("custom-subsections-empty")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));

    expect(screen.queryByTestId("custom-subsections-empty")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Section title")).toBeInTheDocument();
    expect(screen.getByLabelText("Section title")).toHaveFocus();
  });

  it("renames a section via the pencil control", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    fireEvent.keyDown(screen.getByLabelText("Section title"), { key: "Escape" });

    expect(screen.queryByLabelText("Section title")).not.toBeInTheDocument();
    expect(screen.getByText("Untitled section")).toBeInTheDocument();

    renameSectionViaPencil("Untitled section", "Travel history");
    expect(screen.getByText("Travel history")).toBeInTheDocument();
    expect(screen.queryByText("Untitled section")).not.toBeInTheDocument();
  });

  it("collapses and expands when tapping the section header", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    fireEvent.keyDown(screen.getByLabelText("Section title"), { key: "Escape" });

    const notes = screen.getByPlaceholderText("Free-text notes for this section");
    expect(notes).toBeVisible();

    const chevron = screen.getByRole("button", { name: "Toggle Untitled section" });
    const body = document.getElementById(chevron.getAttribute("aria-controls")!);
    expect(body).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Untitled section" }));
    expect(body).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Untitled section" }));
    expect(body).toHaveAttribute("aria-hidden", "false");
  });

  it("renames a section, adds a child, reorders via keyboard, and removes", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    renameSectionViaPencil("Untitled section", "Travel history");
    fireEvent.change(screen.getByPlaceholderText("Free-text notes for this section"), {
      target: { value: "Visited Kerala" },
    });

    fireEvent.click(screen.getByTestId(/^custom-subsection-add-child-/));

    const childRow = screen.getByTestId(/^custom-subsection-child-/);
    fireEvent.change(within(childRow).getByPlaceholderText("Sub-section heading"), {
      target: { value: "Prophylaxis" },
    });
    expect(within(childRow).queryByText("+ Add sub-section")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("custom-subsections-add-more"));
    fireEvent.keyDown(screen.getByLabelText("Section title"), { key: "Escape" });

    const untitledGrip = screen.getByRole("button", { name: /Reorder Untitled section/i });
    fireEvent.keyDown(untitledGrip, { key: "ArrowDown" });
    expect(screen.getAllByText("Travel history")).toHaveLength(1);
    expect(screen.getByText("Untitled section")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Travel history" }));
    expect(screen.queryByText("Travel history")).not.toBeInTheDocument();
    expect(screen.getByText("Untitled section")).toBeInTheDocument();
  });

  it("does not show add-child control on child rows (depth cap)", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    fireEvent.click(screen.getByTestId(/^custom-subsection-add-child-/));

    const childRow = screen.getByTestId(/^custom-subsection-child-/);
    expect(within(childRow).queryByText("+ Add sub-section")).not.toBeInTheDocument();
    expect(within(childRow).queryByRole("button", { name: /add sub-section/i })).not.toBeInTheDocument();
  });

  it("renders read-only when disabled and does not show edit affordances", async () => {
    const initialFields = createEmptyRxFormFields();
    initialFields.customSubsections = [
      {
        id: SECTION_ID,
        title: "Travel",
        body: "Abroad",
        children: [
          {
            id: CHILD_ID,
            title: "Meds",
            body: "Doxy",
          },
        ],
      },
    ];

    render(<TestHarness disabled initialFields={initialFields} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const section = screen.getByTestId(`custom-subsection-${SECTION_ID}`);
    expect(within(section).getByTestId(`custom-subsection-child-${CHILD_ID}`)).toBeInTheDocument();
    expect(within(section).getAllByText("Abroad").length).toBeGreaterThanOrEqual(1);
    expect(within(section).getByText("Doxy")).toBeInTheDocument();
    expect(screen.queryByTestId("custom-subsections-add-more")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Travel" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Section title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename Travel/ })).not.toBeInTheDocument();
  });

  it("allows multi-word section titles while editing", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    const titleInput = screen.getByLabelText("Section title");
    fireEvent.change(titleInput, { target: { value: "menstrual " } });
    expect(titleInput).toHaveValue("menstrual ");
    fireEvent.change(titleInput, { target: { value: "menstrual history" } });
    expect(titleInput).toHaveValue("menstrual history");
  });

  it("does not autosave custom section structure when only untitled sections exist", async () => {
    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));

    await new Promise((resolve) => setTimeout(resolve, 700));
    const structureSaves = mockPatchDoctorSettings.mock.calls.filter(
      ([, payload]) =>
        payload != null &&
        typeof payload === "object" &&
        "subjective_custom_subsections" in payload,
    );
    expect(structureSaves).toHaveLength(0);
    expect(screen.queryByText("Could not save default")).not.toBeInTheDocument();
    expect(screen.queryByText("Default saved")).not.toBeInTheDocument();
  });

  it("autosaves structure changes as the doctor default (not body text)", async () => {
    mockPatchDoctorSettings.mockResolvedValue({
      data: { settings: { subjective_custom_subsections: [] } },
    });

    render(<TestHarness />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    renameSectionViaPencil("Untitled section", "Travel history");
    fireEvent.change(screen.getByPlaceholderText("Free-text notes for this section"), {
      target: { value: "Patient visited abroad" },
    });

    await waitFor(
      () => {
        expect(mockPatchDoctorSettings).toHaveBeenCalledWith(
          "token-1",
          expect.objectContaining({
            subjective_custom_subsections: [
              expect.objectContaining({
                title: "Travel history",
                body: null,
                children: [],
              }),
            ],
          }),
        );
      },
      { timeout: 1500 },
    );
    expect(screen.getByText("Default saved")).toBeInTheDocument();

    mockPatchDoctorSettings.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Free-text notes for this section"), {
      target: { value: "Updated notes only" },
    });

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(mockPatchDoctorSettings).not.toHaveBeenCalled();
  });
});
