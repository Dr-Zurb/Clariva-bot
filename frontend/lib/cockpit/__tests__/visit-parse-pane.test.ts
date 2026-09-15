import { describe, expect, it } from "vitest";
import { paneIdsFromVisitProposal } from "@/lib/cockpit/visit-parse-pane";
import {
  emptyVisitParseProposal,
  type VisitParseProposal,
} from "@/lib/cockpit/visit-parse-orchestrator";

function withCounts(
  counts: Partial<
    Record<
      "subjective" | "plan" | "vitals" | "assessment" | "investigations" | "prose",
      number
    >
  >,
  proseTarget: "exam" | "advice" | "note" = "note",
): VisitParseProposal {
  const applied = emptyVisitParseProposal("x");
  const fill = <T>(n: number, item: T): T[] => Array.from({ length: n }, () => item);
  applied.subjective = fill(counts.subjective ?? 0, applied.subjective[0] ?? {
    name: "fever",
    patch: {},
    associated: [],
  });
  applied.plan = fill(counts.plan ?? 0, { name: "Amox" } as VisitParseProposal["plan"][number]);
  applied.vitals = fill(counts.vitals ?? 0, {} as VisitParseProposal["vitals"][number]);
  applied.assessment = fill(
    counts.assessment ?? 0,
    {} as VisitParseProposal["assessment"][number],
  );
  applied.investigations = fill(
    counts.investigations ?? 0,
    {} as VisitParseProposal["investigations"][number],
  );
  applied.prose = fill(counts.prose ?? 0, {
    source: "deterministic" as const,
    target: proseTarget,
    text: "note",
  });
  return applied;
}

describe("paneIdsFromVisitProposal", () => {
  it("maps describe-bar buckets onto cockpit pane ids", () => {
    expect(paneIdsFromVisitProposal(withCounts({ subjective: 1, plan: 1, vitals: 1, prose: 1 }, "exam")).sort()).toEqual(
      ["objective", "plan", "subjective"].sort(),
    );
  });

  it("folds investigations into the Rx pane", () => {
    expect(paneIdsFromVisitProposal(withCounts({ investigations: 1 }))).toEqual([
      "plan",
    ]);
  });
});
