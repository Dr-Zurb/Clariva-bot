import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AMENDMENT_BANNER_COPY,
  VisitNarrativeAmendmentHost,
} from "@/components/cockpit/rx/subjective/VisitNarrativeAmendment";
import { extractVisitNarrative } from "@/lib/api/visit-narrative-extract";
import { recordVisitNarrativeProvenance } from "@/lib/api/visit-narrative-provenance";
import { parseVisitDescription } from "@/lib/cockpit/visit-parse-orchestrator";
import {
  visitDescribeDismissed,
  visitDescribeTranscriptAccepted,
  visitDescribeTranscriptShown,
} from "@/lib/telemetry/visit-describe";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: "from=patients-v2&amendTranscript=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/appointments/appt-1",
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/api/visit-narrative-extract", () => ({
  extractVisitNarrative: vi.fn(),
}));

vi.mock("@/lib/api/visit-narrative-provenance", () => ({
  recordVisitNarrativeProvenance: vi.fn().mockResolvedValue({ recorded: true, id: "p1" }),
}));

vi.mock("@/lib/telemetry/visit-describe", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/telemetry/visit-describe")>();
  return {
    ...actual,
    visitDescribeTranscriptShown: vi.fn(),
    visitDescribeTranscriptAccepted: vi.fn(),
    visitDescribeDismissed: vi.fn(),
  };
});

vi.mock("@/lib/cockpit/visit-parse-orchestrator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/cockpit/visit-parse-orchestrator")>();
  return {
    ...actual,
    parseVisitDescription: vi.fn(),
  };
});

const form = vi.hoisted(() => ({
  dispatch: vi.fn(),
  setField: vi.fn(),
  fields: {
    vitalsBpReadings: [] as unknown[],
    vitalsGlucoseReadings: [] as unknown[],
    diagnoses: [] as unknown[],
    investigationsOrders: "",
    examinationFindings: "",
    advice: "",
    clinicalNotes: "",
  },
}));

vi.mock("@/components/cockpit/rx/RxFormContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/cockpit/rx/RxFormContext")>();
  return {
    ...actual,
    useRxForm: () => ({
      dispatch: form.dispatch,
      setField: form.setField,
      state: { fields: form.fields },
    }),
  };
});

vi.mock("@/components/cockpit/rx/command-bar/rx-hidden-set", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/cockpit/rx/command-bar/rx-hidden-set")>();
  return {
    ...actual,
    useRxHiddenTargets: () => [],
    showHiddenTarget: vi.fn(),
  };
});

const extract = vi.mocked(extractVisitNarrative);
const parse = vi.mocked(parseVisitDescription);
const provenance = vi.mocked(recordVisitNarrativeProvenance);
const shown = vi.mocked(visitDescribeTranscriptShown);
const accepted = vi.mocked(visitDescribeTranscriptAccepted);
const dismissed = vi.mocked(visitDescribeDismissed);

const TRANSCRIPT = "Patient said spo2 was ninety eight today.";

beforeEach(() => {
  nav.search =
    "from=patients-v2&amendTranscript=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  nav.replace.mockReset();
  form.dispatch.mockReset();
  form.setField.mockReset();
  extract.mockReset();
  parse.mockReset();
  provenance.mockClear();
  shown.mockClear();
  accepted.mockClear();
  dismissed.mockClear();
});

describe("VisitNarrativeAmendmentHost (vnt-04)", () => {
  it("renders nothing without the amendTranscript param", () => {
    nav.search = "from=patients-v2";
    const { container } = render(
      <VisitNarrativeAmendmentHost token="tok" />
    );
    expect(container).toBeEmptyDOMElement();
    expect(extract).not.toHaveBeenCalled();
  });

  it("shows VNT-Q1 copy and a per-item quote; Add writes through apply and provenance", async () => {
    extract.mockResolvedValue({
      status: "ready",
      transcriptId: "tr-1",
      transcriptChars: TRANSCRIPT.length,
      lines: [{ text: "spo2 98", spanStart: 13, spanEnd: 17 }],
      droppedCount: 0,
      overWindow: false,
      chunksUsed: 1,
      redactionApplied: true,
      transcriptText: TRANSCRIPT,
    });
    parse.mockResolvedValue({
      sourceText: "spo2 98",
      tier: "default",
      subjective: [],
      plan: [],
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
      assessment: [],
      investigations: [],
      prose: [],
      subjectiveSource: [],
      planSource: [],
      planParsed: [],
    });

    render(<VisitNarrativeAmendmentHost token="tok" />);

    expect(await screen.findByText(AMENDMENT_BANNER_COPY)).toBeInTheDocument();
    expect(screen.getByTestId("visit-parse-quote").textContent).toBe(
      `“${TRANSCRIPT.slice(13, 17)}”`
    );
    expect(form.setField).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(shown).toHaveBeenCalledWith(
        expect.objectContaining({ vitals: 1, subjective: 0 })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Add Set Oxygen Saturation/i }));
    expect(accepted).toHaveBeenCalledWith("vitals", 1);
    expect(form.setField).toHaveBeenCalledWith("vitalsSpo2", 98);
    await waitFor(() => {
      expect(provenance).toHaveBeenCalledWith(
        "tok",
        expect.objectContaining({
          consultationSessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          transcriptId: "tr-1",
          spanStart: 13,
          spanEnd: 17,
          targetKind: "vitals",
        })
      );
    });
  });

  it("fail-softs an empty extract to nothing-to-review and dismiss writes nothing", async () => {
    extract.mockResolvedValue({
      status: "failed",
      transcriptId: null,
      transcriptChars: 0,
      lines: [],
      droppedCount: 0,
      overWindow: false,
      chunksUsed: 0,
      redactionApplied: false,
      transcriptText: null,
    });

    render(<VisitNarrativeAmendmentHost token="tok" />);
    expect(
      await screen.findByText("Nothing to review from this recording.")
    ).toBeInTheDocument();
    expect(form.setField).not.toHaveBeenCalled();
    expect(form.dispatch).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(shown).toHaveBeenCalledWith(
        expect.objectContaining({
          subjective: 0,
          vitals: 0,
          assessment: 0,
          investigations: 0,
          plan: 0,
          prose: 0,
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(dismissed).toHaveBeenCalledWith("transcript");
    expect(nav.replace).toHaveBeenCalledWith(
      "/dashboard/appointments/appt-1?from=patients-v2",
      { scroll: false }
    );
    expect(form.setField).not.toHaveBeenCalled();
  });

  it("surfaces over_window instead of a draft", async () => {
    extract.mockResolvedValue({
      status: "over_window",
      transcriptId: "tr-1",
      transcriptChars: 99_000,
      lines: [],
      droppedCount: 0,
      overWindow: true,
      chunksUsed: 0,
      redactionApplied: false,
      transcriptText: "x",
    });
    render(<VisitNarrativeAmendmentHost token="tok" />);
    expect(
      await screen.findByText("Transcript longer than the extraction window.")
    ).toBeInTheDocument();
    expect(parse).not.toHaveBeenCalled();
    expect(form.setField).not.toHaveBeenCalled();
  });
});
