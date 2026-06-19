import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyComplaint,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintCard } from "@/components/cockpit/rx/subjective/ComplaintCard";
import type { Complaint } from "@/types/prescription";

vi.mock("@/lib/api/last-subjective", () => ({
  getLastSubjectiveForPatient: vi.fn().mockResolvedValue({ data: { subjective: null } }),
}));

vi.mock("@/hooks/useNoteFavorites", () => ({
  useNoteFavorites: () => ({
    favorites: [],
    applyFavorite: vi.fn(),
    saveFavorite: vi.fn(),
    canSaveMore: true,
  }),
}));

const baseComplaint: Complaint = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Headache",
  duration: "2d",
  severity: "severe",
};

const priorComplaint: Complaint = {
  id: "prior-1",
  name: "Headache",
  duration: "2d",
  severity: "moderate",
  character: "throbbing",
  category: "pain",
};

function renderCard(
  value: Complaint,
  options: { onPatch?: (index: number, patch: Partial<Complaint>) => void; prior?: Complaint[] } = {},
) {
  const fields = createEmptyRxFormFields();
  fields.complaints = [options.prior ?? priorComplaint, value];

  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={false}
      prescriptionIdRef={{ current: "rx-1" }}
      onPrescriptionCreated={() => {}}
    >
      <ComplaintCard
        index={1}
        value={value}
        onPatch={options.onPatch ?? vi.fn()}
        onRemove={vi.fn()}
        isEditing
        token="test-token"
      />
    </RxFormProvider>,
  );
}

describe("ComplaintCard schema wiring", () => {
  it("renders headache-specific fields for headache complaints", () => {
    render(
      <ComplaintCard
        index={0}
        value={baseComplaint}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    expect(screen.getByText("Side")).toBeInTheDocument();
    expect(screen.getByLabelText("Where on head")).toBeInTheDocument();
    expect(screen.getByText("Worsened by")).toBeInTheDocument();
    expect(screen.getByLabelText("Radiates to")).toBeInTheDocument();
  });

  it("re-resolves fields when the name changes without clearing shared values", () => {
    const onPatch = vi.fn();
    const { rerender } = render(
      <ComplaintCard
        index={0}
        value={baseComplaint}
        onPatch={onPatch}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    expect(screen.getByLabelText("Where on head")).toBeInTheDocument();

    rerender(
      <ComplaintCard
        index={0}
        value={{ ...baseComplaint, name: "Fever" }}
        onPatch={onPatch}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Pattern")).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();

    rerender(
      <ComplaintCard
        index={0}
        value={{ ...baseComplaint, name: "Fever" }}
        onPatch={onPatch}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );
    expect(screen.getByLabelText("Duration")).toHaveValue("2 Days");
  });

  it("keeps duration in the header and severity in the expanded body", () => {
    render(
      <ComplaintCard
        index={0}
        value={{ ...createEmptyComplaint(), name: "Chest pain", duration: "4 days", severity: "mild" }}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    expect(screen.getByLabelText("Duration")).toHaveValue("4 Days");
    expect(screen.queryByRole("button", { name: "Severity" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mild" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Where in chest")).toBeInTheDocument();
  });

  it("shows a second-line detail summary on the collapsed card", () => {
    render(
      <ComplaintCard
        index={0}
        value={{
          ...createEmptyComplaint(),
          name: "Chest pain",
          duration: "4 days",
          severity: "mild",
          laterality: "Behind breastbone",
          character: "Sharp / stabbing",
          onset: "Sudden",
          radiation: "Left arm",
          timing: "Constant",
          aggravating: "Movement",
          relieving: "Rest",
        }}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );

    expect(screen.getByTestId("complaint-card-detail-summary")).toHaveTextContent(
      "Mild · Behind breastbone · Sudden · Sharp / stabbing · → Left arm · Constant · ↑ Movement · ↓ Rest",
    );
    expect(screen.getByLabelText("Duration")).toHaveValue("4 Days");
    expect(screen.queryByRole("button", { name: "Severity" })).not.toBeInTheDocument();
  });

  it("shows a note icon when notes are filled but not in the summary line", () => {
    render(
      <ComplaintCard
        index={0}
        value={{
          ...createEmptyComplaint(),
          name: "Chest pain",
          character: "Sharp / stabbing",
          notes: "its chronically present",
        }}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );

    expect(screen.getByLabelText("Note: its chronically present")).toBeInTheDocument();
    expect(screen.getByTestId("complaint-card-detail-summary")).toHaveTextContent(
      "Sharp / stabbing",
    );

    fireEvent.click(screen.getByTestId("complaint-card-note-trigger"));
    expect(screen.getByText("its chronically present")).toBeInTheDocument();
  });

  it("shows the note icon on row 2 when only notes are filled", () => {
    render(
      <ComplaintCard
        index={0}
        value={{
          ...createEmptyComplaint(),
          name: "Chest pain",
          notes: "worse at night",
        }}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );

    expect(screen.queryByTestId("complaint-card-detail-summary")).not.toBeInTheDocument();
    expect(screen.getByTestId("complaint-card-note-trigger")).toBeInTheDocument();
  });

  it("omits the detail summary line when no SOCRATES fields are filled", () => {
    render(
      <ComplaintCard
        index={0}
        value={{ ...createEmptyComplaint(), name: "Chest pain" }}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );

    expect(screen.queryByTestId("complaint-card-detail-summary")).not.toBeInTheDocument();
  });

  it("patches duration from collapsed inline control", () => {
    const onPatch = vi.fn();
    render(
      <ComplaintCard
        index={0}
        value={{ ...createEmptyComplaint(), name: "Chest pain" }}
        onPatch={onPatch}
        onRemove={vi.fn()}
        isEditing={false}
      />,
    );

    const duration = screen.getByLabelText("Duration");
    fireEvent.focus(duration);
    fireEvent.change(duration, { target: { value: "3" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "3 Days" }));
    expect(onPatch).toHaveBeenCalledWith(0, { duration: "3 days" });
  });

  it("shows promote control on nested associated cards", () => {
    const onPromote = vi.fn();
    render(
      <ComplaintCard
        index={0}
        value={{ ...createEmptyComplaint(), name: "Breathlessness", duration: "2 days" }}
        depth={1}
        parentName="Chest pain"
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        onPromote={onPromote}
        isEditing={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Move Breathlessness to main complaints" }),
    );
    expect(onPromote).toHaveBeenCalledWith(0);
  });

  it("patches severity from the expanded body, linking the pain score on a pain card", () => {
    const onPatch = vi.fn();
    render(
      <ComplaintCard
        index={0}
        value={{ ...createEmptyComplaint(), name: "Chest pain" }}
        onPatch={onPatch}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    // On a pain card the severity chips + 0–10 scale are one linked control:
    // tapping "Mild" also seeds a representative score (2) when none is set.
    fireEvent.click(screen.getByRole("button", { name: "Mild" }));
    expect(onPatch).toHaveBeenCalledWith(0, { severity: "mild", painScore: 2 });
  });

  it("uses an explicit category when provided", () => {
    // A non-override name so explicit category routing is what's exercised
    // (bespoke name overrides like "Headache" intentionally beat the category).
    render(
      <ComplaintCard
        index={0}
        value={{ ...baseComplaint, name: "Fatigue" }}
        category="cough"
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        isEditing
      />,
    );

    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Sputum")).toBeInTheDocument();
    expect(screen.queryByText("Site")).not.toBeInTheDocument();
  });
});

describe("ComplaintCard smart-confirm defaults", () => {
  it("shows suggested defaults on pick without patching until confirm", () => {
    const onPatch = vi.fn();
    const emptyCard = createEmptyComplaint();
    emptyCard.name = "Headache";

    renderCard(emptyCard, { onPatch });

    expect(screen.getByTestId("complaint-suggestion-banner")).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: "2d" }),
    );
  });

  it("apply from history confirms prior charting into form state", () => {
    const onPatch = vi.fn();
    const emptyCard = createEmptyComplaint();
    emptyCard.name = "Headache";

    renderCard(emptyCard, { onPatch });

    fireEvent.click(screen.getByRole("button", { name: "Apply from history" }));

    expect(onPatch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        duration: "2d",
        severity: "moderate",
        character: "throbbing",
      }),
    );
  });

  it("explicit character edit wins over suggestion for that field", () => {
    const onPatch = vi.fn();
    const emptyCard = createEmptyComplaint();
    emptyCard.name = "Headache";

    renderCard(emptyCard, { onPatch });

    fireEvent.click(screen.getByRole("button", { name: "Dull" }));

    expect(onPatch).toHaveBeenCalledWith(1, { character: "Dull" });
    expect(screen.queryByText(/Prior charting: throbbing/)).not.toBeInTheDocument();
  });

  it("shows no suggestions for unknown complaint with no priors", () => {
    const onPatch = vi.fn();
    const emptyCard = createEmptyComplaint();
    emptyCard.name = "Rare syndrome";

    renderCard(emptyCard, { onPatch, prior: { ...priorComplaint, name: "Fever", category: "fever" } });

    expect(screen.queryByTestId("complaint-suggestion-banner")).not.toBeInTheDocument();
  });

  it("renders measured before temperature on fever cards", () => {
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";

    const { container } = renderCard(feverCard);

    const labels = Array.from(container.querySelectorAll("label, span")).map((el) =>
      el.textContent?.trim(),
    );
    const measuredIdx = labels.indexOf("Measured");
    const temperatureIdx = labels.indexOf("Temperature");
    expect(measuredIdx).toBeGreaterThan(-1);
    expect(temperatureIdx).toBeGreaterThan(-1);
    expect(measuredIdx).toBeLessThan(temperatureIdx);
  });

  it("felt only keeps grade but clears exact temperature", () => {
    const onPatch = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.temperature = 105;
    feverCard.temperatureUnit = "F";
    feverCard.feverGrade = "very_high";

    const { rerender } = render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feverCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feverCard}
          onPatch={onPatch}
          onRemove={vi.fn()}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Felt only" }));
    expect(onPatch).toHaveBeenCalledWith(1, {
      measuredBy: "Felt only",
      temperature: null,
    });

    const feltOnlyCard = {
      ...feverCard,
      measuredBy: "Felt only",
      temperature: null,
      feverGrade: null,
    };
    rerender(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feltOnlyCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feltOnlyCard}
          onPatch={onPatch}
          onRemove={vi.fn()}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Very high" }));
    expect(onPatch).toHaveBeenLastCalledWith(1, {
      feverGrade: "very_high",
      temperature: null,
    });
    expect(screen.queryByLabelText("Temperature in degrees Fahrenheit")).not.toBeInTheDocument();
  });

  it("shows reported by only when felt only is selected", () => {
    const onPatch = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";

    const { rerender } = renderCard(feverCard, { onPatch });

    expect(screen.queryByText("Reported by")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Felt only" }));
    const feltOnlyCard = { ...feverCard, measuredBy: "Felt only" };
    rerender(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feltOnlyCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feltOnlyCard}
          onPatch={onPatch}
          onRemove={vi.fn()}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    expect(screen.getByText("Reported by")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Patient" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attendant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clinician" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Attendant" }));
    expect(onPatch).toHaveBeenLastCalledWith(1, {
      reportedBy: "Attendant",
      temperature: null,
    });
  });

  it("does not blur-collapse when temperature input loses focus to an in-card button", () => {
    const onRequestCollapse = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.measuredBy = "Home";
    feverCard.temperature = 101;
    feverCard.temperatureUnit = "F";
    feverCard.feverGrade = "moderate";

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feverCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feverCard}
          onPatch={vi.fn()}
          onRemove={vi.fn()}
          onRequestCollapse={onRequestCollapse}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    vi.useFakeTimers();
    const input = screen.getByLabelText("Temperature in degrees Fahrenheit");

    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: null });
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: document.body });
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Celsius" }));
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not blur-collapse when a chip field input blurs to null (Safari chips)", () => {
    const onRequestCollapse = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.measuredBy = "Home";

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feverCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feverCard}
          onPatch={vi.fn()}
          onRemove={vi.fn()}
          onRequestCollapse={onRequestCollapse}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    vi.useFakeTimers();
    const customMeasured = screen.getByLabelText("Measured");
    fireEvent.focus(customMeasured);
    fireEvent.click(screen.getByRole("button", { name: "At clinic" }));
    fireEvent.blur(customMeasured, { relatedTarget: null });
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not blur-collapse when clicking a fever pattern chip", () => {
    const onRequestCollapse = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.measuredBy = "Home";

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feverCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feverCard}
          onPatch={vi.fn()}
          onRemove={vi.fn()}
          onRequestCollapse={onRequestCollapse}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    vi.useFakeTimers();
    const input = screen.getByLabelText("Temperature in degrees Fahrenheit");
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", { name: "Comes and goes" }));
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // Permanent contract: the card never auto-collapses from focus/blur. Clicking
  // any focusable control outside the card (e.g. the "Free-text notes" section
  // header, another complaint's header) must leave the open card untouched.
  // Collapse happens only via explicit affordances (chevron / name / lip /
  // Escape) or accordion switching, which ComplaintList owns.
  it("does not collapse when focus leaves the card to an outside control", () => {
    const onRequestCollapse = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.measuredBy = "Home";

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, feverCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={feverCard}
          onPatch={vi.fn()}
          onRemove={vi.fn()}
          onRequestCollapse={onRequestCollapse}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    const outside = document.createElement("button");
    outside.setAttribute("aria-label", "Toggle free-text notes");
    document.body.appendChild(outside);

    vi.useFakeTimers();
    const input = screen.getByLabelText("Temperature in degrees Fahrenheit");
    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: outside });
    act(() => {
      vi.runAllTimers();
    });
    expect(onRequestCollapse).not.toHaveBeenCalled();

    outside.remove();
    vi.useRealTimers();
  });

  it("steps fever temperature with increment and decrement arrows", () => {
    const onPatch = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";
    feverCard.measuredBy = "Home";
    feverCard.temperature = 38.5;
    feverCard.temperatureUnit = "C";
    feverCard.feverGrade = "moderate";

    const { rerender } = renderCard(feverCard, { onPatch });

    fireEvent.click(screen.getByRole("button", { name: "Increase temperature" }));
    expect(onPatch).toHaveBeenCalledWith(1, {
      temperature: 38.6,
      temperatureUnit: "C",
      feverGrade: "moderate",
    });

    const steppedCard = { ...feverCard, temperature: 38.6 };
    rerender(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={{
          ...createEmptyRxFormFields(),
          complaints: [priorComplaint, steppedCard],
        }}
        autosaveEnabled={false}
        prescriptionIdRef={{ current: "rx-1" }}
        onPrescriptionCreated={() => {}}
      >
        <ComplaintCard
          index={1}
          value={steppedCard}
          onPatch={onPatch}
          onRemove={vi.fn()}
          isEditing
          token="test-token"
        />
      </RxFormProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Decrease temperature" }));
    expect(onPatch).toHaveBeenLastCalledWith(1, {
      temperature: 38.5,
      temperatureUnit: "C",
      feverGrade: "moderate",
    });
  });

  it("commits fever temperature on blur without clamping mid-keystroke", () => {
    const onPatch = vi.fn();
    const feverCard = createEmptyComplaint();
    feverCard.name = "Fever";

    renderCard(feverCard, { onPatch });

    const input = screen.getByLabelText("Temperature in degrees Fahrenheit");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.change(input, { target: { value: "101" } });
    expect(onPatch).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        temperature: 101,
        temperatureUnit: "F",
        feverGrade: "moderate",
      }),
    );
  });
});
