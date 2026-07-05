import { describe, expect, it } from "vitest";
import { ABD_EXAM_SUBSECTIONS } from "@/lib/cockpit/abd-exam-finding-schema";
import { CNS_EXAM_SUBSECTIONS } from "@/lib/cockpit/cns-exam-finding-schema";
import { CVS_EXAM_SUBSECTIONS } from "@/lib/cockpit/cvs-exam-finding-schema";
import {
  EXAM_CORE_SYSTEMS,
  isTeleconsult,
  listSubsectionsByFeasibility,
  resolveExamSystem,
  resolveInPersonSubsectionRemoteHint,
  resolveSubsectionRemoteFeasibility,
  teleconsultNormalLine,
} from "@/lib/cockpit/exam-schema";
import { GENERAL_EXAM_SUBSECTIONS } from "@/lib/cockpit/general-exam-finding-schema";
import { RESP_EXAM_SUBSECTIONS } from "@/lib/cockpit/resp-exam-finding-schema";

const IPPA_CONTACT_IDS = new Set(["auscultation", "palpation", "percussion"]);

const RENDERED_SUBSECTIONS_BY_SYSTEM: Record<
  string,
  readonly { id: string; remote?: "assessable" | "in_person_only" }[]
> = {
  general: GENERAL_EXAM_SUBSECTIONS,
  cvs: CVS_EXAM_SUBSECTIONS,
  resp: RESP_EXAM_SUBSECTIONS,
  abd: ABD_EXAM_SUBSECTIONS,
  cns: CNS_EXAM_SUBSECTIONS,
};

describe("exam remote feasibility (tc-01)", () => {
  it("resolveSubsectionRemoteFeasibility defaults omitted flag to assessable", () => {
    expect(resolveSubsectionRemoteFeasibility({})).toBe("assessable");
    expect(resolveSubsectionRemoteFeasibility({ remote: "assessable" })).toBe("assessable");
    expect(resolveSubsectionRemoteFeasibility({ remote: "in_person_only" })).toBe(
      "in_person_only",
    );
  });

  it("every rendered subsection resolves a feasibility", () => {
    for (const subsections of Object.values(RENDERED_SUBSECTIONS_BY_SYSTEM)) {
      for (const subsection of subsections) {
        expect(["assessable", "in_person_only"]).toContain(
          resolveSubsectionRemoteFeasibility(subsection),
        );
      }
    }
  });

  it("tags IPPA contact subsections as in_person_only", () => {
    for (const [systemId, subsections] of Object.entries(RENDERED_SUBSECTIONS_BY_SYSTEM)) {
      for (const subsection of subsections) {
        if (!IPPA_CONTACT_IDS.has(subsection.id)) continue;
        expect(resolveSubsectionRemoteFeasibility(subsection), `${systemId}/${subsection.id}`).toBe(
          "in_person_only",
        );
      }
    }
  });

  it("tags CVS palpation-only subsections as in_person_only", () => {
    for (const id of ["precordium", "jvp"] as const) {
      const subsection = CVS_EXAM_SUBSECTIONS.find((s) => s.id === id);
      expect(subsection).toBeDefined();
      expect(resolveSubsectionRemoteFeasibility(subsection!)).toBe("in_person_only");
    }
  });

  it("keeps CVS Pulse assessable (carries the vitals HR field, foregrounded)", () => {
    const pulse = CVS_EXAM_SUBSECTIONS.find((s) => s.id === "pulse");
    expect(pulse).toBeDefined();
    expect(resolveSubsectionRemoteFeasibility(pulse!)).toBe("assessable");
  });

  it("listSubsectionsByFeasibility partitions rendered subsections", () => {
    const respAssessable = listSubsectionsByFeasibility(RESP_EXAM_SUBSECTIONS, "assessable");
    const respInPerson = listSubsectionsByFeasibility(RESP_EXAM_SUBSECTIONS, "in_person_only");
    expect(respAssessable.map((s) => s.id)).toEqual(["oxygenation", "inspection"]);
    expect(respInPerson.map((s) => s.id)).toEqual(["auscultation", "palpation", "percussion"]);
    expect(respAssessable.length + respInPerson.length).toBe(RESP_EXAM_SUBSECTIONS.length);
  });

  it("teleconsultNormalLine returns scoped lines and falls back to normalLine", () => {
    expect(teleconsultNormalLine("resp")).toBe("No respiratory distress on inspection");
    expect(teleconsultNormalLine("cvs")).toBe("No raised JVP or peripheral edema on inspection");
    expect(teleconsultNormalLine("abd")).toBe("No abdominal distension on inspection");
    expect(teleconsultNormalLine("cns")).toBe("Alert and oriented on remote assessment");
    expect(teleconsultNormalLine("general")).toBe("Well appearing, not in distress");
    expect(teleconsultNormalLine("msk")).toBe("Within normal limits");
  });

  it("isTeleconsult treats absent/unknown as teleconsult and only in_clinic as false", () => {
    expect(isTeleconsult(null)).toBe(true);
    expect(isTeleconsult(undefined)).toBe(true);
    expect(isTeleconsult("video")).toBe(true);
    expect(isTeleconsult("voice")).toBe(true);
    expect(isTeleconsult("text")).toBe(true);
    expect(isTeleconsult("")).toBe(true);
    expect(isTeleconsult("in_clinic")).toBe(false);
  });

  it("exam-schema fallback remote flags match per-system schema flags (no drift)", () => {
    for (const core of EXAM_CORE_SYSTEMS) {
      const rendered = RENDERED_SUBSECTIONS_BY_SYSTEM[core.systemId];
      expect(rendered, core.systemId).toBeDefined();

      const fallbackById = new Map(core.subsections.map((s) => [s.id, s]));
      for (const subsection of rendered!) {
        const fallback = fallbackById.get(subsection.id);
        if (!fallback) continue;
        expect(
          resolveSubsectionRemoteFeasibility(subsection),
          `${core.systemId}/${subsection.id}`,
        ).toBe(resolveSubsectionRemoteFeasibility(fallback));
      }
    }
  });

  it("resolveExamSystem core entries expose teleconsultNormalLine when defined", () => {
    expect(resolveExamSystem("resp").teleconsultNormalLine).toBe(
      "No respiratory distress on inspection",
    );
    expect(resolveExamSystem("general").teleconsultNormalLine).toBeUndefined();
  });

  it("resolveInPersonSubsectionRemoteHint returns subsection-specific teleconsult guidance", () => {
    expect(resolveInPersonSubsectionRemoteHint("palpation")).toMatch(/not feasible remotely/i);
    expect(resolveInPersonSubsectionRemoteHint("auscultation")).toMatch(/teleconsult/i);
    expect(resolveInPersonSubsectionRemoteHint("meningeal")).toMatch(/teleconsult/i);
    expect(resolveInPersonSubsectionRemoteHint("unknown_subsection")).toMatch(/teleconsultation/i);

    for (const id of [
      "auscultation",
      "palpation",
      "percussion",
      "precordium",
      "jvp",
      "reflexes",
      "sensory",
      "meningeal",
      "other",
    ]) {
      const hint = resolveInPersonSubsectionRemoteHint(id);
      expect(hint.toLowerCase()).not.toContain("video");
    }
  });
});
