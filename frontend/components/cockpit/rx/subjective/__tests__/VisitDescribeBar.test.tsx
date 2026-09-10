import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VisitDescribeBar,
  VisitDescribeFormBar,
} from "@/components/cockpit/rx/subjective/VisitDescribeBar";
import { parseMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import {
  emptyVisitParseProposal,
  parseVisitDescription,
} from "@/lib/cockpit/visit-parse-orchestrator";
import { appendDictationFinal } from "@/lib/text/use-speech-recognition";
import {
  visitDescribeAccepted,
  visitDescribeShown,
} from "@/lib/telemetry/visit-describe";

type SpeechHandlers = {
  onFinal: (chunk: string) => void;
};

const speech = vi.hoisted(() => {
  const handlers: { current: SpeechHandlers | null } = { current: null };
  return { handlers };
});

const form = vi.hoisted(() => ({
  dispatch: vi.fn(),
  setField: vi.fn(),
  fields: {
    vitalsBpReadings: [] as unknown[],
    vitalsGlucoseReadings: [] as unknown[],
    diagnoses: [] as unknown[],
    investigationsOrders: "",
    examinationFindings: "Chest clear",
    advice: "Plenty of fluids",
    clinicalNotes: "",
  },
}));

vi.mock("@/lib/cockpit/visit-parse-orchestrator", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/cockpit/visit-parse-orchestrator")
    >();
  return {
    ...actual,
    parseVisitDescription: vi.fn(),
  };
});

vi.mock("@/lib/telemetry/visit-describe", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/telemetry/visit-describe")>();
  return {
    ...actual,
    visitDescribeShown: vi.fn(),
    visitDescribeAccepted: vi.fn(),
    visitDescribeDismissed: vi.fn(),
  };
});

vi.mock("@/lib/text/use-speech-recognition", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/text/use-speech-recognition")>();
  return {
    ...actual,
    isSpeechRecognitionSupported: () => true,
    useSpeechRecognition: (opts: SpeechHandlers) => {
      speech.handlers.current = opts;
      return { isListening: false, start: vi.fn(), stop: vi.fn() };
    },
  };
});

vi.mock("@/components/cockpit/rx/RxFormContext", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/cockpit/rx/RxFormContext")
    >();
  return {
    ...actual,
    useRxForm: () => ({
      dispatch: form.dispatch,
      setField: form.setField,
      state: { fields: form.fields },
    }),
  };
});

const parseVisit = vi.mocked(parseVisitDescription);

function barCallbacks() {
  return {
    onApplyDeterministic: vi.fn(),
    onAcceptComplaints: vi.fn(),
    onAcceptMedicines: vi.fn(),
    onAcceptVitals: vi.fn(),
    onAcceptDiagnoses: vi.fn(),
    onAcceptInvestigations: vi.fn(),
    onAcceptProse: vi.fn(),
    onKeepAsTyped: vi.fn(),
  };
}

function aiOnlyProposal() {
  return {
    ...emptyVisitParseProposal("Complaint: fever. Plan: azithro."),
    subjective: [{ name: "Fever", patch: {}, associated: [] }],
    plan: [{ name: "Azithromycin" }],
    subjectiveSource: ["ai" as const],
    planSource: ["ai" as const],
    planParsed: [null],
  };
}

describe("VisitDescribeBar (vnb-04)", () => {
  const callbacks = barCallbacks();

  beforeEach(() => {
    for (const fn of Object.values(callbacks)) fn.mockReset();
    parseVisit.mockReset();
    parseVisit.mockResolvedValue(aiOnlyProposal());
    vi.mocked(visitDescribeShown).mockReset();
    vi.mocked(visitDescribeAccepted).mockReset();
  });

  it("shows the dictate control after mount (SSR-safe)", async () => {
    render(<VisitDescribeBar token="tok" {...callbacks} />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Dictate visit" })
      ).toBeInTheDocument();
    });
  });

  it("does not write until accept; per-item accept hits one callback", async () => {
    render(<VisitDescribeBar token="tok" {...callbacks} />);
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, {
      target: { value: "Complaint: fever. Plan: azithro." },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Fever")).toBeInTheDocument();
    });
    expect(callbacks.onApplyDeterministic).not.toHaveBeenCalled();
    expect(callbacks.onAcceptComplaints).not.toHaveBeenCalled();
    expect(callbacks.onAcceptMedicines).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /^Add all$/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Fever" }));
    expect(callbacks.onAcceptComplaints).toHaveBeenCalledWith([
      { name: "Fever", patch: {}, associated: [] },
    ]);
    expect(callbacks.onAcceptMedicines).not.toHaveBeenCalled();
  });

  it("applies deterministic items on Enter and leaves AI as cards", async () => {
    const parsed = parseMedicineLine(
      "amlodipine 5 mg 2 tab od for 30 days after food"
    );
    parseVisit.mockResolvedValue({
      ...emptyVisitParseProposal("spo2 98. fever. Impression: viral fever."),
      vitals: [
        {
          source: "deterministic",
          option: {
            id: "set:vitalsSpo2:98",
            label: "Set SpO₂ to 98",
            focusField: "vitalsSpo2",
            writes: [{ key: "vitalsSpo2", value: 98 }],
          },
        },
      ],
      plan: [{ name: "amlodipine" }],
      planSource: ["deterministic"],
      planParsed: [parsed],
      assessment: [
        { source: "ai", suggestion: { code: "1A00", title: "Viral fever" } },
      ],
    });

    render(<VisitDescribeBar token="tok" {...callbacks} />);
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, {
      target: {
        value:
          "spo2 98. amlodipine 5 mg 2 tab od for 30 days after food. Impression: viral fever.",
      },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Viral fever")).toBeInTheDocument();
    });
    expect(callbacks.onApplyDeterministic).toHaveBeenCalledTimes(1);
    const applied = callbacks.onApplyDeterministic.mock.calls[0]?.[0];
    expect(applied.vitals[0]?.source).toBe("deterministic");
    expect(applied.plan[0]?.name).toBe("amlodipine");
    expect(applied.assessment).toEqual([]);
    expect(callbacks.onAcceptDiagnoses).not.toHaveBeenCalled();
    expect(callbacks.onAcceptVitals).not.toHaveBeenCalled();
    expect(screen.getByTestId("visit-parse-applied-summary")).toHaveTextContent(
      "Applied:"
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Viral fever" }));
    expect(callbacks.onAcceptDiagnoses).toHaveBeenCalledWith([
      { source: "ai", suggestion: { code: "1A00", title: "Viral fever" } },
    ]);
  });

  it("Keep as typed writes nothing through accept callbacks", async () => {
    render(<VisitDescribeBar token="tok" {...callbacks} />);
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, { target: { value: "fever and azithro" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Keep as typed/i })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Keep as typed/i }));
    expect(callbacks.onKeepAsTyped).toHaveBeenCalledWith(
      "Complaint: fever. Plan: azithro."
    );
    expect(callbacks.onAcceptComplaints).not.toHaveBeenCalled();
    expect(callbacks.onApplyDeterministic).not.toHaveBeenCalled();
  });

  it("three onFinal chunks then Enter parse once (vnb-01)", async () => {
    render(<VisitDescribeBar token="tok" {...callbacks} />);
    expect(speech.handlers.current).not.toBeNull();
    act(() => {
      speech.handlers.current!.onFinal("fever");
      speech.handlers.current!.onFinal("three days");
      speech.handlers.current!.onFinal("azithro");
    });
    expect(parseVisit).not.toHaveBeenCalled();

    const input = screen.getByLabelText("Describe this visit");
    await waitFor(() => {
      expect(input).toHaveValue(
        appendDictationFinal(
          appendDictationFinal("fever", "three days"),
          "azithro"
        )
      );
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(parseVisit).toHaveBeenCalledTimes(1);
    });
    expect(visitDescribeShown).toHaveBeenCalledWith(
      "dictated",
      expect.objectContaining({
        subjectiveAi: 1,
        planAi: 1,
      })
    );
  });

  it("typed Enter tags shown as typed (vnb-05)", async () => {
    render(<VisitDescribeBar token="tok" {...callbacks} />);
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, { target: { value: "fever" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(visitDescribeShown).toHaveBeenCalledWith(
        "typed",
        expect.objectContaining({ subjectiveAi: 1 })
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Fever" }));
    expect(visitDescribeAccepted).toHaveBeenCalledWith(
      "typed",
      "subjective",
      0,
      1
    );
  });

  it("embedded variant keeps the proposal in a popover", async () => {
    render(
      <VisitDescribeBar token="tok" variant="embedded" {...callbacks} />,
    );
    expect(screen.getByTestId("visit-describe-embedded")).toBeInTheDocument();
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, {
      target: { value: "Complaint: fever. Plan: azithro." },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Fever")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Fever" }));
    expect(callbacks.onAcceptComplaints).toHaveBeenCalledWith([
      { name: "Fever", patch: {}, associated: [] },
    ]);
  });
});

describe("VisitDescribeFormBar (vnb-04)", () => {
  beforeEach(() => {
    form.dispatch.mockReset();
    form.setField.mockReset();
    form.fields.advice = "Plenty of fluids";
    form.fields.examinationFindings = "Chest clear";
    form.fields.investigationsOrders = "";
    form.fields.diagnoses = [];
    parseVisit.mockReset();
  });

  it("writes deterministic vitals / medicines / prose on Enter and holds AI", async () => {
    const parsed = parseMedicineLine(
      "amlodipine 5 mg 2 tab od for 30 days after food"
    );
    parseVisit.mockResolvedValue({
      ...emptyVisitParseProposal("mixed"),
      vitals: [
        {
          source: "deterministic",
          option: {
            id: "set:vitalsSpo2:98",
            label: "Set SpO₂ to 98",
            focusField: "vitalsSpo2",
            writes: [{ key: "vitalsSpo2", value: 98 }],
          },
        },
      ],
      plan: [{ name: "amlodipine" }],
      planSource: ["deterministic"],
      planParsed: [parsed],
      prose: [{ source: "deterministic", target: "advice", text: "rest" }],
      assessment: [
        { source: "ai", suggestion: { code: "1A00", title: "Viral fever" } },
      ],
    });

    render(<VisitDescribeFormBar token="tok" />);
    const input = screen.getByLabelText("Describe this visit");
    fireEvent.change(input, { target: { value: "spo2 98 and rest" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Viral fever")).toBeInTheDocument();
    });
    expect(form.setField).toHaveBeenCalledWith("vitalsSpo2", 98);
    expect(form.setField).toHaveBeenCalledWith(
      "advice",
      "Plenty of fluids\nrest"
    );
    expect(form.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_MEDICINE",
        medicine: expect.objectContaining({ medicineName: "amlodipine" }),
      })
    );
    expect(form.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "ADD_DIAGNOSIS" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Viral fever" }));
    expect(form.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_DIAGNOSIS",
        diagnosis: expect.objectContaining({
          label: "Viral fever",
          code: "1A00",
        }),
      })
    );
  });
});
