import type {
  VisitParseProposal,
  VisitProseItem,
} from "@/lib/cockpit/visit-parse-orchestrator";

/**
 * Map a describe-bar proposal onto cockpit pane ids so the palette chip
 * (and leaf tab) can flash. Investigations live in the Plan/Rx tab.
 * Never include raw text — pane ids only.
 */
export function paneIdsFromVisitProposal(
  applied: Pick<
    VisitParseProposal,
    | "subjective"
    | "plan"
    | "vitals"
    | "assessment"
    | "investigations"
    | "prose"
  >,
): string[] {
  const ids = new Set<string>();
  if (applied.subjective.length > 0) ids.add("subjective");
  if (applied.plan.length > 0) ids.add("plan");
  if (applied.vitals.length > 0) ids.add("objective");
  if (applied.assessment.length > 0) ids.add("assessment");
  if (applied.investigations.length > 0) ids.add("plan");
  for (const item of applied.prose) {
    ids.add(paneIdForProse(item));
  }
  return Array.from(ids);
}

function paneIdForProse(item: VisitProseItem): string {
  if (item.target === "exam") return "objective";
  if (item.target === "advice") return "plan";
  return "subjective";
}
