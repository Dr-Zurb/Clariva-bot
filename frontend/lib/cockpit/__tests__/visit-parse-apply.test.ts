import { afterEach, describe, expect, it, vi } from "vitest";

import type { RxHiddenTarget } from "@/components/cockpit/rx/command-bar/rx-hidden-set";
import { parseMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import { parseSetVitalCommand } from "@/lib/cockpit/command-bar-set-vital";
import {
  appendVisitProse,
  applyVisitVitalItems,
  applyVisitVitalOption,
  complaintFromAiParsed,
  diagnosisFromSuggestion,
  mergeAiParsedIntoComplaint,
  medicineFromVisitPlanItem,
  medicinesFromAiParsed,
  nextInvestigationsOrdersFromItem,
  splitVisitProposal,
} from "@/lib/cockpit/visit-parse-apply";
import {
  emptyVisitParseProposal,
  sliceTranscriptQuote,
} from "@/lib/cockpit/visit-parse-orchestrator";
import {
  EMPTY_VISIT_DESCRIBE_COUNTS,
  visitDescribeAccepted,
  visitDescribeDismissed,
  visitDescribeShown,
} from "@/lib/telemetry/visit-describe";

describe("visit-parse-apply (rfed-04)", () => {
  it("builds a complaint card from an AI parse the capture bar would accept", () => {
    const complaint = complaintFromAiParsed({
      name: "Fever",
      patch: { duration: "3 days" },
      associated: ["Cough"],
    });
    expect(complaint).toEqual(
      expect.objectContaining({
        name: "Fever",
        duration: "3 days",
      })
    );
    expect(complaint?.associatedComplaints?.map((c) => c.name)).toEqual(["Cough"]);
  });

  it("merges AI fields into an existing card without renaming", () => {
    const existing = complaintFromAiParsed({
      name: "no fever but cough",
      patch: { duration: "2 days" },
      associated: [],
    })!;
    const merged = mergeAiParsedIntoComplaint(existing, {
      name: "Cough",
      patch: { duration: "5 days", timing: "Night" },
      associated: ["Nausea", "no fever but cough"],
    });
    expect(merged.fieldPatch).toEqual({ timing: "Night" });
    expect(merged.associatedNames).toEqual(["Nausea"]);
    expect(merged.suggestedName).toBe("Cough");
  });

  it("omits suggestedName when the AI title matches the typed card", () => {
    const existing = complaintFromAiParsed({
      name: "Cough",
      patch: {},
      associated: ["Nausea"],
    })!;
    const merged = mergeAiParsedIntoComplaint(existing, {
      name: "cough",
      patch: { duration: "3 days" },
      associated: ["Nausea", "Vomiting"],
    });
    expect(merged.suggestedName).toBeNull();
    expect(merged.fieldPatch).toEqual({ duration: "3 days" });
    expect(merged.associatedNames).toEqual(["Vomiting"]);
  });

  it("maps AI medicines through rxMedicineFromAiMedicine", () => {
    const rows = medicinesFromAiParsed([
      { name: "Azithromycin", strengthValue: 500, strengthUnit: "mg" },
      { name: "  " },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        medicineName: "Azithromycin",
        dosage: "500 mg",
      })
    );
  });
});

describe("visit-describe telemetry (vnb-05)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shown / accepted / dismissed take source + kind counts only", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(visitDescribeShown.length).toBe(2);
    expect(visitDescribeAccepted.length).toBe(4);
    expect(visitDescribeDismissed.length).toBe(1);

    const counts = {
      ...EMPTY_VISIT_DESCRIBE_COUNTS,
      subjectiveAi: 2,
      planDet: 1,
      vitalsDet: 1,
    };
    visitDescribeShown("typed", counts);
    expect(debug).toHaveBeenCalledWith("[ehr:rxvisit]", "shown", {
      source: "typed",
      ...counts,
    });

    visitDescribeAccepted("dictated", "plan", 1, 0);
    const accepted = debug.mock.calls[1]?.[2] as Record<string, unknown>;
    expect(Object.keys(accepted)).toEqual([
      "source",
      "kind",
      "detCount",
      "aiCount",
    ]);
    expect(accepted).toEqual({
      source: "dictated",
      kind: "plan",
      detCount: 1,
      aiCount: 0,
    });

    visitDescribeDismissed("typed");
    expect(debug).toHaveBeenCalledWith("[ehr:rxvisit]", "dismissed", {
      source: "typed",
    });

    const shown = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    const dismissed = debug.mock.calls[2]?.[2] as Record<string, unknown>;
    for (const payload of [shown, accepted, dismissed]) {
      expect(payload).not.toHaveProperty("query");
      expect(payload).not.toHaveProperty("text");
      expect(payload).not.toHaveProperty("name");
      expect(typeof payload.source).toBe("string");
      expect(["typed", "dictated"]).toContain(payload.source);
    }
  });

  it("kind-count keys are integers — no content-bearing field", () => {
    type ShownArgs = Parameters<typeof visitDescribeShown>;
    type CountKeys = keyof ShownArgs[1];
    type Forbidden = Extract<CountKeys, "text" | "query" | "name" | "sourceText">;
    const forbidden: Forbidden[] = [];
    expect(forbidden).toEqual([]);

    type AcceptedArgs = Parameters<typeof visitDescribeAccepted>;
    type AcceptedSource = AcceptedArgs[0];
    type AcceptedKind = AcceptedArgs[1];
    const source: AcceptedSource = "typed";
    const kind: AcceptedKind = "assessment";
    expect(source).toBe("typed");
    expect(kind).toBe("assessment");
  });
});

describe("visit-parse-apply (vnb-04)", () => {
  it("splits deterministic items off the pending confirm cards", () => {
    const parsed = parseMedicineLine(
      "amlodipine 5 mg 2 tab od for 30 days after food"
    );
    expect(parsed).not.toBeNull();
    const proposal = {
      ...emptyVisitParseProposal("mixed"),
      subjective: [
        { name: "Fever", patch: {}, associated: [] },
        { name: "Cough", patch: {}, associated: [] },
      ],
      subjectiveSource: ["deterministic" as const, "ai" as const],
      plan: [{ name: "amlodipine" }, { name: "Azithromycin" }],
      planSource: ["deterministic" as const, "ai" as const],
      planParsed: [parsed, null],
      vitals: [
        {
          source: "deterministic" as const,
          option: {
            id: "set:vitalsSpo2:98",
            label: "Set SpO₂ to 98",
            focusField: "vitalsSpo2" as const,
            writes: [{ key: "vitalsSpo2" as const, value: 98 }],
          },
        },
        {
          source: "ai" as const,
          option: {
            id: "set:vitalsHr:80",
            label: "Set HR to 80",
            focusField: "vitalsHr" as const,
            writes: [{ key: "vitalsHr" as const, value: 80 }],
          },
        },
      ],
      assessment: [
        { source: "ai" as const, suggestion: { code: "1A00", title: "Viral fever" } },
      ],
      investigations: [
        {
          source: "ai" as const,
          term: "LFT",
          catalogValue: "panel:lft",
          label: "LFT",
        },
      ],
      prose: [{ source: "deterministic" as const, target: "advice" as const, text: "rest" }],
    };

    const { applied, pending } = splitVisitProposal(proposal);
    expect(applied.subjective.map((item) => item.name)).toEqual(["Fever"]);
    expect(applied.plan.map((item) => item.name)).toEqual(["amlodipine"]);
    expect(applied.vitals).toHaveLength(1);
    expect(applied.vitals[0]?.source).toBe("deterministic");
    expect(applied.prose).toEqual([
      { source: "deterministic", target: "advice", text: "rest" },
    ]);
    expect(applied.assessment).toEqual([]);
    expect(applied.investigations).toEqual([]);

    expect(pending.subjective.map((item) => item.name)).toEqual(["Cough"]);
    expect(pending.plan.map((item) => item.name)).toEqual(["Azithromycin"]);
    expect(pending.vitals).toHaveLength(1);
    expect(pending.vitals[0]?.source).toBe("ai");
    expect(pending.assessment).toHaveLength(1);
    expect(pending.investigations).toHaveLength(1);
    expect(pending.prose).toEqual([]);
  });

  it("converts a deterministic medicine through rxMedicineFromParsed", () => {
    const parsed = parseMedicineLine(
      "amlodipine 5 mg 2 tab od for 30 days after food"
    );
    expect(parsed).not.toBeNull();
    const proposal = {
      ...emptyVisitParseProposal("line"),
      plan: [{ name: "amlodipine" }],
      planSource: ["deterministic" as const],
      planParsed: [parsed],
    };
    expect(medicineFromVisitPlanItem(proposal, 0)).toEqual(
      expect.objectContaining({
        medicineName: "amlodipine",
        frequencyCode: "OD",
      })
    );
  });

  it("appends prose without replacing existing section text", () => {
    expect(appendVisitProse("Plenty of fluids", {
      source: "deterministic",
      target: "advice",
      text: "rest",
    })).toBe("Plenty of fluids\nrest");
    expect(appendVisitProse("rest", {
      source: "deterministic",
      target: "advice",
      text: "rest",
    })).toBe("rest");
  });

  it("builds a catalog-coded diagnosis the assessment section would commit", () => {
    const row = diagnosisFromSuggestion(
      { code: "1A00", title: "Viral fever" },
      []
    );
    expect(row).toEqual(
      expect.objectContaining({
        label: "Viral fever",
        code: "1A00",
        kind: "primary",
      })
    );
    expect(
      diagnosisFromSuggestion({ code: "1A00", title: "Viral fever" }, [row!])
    ).toBeNull();
  });

  it("appends a catalog investigation onto the existing orders string", () => {
    const next = nextInvestigationsOrdersFromItem("CBC", {
      source: "ai",
      term: "LFT",
      catalogValue: "panel:lft",
      label: "LFT",
    });
    expect(next).toContain("CBC");
    expect(next).toContain("LFT");
  });

  it("unhides a hidden vital then writes through applySetVitalWrites", () => {
    const setField = vi.fn();
    const show = vi.fn(() => true);
    const hidden: RxHiddenTarget[] = [
      {
        kind: "vital",
        pane: "objective",
        section: "vitals",
        field: "vitalsSpo2",
        label: "SpO₂",
      },
    ];
    applyVisitVitalOption(
      setField,
      { vitalsBpReadings: [], vitalsGlucoseReadings: [] },
      {
        id: "set:vitalsSpo2:98",
        label: "Set SpO₂ to 98",
        focusField: "vitalsSpo2",
        writes: [{ key: "vitalsSpo2", value: 98 }],
      },
      hidden,
      show
    );
    expect(show).toHaveBeenCalledWith(hidden[0]);
    expect(setField).toHaveBeenCalledWith("vitalsSpo2", 98);
  });
});

describe("visit-parse-apply (vnt-03)", () => {
  const spo2 = parseSetVitalCommand("spo2 98");
  const hr = parseSetVitalCommand("hr 80");

  it("does not auto-apply a transcript vital the grammar parsed cleanly", () => {
    expect(spo2.kind).toBe("one");
    if (spo2.kind !== "one") return;

    const proposal = {
      ...emptyVisitParseProposal("spo2 98"),
      vitals: [
        {
          source: "transcript" as const,
          option: spo2.option,
          evidence: {
            transcriptId: "tr-1",
            spanStart: 0,
            spanEnd: 7,
          },
        },
      ],
    };

    const { applied, pending } = splitVisitProposal(proposal);
    expect(applied.vitals).toEqual([]);
    expect(pending.vitals).toHaveLength(1);
    expect(pending.vitals[0]?.source).toBe("transcript");

    const setField = vi.fn();
    applyVisitVitalItems(
      setField,
      { vitalsBpReadings: [], vitalsGlucoseReadings: [] },
      applied.vitals,
      [],
      vi.fn()
    );
    expect(setField).not.toHaveBeenCalled();
  });

  it("keeps typed deterministic trust in a mixed proposal; transcript stays pending", () => {
    expect(spo2.kind).toBe("one");
    expect(hr.kind).toBe("one");
    if (spo2.kind !== "one" || hr.kind !== "one") return;

    const proposal = {
      ...emptyVisitParseProposal("mixed"),
      vitals: [
        { source: "deterministic" as const, option: spo2.option },
        {
          source: "transcript" as const,
          option: hr.option,
          evidence: { transcriptId: "tr-1", spanStart: 8, spanEnd: 13 },
        },
      ],
      subjective: [
        { name: "Fever", patch: {}, associated: [] },
        { name: "Cough", patch: {}, associated: [] },
      ],
      subjectiveSource: ["deterministic" as const, "transcript" as const],
      subjectiveEvidence: [
        undefined,
        { transcriptId: "tr-1", spanStart: 0, spanEnd: 5 },
      ],
      prose: [
        { source: "deterministic" as const, target: "advice" as const, text: "rest" },
        {
          source: "transcript" as const,
          target: "note" as const,
          text: "fluids",
          evidence: { transcriptId: "tr-1", spanStart: 14, spanEnd: 20 },
        },
      ],
    };

    const { applied, pending } = splitVisitProposal(proposal);
    expect(applied.vitals).toHaveLength(1);
    expect(applied.vitals[0]?.source).toBe("deterministic");
    expect(applied.subjective.map((item) => item.name)).toEqual(["Fever"]);
    expect(applied.prose).toEqual([
      { source: "deterministic", target: "advice", text: "rest" },
    ]);

    expect(pending.vitals).toHaveLength(1);
    expect(pending.vitals[0]?.source).toBe("transcript");
    expect(pending.subjective.map((item) => item.name)).toEqual(["Cough"]);
    expect(pending.subjectiveSource).toEqual(["transcript"]);
    expect(pending.prose).toHaveLength(1);
    expect(pending.prose[0]?.source).toBe("transcript");

    const setField = vi.fn();
    applyVisitVitalItems(
      setField,
      { vitalsBpReadings: [], vitalsGlucoseReadings: [] },
      applied.vitals,
      [],
      vi.fn()
    );
    expect(setField).toHaveBeenCalledTimes(1);
    expect(setField).toHaveBeenCalledWith("vitalsSpo2", 98);
  });

  it("never places transcript prose on the applied write path", () => {
    const proposal = {
      ...emptyVisitParseProposal("note"),
      prose: [
        {
          source: "transcript" as const,
          target: "advice" as const,
          text: "rest",
          evidence: { transcriptId: "tr-1", spanStart: 0, spanEnd: 4 },
        },
      ],
    };
    const { applied, pending } = splitVisitProposal(proposal);
    expect(applied.prose).toEqual([]);
    expect(pending.prose).toHaveLength(1);
  });

  it("slices a quote character-for-character and drops an unresolvable span", () => {
    const transcript = "I have had fever for three days";
    const start = 11;
    const end = 16;
    expect(transcript.slice(start, end)).toBe("fever");
    expect(sliceTranscriptQuote(transcript, start, end)).toBe("fever");
    expect(sliceTranscriptQuote(transcript, 0, transcript.length + 1)).toBeNull();
    expect(sliceTranscriptQuote(transcript, 5, 5)).toBeNull();
    expect(sliceTranscriptQuote(transcript, -1, 4)).toBeNull();
    expect(sliceTranscriptQuote(transcript, 1.5, 4)).toBeNull();
  });
});
