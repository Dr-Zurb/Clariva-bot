import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintList } from "@/components/cockpit/rx/subjective/ComplaintList";
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

async function addTypedComplaint(text: string) {
  const capture = getCaptureInput();
  fireEvent.change(capture, { target: { value: text } });
  fireEvent.keyDown(capture, { key: "Enter" });
  await waitFor(() => {
    expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
  });
}

beforeEach(() => {
  prescriptionIdRef.current = "rx-1";
  vi.mocked(parseComplaintWithAI).mockReset();
});

describe("AI refine (subj-14)", () => {
  it("keeps Refine off the capture bar and on the card after Enter", async () => {
    renderList(<ComplaintList />);
    const capture = getCaptureInput();

    fireEvent.change(capture, { target: { value: "no fever but cough" } });
    expect(
      screen.queryByRole("button", { name: /Refine complaint with AI/i }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(capture, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
    expect(parseComplaintWithAI).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Refine complaint 1 with AI/i }),
    ).toBeInTheDocument();
  });

  it("refines a card and apply-all renames it to the first suggestion then adds extras", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([
        { name: "Fever", patch: { duration: "3 days" }, associated: [] },
        { name: "Cough", patch: {}, associated: [] },
        { name: "Loose motions", patch: {}, associated: [] },
      ]) as never,
    );

    renderList(<ComplaintList />);
    await addTypedComplaint("fever cough loose motions body ache");

    fireEvent.click(screen.getByRole("button", { name: /Refine complaint 1 with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/AI found 3 complaints/i)).toBeInTheDocument();
    });
    expect(parseComplaintWithAI).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({
        text: expect.stringMatching(/fever cough loose motions/i),
        tier: "escalation",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Apply all$/i }));

    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(3);
    });
    expect(
      screen.queryByRole("button", {
        name: /Fever cough loose motions body ache/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fever — tap to edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cough — tap to edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Loose motions — tap to edit/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI found 3 complaints/i)).not.toBeInTheDocument();
  });

  it("Apply renames the typed card and fills fields", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([
        { name: "Cough", patch: { duration: "2 days" }, associated: ["Nausea"] },
      ]) as never,
    );

    renderList(<ComplaintList />);
    await addTypedComplaint("no fever but cough");

    fireEvent.click(screen.getByRole("button", { name: /Refine complaint 1 with AI/i }));

    const applyBtn = await screen.findByRole("button", {
      name: /Apply Cough to this complaint/i,
    });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Complaint 1: Cough.*Nausea/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Duration")).toHaveValue("2 Days");
    expect(
      screen.queryByRole("button", { name: /No fever but cough/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/AI suggestion/i)).not.toBeInTheDocument();
  });

  it("Use name renames without adding extras", async () => {
    vi.mocked(parseComplaintWithAI).mockResolvedValue(
      aiSuccess([
        { name: "Cough", patch: { duration: "2 days" }, associated: ["Nausea"] },
      ]) as never,
    );

    renderList(<ComplaintList />);
    await addTypedComplaint("no fever but cough");

    fireEvent.click(screen.getByRole("button", { name: /Refine complaint 1 with AI/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Use name Cough/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Complaint 1: Cough/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Nausea/i })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
  });

  it("shows a note on API error and keeps the typed card", async () => {
    vi.mocked(parseComplaintWithAI).mockRejectedValue(new Error("503 unavailable"));

    renderList(<ComplaintList />);
    await addTypedComplaint("no fever but cough today");

    fireEvent.click(screen.getByRole("button", { name: /Refine complaint 1 with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t refine/i)).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
  });
});

describe("complaint Enter does not auto-call AI", () => {
  it("commits a gated negation line as typed without calling AI", async () => {
    renderList(<ComplaintList />);
    await addTypedComplaint("no fever but cough");

    expect(parseComplaintWithAI).not.toHaveBeenCalled();
    expect(screen.queryByText(/AI suggestion/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Keep as typed/i })).not.toBeInTheDocument();
  });

  it("commits a long multi-complaint line as one card", async () => {
    renderList(<ComplaintList />);
    await addTypedComplaint("fever cough loose motions body ache weakness");

    expect(parseComplaintWithAI).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    expect(screen.queryByText(/AI found/i)).not.toBeInTheDocument();
  });
});
