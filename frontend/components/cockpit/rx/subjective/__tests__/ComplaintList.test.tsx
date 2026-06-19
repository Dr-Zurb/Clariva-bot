import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyComplaint,
  createEmptyRxFormFields,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintList } from "@/components/cockpit/rx/subjective/ComplaintList";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import { searchComplaints } from "@/lib/api/complaint-master";
import * as complaintCardScroll from "@/lib/cockpit/complaint-card-scroll";

const mockUpdatePrescription = vi.fn().mockResolvedValue({ data: {} });

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    updatePrescription: (...args: unknown[]) => mockUpdatePrescription(...args),
    createPrescription: vi.fn(),
  };
});

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn(),
}));

const prescriptionIdRef = { current: "rx-1" as string | null };

function renderWithRxForm(
  ui: ReactElement,
  options: { autosaveEnabled?: boolean; initialComplaints?: Complaint[] } = {},
) {
  const fields = createEmptyRxFormFields();
  if (options.initialComplaints) {
    fields.complaints = options.initialComplaints;
  }

  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={fields}
      autosaveEnabled={options.autosaveEnabled ?? false}
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

function getChiefComplaintsSection() {
  return screen.getByLabelText("Chief complaints");
}

const SEARCH_CATALOG = [
  {
    id: "c-headache",
    name: "Headache",
    synonyms: [],
    category: "pain",
    created_at: "",
    updated_at: "",
  },
  {
    id: "c-heartburn",
    name: "Heartburn",
    synonyms: [],
    category: "default",
    created_at: "",
    updated_at: "",
  },
  {
    id: "c-body",
    name: "Body ache",
    synonyms: [],
    category: "pain",
    created_at: "",
    updated_at: "",
  },
  {
    id: "c-fever",
    name: "Fever",
    synonyms: [],
    category: "fever",
    created_at: "",
    updated_at: "",
  },
  {
    id: "c-chest",
    name: "Chest pain",
    synonyms: [],
    category: "pain",
    created_at: "",
    updated_at: "",
  },
  {
    id: "c-leg",
    name: "Leg pain",
    synonyms: [],
    category: "pain",
    created_at: "",
    updated_at: "",
  },
] as const;

function mockDefaultComplaintSearch() {
  vi.mocked(searchComplaints).mockImplementation(async (_token, query) => {
    const q = query.trim().toLowerCase();
    const exact = SEARCH_CATALOG.find((c) => c.name.toLowerCase() === q);
    const results = exact
      ? [exact]
      : SEARCH_CATALOG.filter((c) => c.name.toLowerCase().startsWith(q));
    return {
      success: true,
      data: { results: [...results] },
      meta: { timestamp: "", requestId: "" },
    };
  });
}

async function enterCaptureComplaint(name: string) {
  const capture = getCaptureInput();
  fireEvent.change(capture, { target: { value: name } });
  fireEvent.keyDown(capture, { key: "Enter" });
  await waitFor(() => {
    expect(screen.getByText(name)).toBeInTheDocument();
  });
  return capture;
}

describe("ComplaintList", () => {
  beforeEach(() => {
    mockUpdatePrescription.mockClear();
    prescriptionIdRef.current = "rx-1";
    mockDefaultComplaintSearch();
  });

  it("shows empty-state hint pointing at the capture bar", () => {
    renderWithRxForm(<ComplaintList />);
    expect(
      screen.getByText(/Type a complaint above and press Enter/i),
    ).toBeInTheDocument();
    expect(getChiefComplaintsSection()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /\+ Add complaint/i }),
    ).not.toBeInTheDocument();
  });

  it("adds a collapsed complaint via Enter on the capture bar", async () => {
    renderWithRxForm(<ComplaintList />);
    const capture = await enterCaptureComplaint("Headache");

    expect(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Complaint name")).not.toBeInTheDocument();
    expect(capture).toHaveValue("");
  });

  it("adds multiple complaints in sequence with focus retained on the bar", async () => {
    renderWithRxForm(<ComplaintList />);
    let capture = getCaptureInput();

    const names = ["Headache", "Heartburn", "Body ache", "Lethargy"];
    for (const name of names) {
      capture = await enterCaptureComplaint(name);
    }

    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("Heartburn")).toBeInTheDocument();
    expect(screen.getByText("Body ache")).toBeInTheDocument();
    expect(screen.getByText("Lethargy")).toBeInTheDocument();
    expect(document.activeElement).toBe(capture);
    expect(capture).toHaveValue("");
  });

  it("commits autocomplete match with category on Enter", async () => {
    vi.mocked(searchComplaints).mockResolvedValue({
      success: true,
      data: {
        results: [
          {
            id: "c-fever",
            name: "Fever",
            synonyms: [],
            category: "fever",
            created_at: "",
            updated_at: "",
          },
        ],
      },
      meta: { timestamp: "", requestId: "" },
    });

    renderWithRxForm(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "fe" } });
    fireEvent.focus(capture);

    await waitFor(() => {
      expect(screen.getByRole("option")).toBeInTheDocument();
    });

    fireEvent.keyDown(capture, { key: "Enter" });

    expect(
      screen.getByRole("button", { name: /Complaint 1: Fever — tap to edit/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Fever — tap to edit/i }),
    );
    expect(screen.getByLabelText("Pattern")).toBeInTheDocument();
  });

  it("keeps the catalog name but parses detail typed alongside the match", async () => {
    vi.mocked(searchComplaints).mockResolvedValue({
      success: true,
      data: {
        results: [
          {
            id: "c-shoulder",
            name: "Shoulder pain",
            synonyms: [],
            category: "pain",
            created_at: "",
            updated_at: "",
          },
        ],
      },
      meta: { timestamp: "", requestId: "" },
    });

    renderWithRxForm(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, {
      target: { value: "severe pain in shoulder for 3 days" },
    });
    fireEvent.keyDown(capture, { key: "Enter" });

    // Canonical catalog name wins as the card title…
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Complaint 1: Shoulder pain — tap to edit/i,
        }),
      ).toBeInTheDocument();
    });

    // …while severity + duration typed alongside it are still parsed onto the card.
    expect(screen.getByLabelText("Duration")).toHaveValue("3 Days");
    expect(screen.getByTestId("complaint-card-detail-summary")).toHaveTextContent(
      "Severe",
    );
  });

  it("shows an auto-filled indicator listing the parsed fields on a freshly captured card", async () => {
    renderWithRxForm(<ComplaintList />);
    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "severe headache for 3 days" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
      ).toBeInTheDocument();
    });

    // Compact marker (no full-width strip); its accessible name lists the fields.
    const marker = screen.getByRole("button", { name: /Auto-filled from your text/i });
    expect(marker).toHaveAccessibleName(/Severity/i);
    expect(marker).toHaveAccessibleName(/Duration/i);
  });

  it("does not show an auto-filled indicator for hydrated (saved) cards", () => {
    const initial = [
      {
        ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"),
        name: "Headache",
        duration: "3 Days",
        severity: "severe" as const,
      },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    expect(
      screen.queryByRole("button", { name: /Auto-filled from your text/i }),
    ).not.toBeInTheDocument();
  });

  it("re-parses trailing detail typed into an existing card's name (empty fields only)", async () => {
    const initial = [
      { ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"), name: "Headache" },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    const nameInput = screen.getByLabelText("Complaint name");
    fireEvent.change(nameInput, { target: { value: "Headache for 3 days" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Duration")).toHaveValue("3 Days");
    });
    expect(nameInput).toHaveValue("Headache for 3 days");
  });

  it("never overwrites a duration the doctor already set when re-parsing a name edit", async () => {
    const initial = [
      {
        ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"),
        name: "Headache",
        duration: "2 Days",
      },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    const nameInput = screen.getByLabelText("Complaint name");
    fireEvent.change(nameInput, { target: { value: "Headache for 3 days" } });

    // Give the name-derived effect a chance to run, then assert it was a no-op.
    await waitFor(() => expect(nameInput).toHaveValue("Headache for 3 days"));
    expect(screen.getByLabelText("Duration")).toHaveValue("2 Days");
  });

  it("focuses existing card instead of adding a duplicate", async () => {
    const initial = [
      { ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"), name: "Headache" },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "headache" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
    expect(screen.getByLabelText("Complaint name")).toHaveValue("Headache");
  });

  it("focuses existing card when reordered phrasing matches", async () => {
    const initial = [
      {
        ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"),
        name: "Shoulder pain",
      },
    ];
    vi.mocked(searchComplaints).mockResolvedValue({
      success: true,
      data: {
        results: [
          {
            id: "c-shoulder",
            name: "Shoulder pain",
            synonyms: [],
            category: "pain",
            created_at: "",
            updated_at: "",
          },
        ],
      },
      meta: { timestamp: "", requestId: "" },
    });

    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "pain in shoulder" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getAllByLabelText(/Drag complaint/i)).toHaveLength(1);
    });
    expect(screen.getByLabelText("Complaint name")).toHaveValue("Shoulder pain");
  });

  it("adds three complaints, edits attributes, reorders, and removes", async () => {
    const initial = [
      { ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"), name: "Headache" },
      { ...createEmptyComplaint("aaaa0002-0000-4000-8000-000000000002"), name: "Leg pain" },
      { ...createEmptyComplaint("aaaa0003-0000-4000-8000-000000000003"), name: "Fever" },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("Leg pain")).toBeInTheDocument();
    expect(screen.getByText("Fever")).toBeInTheDocument();

    const durationInput = screen.getAllByLabelText("Duration")[0]!;
    fireEvent.focus(durationInput);
    fireEvent.change(durationInput, { target: { value: "2" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "2 Days" }));

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Severe" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Collapse complaint 1$/i }),
    );

    await waitFor(() => {
      expect(durationInput).toHaveValue("2 Days");
      expect(screen.getByTestId("complaint-card-detail-summary")).toHaveTextContent("Severe");
    });

    const dragHandles = screen.getAllByLabelText(/Drag complaint/i);
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: (type: string) =>
        type === "application/x-complaint-main-index" ? "2" : "2",
    };
    const dropTarget = dragHandles[0]!.parentElement!.parentElement!;
    dropTarget.getBoundingClientRect = () => ({
      top: 0,
      height: 100,
      left: 0,
      right: 0,
      bottom: 100,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.dragStart(dragHandles[2]!, { dataTransfer });
    fireEvent.dragOver(dropTarget, { clientY: 5, dataTransfer });
    fireEvent.drop(dropTarget, { clientY: 5, dataTransfer });

    expect(screen.getByRole("button", { name: /Complaint 1: Fever/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Remove complaint 3/i }));
    expect(screen.queryByText("Leg pain")).not.toBeInTheDocument();
  });

  it("adds an associated symptom as a nested card when parent is expanded", () => {
    const initial = [
      {
        ...createEmptyComplaint("aaaa0001-0000-4000-8000-000000000001"),
        name: "Chest pain",
      },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Chest pain — tap to edit/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add breathlessness" }));

    expect(
      screen.getByRole("button", {
        name: /Associated symptom 1 of Chest pain: breathlessness/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add breathlessness" })).not.toBeInTheDocument();
  });

  it("collapses an expanded card via the header toggle", async () => {
    renderWithRxForm(<ComplaintList />);
    await enterCaptureComplaint("Headache");

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    expect(screen.getByLabelText("Complaint name")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^Collapse complaint 1$/i }),
    );

    expect(screen.queryByLabelText("Complaint name")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    ).toBeInTheDocument();
  });

  describe("post-collapse scroll", () => {
    beforeEach(() => {
      vi.spyOn(complaintCardScroll, "scrollComplaintCardHeaderIntoView").mockImplementation(
        () => {},
      );
      vi.spyOn(complaintCardScroll, "scrollComplaintCaptureIntoView").mockImplementation(
        () => {},
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("scrolls the capture bar into view on a deliberate collapse (header)", async () => {
      renderWithRxForm(<ComplaintList />);
      await enterCaptureComplaint("Headache");

      fireEvent.click(
        screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
      );
      vi.mocked(complaintCardScroll.scrollComplaintCaptureIntoView).mockClear();

      fireEvent.click(screen.getByRole("button", { name: /^Collapse complaint 1$/i }));

      expect(complaintCardScroll.scrollComplaintCaptureIntoView).toHaveBeenCalledTimes(1);
    });

    it("scrolls the capture bar into view on a deliberate collapse (bottom lip)", async () => {
      renderWithRxForm(<ComplaintList />);
      await enterCaptureComplaint("Headache");

      fireEvent.click(
        screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
      );
      vi.mocked(complaintCardScroll.scrollComplaintCaptureIntoView).mockClear();

      fireEvent.click(
        screen.getByRole("button", { name: /^Finish and collapse complaint 1$/i }),
      );

      expect(complaintCardScroll.scrollComplaintCaptureIntoView).toHaveBeenCalledTimes(1);
    });

    it("does not collapse or scroll when focus leaves the card (no blur-collapse)", async () => {
      renderWithRxForm(<ComplaintList />);
      await enterCaptureComplaint("Headache");

      fireEvent.click(
        screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
      );
      vi.mocked(complaintCardScroll.scrollComplaintCaptureIntoView).mockClear();

      const complaintName = screen.getByLabelText("Complaint name");
      const capture = screen.getByLabelText("Add chief complaint");
      // Focus leaving the card (capture bar, a section header like "Free-text
      // notes", another complaint, etc.) must NOT collapse the open card —
      // collapse is explicit-only (chevron / lip / Escape) or accordion switch.
      fireEvent.focus(complaintName);
      fireEvent.blur(complaintName, { relatedTarget: capture });

      expect(screen.getByLabelText("Complaint name")).toBeInTheDocument();
      expect(complaintCardScroll.scrollComplaintCaptureIntoView).not.toHaveBeenCalled();
    });
  });

  it("collapses an expanded card via the bottom lip", async () => {
    renderWithRxForm(<ComplaintList />);
    await enterCaptureComplaint("Headache");

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    expect(screen.getByLabelText("Complaint name")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^Finish and collapse complaint 1$/i }),
    );

    expect(screen.queryByLabelText("Complaint name")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    ).toBeInTheDocument();
  });

  it("adds an associated symptom from a category suggestion chip", () => {
    const initial = [
      {
        ...createEmptyComplaint("aaaa0002-0000-4000-8000-000000000002"),
        name: "Headache",
      },
    ];
    renderWithRxForm(<ComplaintList />, { initialComplaints: initial });

    fireEvent.click(
      screen.getByRole("button", { name: /Complaint 1: Headache — tap to edit/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add light hurts" }));

    expect(
      screen.getByRole("button", {
        name: /Associated symptom 1 of Headache: light hurts/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add light hurts" })).not.toBeInTheDocument();
  });

  it("fires autosave after capturing a complaint", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithRxForm(<ComplaintList />, { autosaveEnabled: true });

    const capture = getCaptureInput();
    fireEvent.change(capture, { target: { value: "Cough" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    await vi.advanceTimersByTimeAsync(1600);

    await waitFor(() => {
      expect(mockUpdatePrescription).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });
});

describe("SubjectiveSection", () => {
  it("renders complaint list and collapsed free-text fallback", () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);

    expect(getChiefComplaintsSection()).toBeInTheDocument();
    expect(screen.getByText("Free-text notes (optional)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Free-text notes (optional)"));
    expect(screen.getByLabelText("Additional history notes")).toBeInTheDocument();
  });
});
