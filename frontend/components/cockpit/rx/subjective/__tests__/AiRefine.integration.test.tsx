import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintList } from "@/components/cockpit/rx/subjective/ComplaintList";
import { searchComplaints } from "@/lib/api/complaint-master";
import { parseComplaintWithAI } from "@/lib/api/complaint-parse";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    updatePrescription: vi.fn().mockResolvedValue({ data: {} }),
    createPrescription: vi.fn(),
  };
});

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn(async () => ({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  })),
}));

vi.mock("@/lib/api/complaint-parse", () => ({
  parseComplaintWithAI: vi.fn(),
}));

const prescriptionIdRef = { current: "rx-1" as string | null };

function renderList(ui: ReactElement, initialComplaints?: Complaint[]) {
  const fields = createEmptyRxFormFields();
  if (initialComplaints) fields.complaints = initialComplaints;
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

function getCaptureInput() {
  return screen.getByRole("combobox", { name: /Add chief complaint/i });
}

function aiSuccess(complaints: unknown[]) {
  return {
    success: true as const,
    data: { complaints },
    meta: { timestamp: "", requestId: "" },
  };
}

beforeEach(() => {
  prescriptionIdRef.current = "rx-1";
  vi.mocked(parseComplaintWithAI).mockReset();
});

describe("AI refine (subj-14)", () => {
  it("hides the Refine button until the line has enough words", () => {
    renderList(<ComplaintList />);
    const capture = getCaptureInput();

    fireEvent.change(capture, { target: { value: "pain" } });
    expect(
      screen.queryByRole("button", { name: /Refine complaint with AI/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(capture, { target: { value: "no fever but cough" } });
    expect(
      screen.getByRole("button", { name: /Refine complaint with AI/i }),
    ).toBeInTheDocument();
  });

  it("refines a messy line and adds all detected complaints on confirm", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([
        { name: "Fever", patch: { duration: "3 days" }, associated: [] },
        { name: "Cough", patch: {}, associated: [] },
        { name: "Loose motions", patch: {}, associated: [] },
      ]) as never,
    );

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "fever cough loose motions 3 days" } });

    fireEvent.click(screen.getByRole("button", { name: /Refine complaint with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/AI found 3 complaints/i)).toBeInTheDocument();
    });
    expect(parseComplaintWithAI).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ text: "fever cough loose motions 3 days", tier: "escalation" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Add all$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Complaint 1: Fever — tap to edit/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Complaint 2: Cough — tap to edit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Complaint 3: Loose motions — tap to edit/i }),
    ).toBeInTheDocument();

    // Proposal panel dismissed after adding all.
    expect(screen.queryByText(/AI found 3 complaints/i)).not.toBeInTheDocument();
  });

  it("adds a single suggested complaint and clears the panel", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([{ name: "Burning in stomach", patch: { duration: "5 days" }, associated: ["Nausea"] }]) as never,
    );

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "pet me jalan 5 din se" } });
    fireEvent.click(screen.getByRole("button", { name: /Refine complaint with AI/i }));

    const addBtn = await screen.findByRole("button", { name: /Add Burning in stomach/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Complaint 1: Burning in stomach/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Add Burning in stomach/i })).not.toBeInTheDocument();
  });

  it("degrades silently on API error — shows a note, adds no cards", async () => {
    vi.mocked(parseComplaintWithAI).mockRejectedValue(new Error("503 unavailable"));

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "no fever but cough today" } });
    fireEvent.click(screen.getByRole("button", { name: /Refine complaint with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t refine/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /Complaint 1:/i }),
    ).not.toBeInTheDocument();
  });
});

describe("AI auto-gate on Enter (subj-14)", () => {
  it("auto-fires AI (default tier) on a gated negation line; 'Keep as typed' commits the literal line", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([{ name: "Cough", patch: {}, associated: [] }]) as never,
    );

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "no fever but cough" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    // Auto-gate uses the cheaper default tier (not escalation).
    await waitFor(() => {
      expect(parseComplaintWithAI).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({ text: "no fever but cough", tier: "default" }),
      );
    });

    // Proposal shown; nothing committed yet.
    await screen.findByText(/AI suggestion/i);
    expect(screen.queryByLabelText(/Drag complaint/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Keep as typed/i }));

    // The doctor's literal line is committed — exactly one card, never lost.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
  });

  it("auto-fires AI on a long multi-complaint line; 'Add all' adds N cards (no literal duplicate)", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([
        { name: "Fever", patch: {}, associated: [] },
        { name: "Cough", patch: {}, associated: [] },
        { name: "Loose motions", patch: {}, associated: [] },
      ]) as never,
    );

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, {
      target: { value: "fever cough loose motions body ache weakness" },
    });
    fireEvent.keyDown(capture, { key: "Enter" });

    await screen.findByText(/AI found 3 complaints/i);
    // No literal card committed while the proposal is open.
    expect(screen.queryByLabelText(/Drag complaint/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Add all$/i }));

    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(3);
    });
  });

  it("degrades to the literal card when the auto-gate AI call errors", async () => {
    vi.mocked(parseComplaintWithAI).mockRejectedValue(new Error("503"));

    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "no fever but cough" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    // Silent degrade: literal line committed, no lingering proposal.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
    expect(screen.queryByText(/AI suggestion/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI found/i)).not.toBeInTheDocument();
  });

  it("does NOT auto-fire AI on a clean line the rules already handle", async () => {
    renderList(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "severe headache for 3 days" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
    expect(parseComplaintWithAI).not.toHaveBeenCalled();
  });
});
