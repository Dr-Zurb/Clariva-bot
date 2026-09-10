import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchComplaints } from "@/lib/api/complaint-master";
import { parseComplaintWithAI } from "@/lib/api/complaint-parse";
import { resolveDiagnosisWithAI } from "@/lib/api/diagnosis-parse";
import { resolveInvestigationWithAI } from "@/lib/api/investigation-parse";
import { parseMedicineWithAI } from "@/lib/api/medicine-parse";
import {
  parseVisitDescription,
  stampTranscriptProposal,
} from "@/lib/cockpit/visit-parse-orchestrator";
import { splitVisitProposal } from "@/lib/cockpit/visit-parse-apply";

vi.mock("@/lib/api/complaint-parse", () => ({
  parseComplaintWithAI: vi.fn(),
}));

vi.mock("@/lib/api/medicine-parse", () => ({
  parseMedicineWithAI: vi.fn(),
}));

vi.mock("@/lib/api/diagnosis-parse", () => ({
  resolveDiagnosisWithAI: vi.fn(),
}));

vi.mock("@/lib/api/investigation-parse", () => ({
  resolveInvestigationWithAI: vi.fn(),
}));

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn(),
}));

const complaintParse = vi.mocked(parseComplaintWithAI);
const medicineParse = vi.mocked(parseMedicineWithAI);
const diagnosisResolve = vi.mocked(resolveDiagnosisWithAI);
const investigationResolve = vi.mocked(resolveInvestigationWithAI);
const catalogSearch = vi.mocked(searchComplaints);

function okComplaint(names: string[]) {
  return {
    success: true as const,
    data: {
      complaints: names.map((name) => ({ name, patch: {}, associated: [] })),
    },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function okMedicine(names: string[]) {
  return {
    success: true as const,
    data: { medicines: names.map((name) => ({ name })) },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function okDiagnosis(title: string) {
  return {
    success: true as const,
    data: { suggestions: [{ code: "1A00", title }] },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function okInvestigation(terms: string[]) {
  return {
    success: true as const,
    data: { candidates: terms.map((term) => ({ term })) },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function emptyCatalog() {
  return {
    success: true as const,
    data: { results: [] },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function catalogFever() {
  return {
    success: true as const,
    data: {
      results: [
        {
          id: "c-fever",
          name: "Fever",
          synonyms: ["pyrexia"],
          category: "fever" as const,
          created_at: "t",
          updated_at: "t",
        },
      ],
    },
    meta: { timestamp: "t", requestId: "r" },
  };
}

function expectNoAi() {
  expect(complaintParse).not.toHaveBeenCalled();
  expect(medicineParse).not.toHaveBeenCalled();
  expect(diagnosisResolve).not.toHaveBeenCalled();
  expect(investigationResolve).not.toHaveBeenCalled();
}

describe("parseVisitDescription (vnb-03)", () => {
  beforeEach(() => {
    complaintParse.mockReset();
    medicineParse.mockReset();
    diagnosisResolve.mockReset();
    investigationResolve.mockReset();
    catalogSearch.mockReset();
    complaintParse.mockResolvedValue(okComplaint(["Fever"]));
    medicineParse.mockResolvedValue(okMedicine(["Azithromycin"]));
    diagnosisResolve.mockResolvedValue(okDiagnosis("Viral fever"));
    investigationResolve.mockResolvedValue(okInvestigation(["LFT"]));
    catalogSearch.mockResolvedValue(emptyCatalog());
  });

  it("spo2 98 writes a deterministic vital with zero AI calls", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "spo2 98",
    });
    expectNoAi();
    expect(result.vitals).toHaveLength(1);
    expect(result.vitals[0]?.source).toBe("deterministic");
    expect(result.vitals[0]?.option.writes).toEqual([
      { key: "vitalsSpo2", value: 98 },
    ]);
    expect(result.subjective).toEqual([]);
    expect(result.plan).toEqual([]);
  });

  it("bp 120/80 is a deterministic vital with zero AI calls", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "bp 120/80",
    });
    expectNoAi();
    expect(result.vitals[0]?.source).toBe("deterministic");
    expect(result.vitals[0]?.option.writes).toEqual([
      { key: "vitalsBpSystolic", value: 120 },
      { key: "vitalsBpDiastolic", value: 80 },
    ]);
  });

  it("out-of-range spo2 does not invent a vital", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "spo2 200",
    });
    expect(result.vitals).toEqual([]);
  });

  it("clean medicine line is deterministic with zero AI calls", async () => {
    const line = "amlodipine 5 mg 2 tab od for 30 days after food";
    const result = await parseVisitDescription({ token: "tok", text: line });
    expectNoAi();
    expect(result.plan).toEqual([{ name: "amlodipine" }]);
    expect(result.planSource).toEqual(["deterministic"]);
    expect(result.planParsed[0]?.medicineName).toBe("amlodipine");
  });

  it("gate-failing medicine line goes to the medicine client", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "Plan: amlodipine 5 mg od subah le raha hai",
    });
    expect(medicineParse).toHaveBeenCalledTimes(1);
    expect(complaintParse).not.toHaveBeenCalled();
  });

  it("catalog complaint is deterministic with zero AI calls", async () => {
    catalogSearch.mockResolvedValue(catalogFever());
    const result = await parseVisitDescription({ token: "tok", text: "fever" });
    expectNoAi();
    expect(result.subjective).toEqual([
      { name: "Fever", patch: {}, associated: [] },
    ]);
    expect(result.subjectiveSource).toEqual(["deterministic"]);
  });

  it("free-text complaint goes to the complaint client", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "Complaint: weird head swimming sensation",
    });
    expect(complaintParse).toHaveBeenCalledTimes(1);
    expect(complaintParse.mock.calls[0]?.[1].text).toBe(
      "weird head swimming sensation"
    );
    expect(medicineParse).not.toHaveBeenCalled();
  });

  it("impression line goes to the diagnosis resolver as a single line", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "Impression: viral fever",
    });
    expect(diagnosisResolve).toHaveBeenCalledTimes(1);
    expect(diagnosisResolve).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ text: "viral fever" })
    );
    expect(diagnosisResolve.mock.calls[0]?.[1].text).not.toContain("Impression");
    expect(complaintParse).not.toHaveBeenCalled();
    expect(medicineParse).not.toHaveBeenCalled();
  });

  it("order line goes to the investigation resolver as a single line", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "Order: LFT",
    });
    expect(investigationResolve).toHaveBeenCalledTimes(1);
    expect(investigationResolve).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ text: "LFT" })
    );
    expect(result.investigations[0]?.catalogValue).toBe("panel:lft");
    expect(complaintParse).not.toHaveBeenCalled();
  });

  it("drops investigation terms that do not re-resolve against the catalog", async () => {
    investigationResolve.mockResolvedValueOnce(okInvestigation(["zzzzqqqww"]));
    const result = await parseVisitDescription({
      token: "tok",
      text: "Order: zzzzqqqww",
    });
    expect(result.investigations).toEqual([]);
  });

  it("advice is routed prose with no client calls", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "Advice: rest and fluids",
    });
    expectNoAi();
    expect(result.prose).toEqual([
      { source: "deterministic", target: "advice", text: "rest and fluids" },
    ]);
  });

  it("sends complaint slices to the complaint client only", async () => {
    const result = await parseVisitDescription({
      token: "tok",
      text: "Complaint: fever for 3 days. Plan: azithromycin 500 od.",
    });

    expect(complaintParse).toHaveBeenCalledTimes(1);
    expect(complaintParse).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        text: "fever for 3 days.",
        tier: "default",
      })
    );
    expect(complaintParse.mock.calls[0]?.[1].text).not.toContain("azithromycin");
    expect(result.subjective).toEqual([
      { name: "Fever", patch: {}, associated: [] },
    ]);
    expect(result.subjectiveSource).toEqual(["ai"]);
  });

  it("leftover path (no cues) calls both clients once with the same original text", async () => {
    const raw = "fever 3 days and azithromycin later";
    await parseVisitDescription({ token: "tok", text: raw });

    expect(complaintParse).toHaveBeenCalledTimes(1);
    expect(medicineParse).toHaveBeenCalledTimes(1);
    expect(complaintParse.mock.calls[0]?.[1].text).toBe(raw);
    expect(medicineParse.mock.calls[0]?.[1].text).toBe(raw);
  });

  it("exam is prose and impression is a diagnosis line — no complaint/medicine clients", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "Exam: chest clear. Impression: viral.",
    });
    expect(complaintParse).not.toHaveBeenCalled();
    expect(medicineParse).not.toHaveBeenCalled();
    expect(diagnosisResolve).toHaveBeenCalledTimes(1);
    expect(diagnosisResolve.mock.calls[0]?.[1].text).toBe("viral");
  });

  it("leftover prefix next to a cue is not the both-parsers path", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "looks unwell. Plan: azithromycin 500",
    });
    expect(complaintParse).not.toHaveBeenCalled();
    expect(medicineParse.mock.calls[0]?.[1].text ?? "").not.toBe(
      "looks unwell. Plan: azithromycin 500"
    );
  });

  it("mixed whole-visit paragraph fans out without leaking the paragraph to resolvers", async () => {
    const raw =
      "Complaint: fever 3 days. spo2 98. Impression: viral fever. Order: LFT. Plan: azithromycin 500 od. Advice: rest.";
    const result = await parseVisitDescription({ token: "tok", text: raw });

    expect(complaintParse).toHaveBeenCalledTimes(1);
    expect(complaintParse.mock.calls[0]?.[1].text).toBe("fever 3 days.");
    expect(diagnosisResolve).toHaveBeenCalledTimes(1);
    expect(diagnosisResolve.mock.calls[0]?.[1].text).toBe("viral fever");
    expect(diagnosisResolve.mock.calls[0]?.[1].text).not.toBe(raw);
    expect(investigationResolve).toHaveBeenCalledTimes(1);
    expect(investigationResolve.mock.calls[0]?.[1].text).toBe("LFT");
    expect(result.vitals[0]?.option.writes).toEqual([
      { key: "vitalsSpo2", value: 98 },
    ]);
    expect(result.prose).toEqual([
      { source: "deterministic", target: "advice", text: "rest." },
    ]);
  });

  it("one client reject leaves the other tab populated", async () => {
    medicineParse.mockRejectedValueOnce(new Error("503 unavailable"));
    const result = await parseVisitDescription({
      token: "tok",
      text: "Complaint: fever. Plan: something vernacular that needs ai parse here",
    });
    expect(result.subjective).toEqual([
      { name: "Fever", patch: {}, associated: [] },
    ]);
    expect(result.plan).toEqual([]);
  });

  it("diagnosis resolver reject does not sink complaints", async () => {
    diagnosisResolve.mockRejectedValueOnce(new Error("503 unavailable"));
    const result = await parseVisitDescription({
      token: "tok",
      text: "Complaint: fever for 3 days. Impression: viral.",
    });
    expect(result.subjective).toEqual([
      { name: "Fever", patch: {}, associated: [] },
    ]);
    expect(result.assessment).toEqual([]);
  });

  it("explicit refine uses the escalation tier", async () => {
    await parseVisitDescription({
      token: "tok",
      text: "Complaint: fever",
      refine: true,
    });
    expect(complaintParse).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ tier: "escalation" })
    );
  });

  it("empty text does not call any client", async () => {
    const result = await parseVisitDescription({ token: "tok", text: "   " });
    expectNoAi();
    expect(result).toEqual({
      sourceText: "   ",
      tier: "default",
      subjective: [],
      plan: [],
      vitals: [],
      assessment: [],
      investigations: [],
      prose: [],
      subjectiveSource: [],
      planSource: [],
      planParsed: [],
    });
  });
});

describe("stampTranscriptProposal (vnt-04)", () => {
  it("overrides a deterministic vital so the split will not auto-apply", async () => {
    const parsed = await parseVisitDescription({ token: "tok", text: "spo2 98" });
    expect(parsed.vitals[0]?.source).toBe("deterministic");
    const stamped = stampTranscriptProposal(parsed, {
      transcriptId: "tr-1",
      spanStart: 0,
      spanEnd: 7,
    });
    expect(stamped.vitals[0]?.source).toBe("transcript");
    const { applied, pending } = splitVisitProposal(stamped);
    expect(applied.vitals).toEqual([]);
    expect(pending.vitals).toHaveLength(1);
  });
});
