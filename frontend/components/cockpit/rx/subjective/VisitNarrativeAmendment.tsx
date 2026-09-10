/**
 * Chart amendment host (vnt-04).
 *
 * Opens from the consult timeline when a session has a completed transcript.
 * Proposes through VisitParseProposal (evidence tier). Writes only via
 * visit-parse-apply → RxFormContext (VNT-D5). VisitDescribeBar is untouched.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { extractVisitNarrative } from "@/lib/api/visit-narrative-extract";
import { recordVisitNarrativeProvenance } from "@/lib/api/visit-narrative-provenance";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  showHiddenTarget,
  useRxHiddenTargets,
} from "@/components/cockpit/rx/command-bar/rx-hidden-set";
import { VisitParseProposal } from "@/components/cockpit/rx/subjective/VisitParseProposal";
import {
  applyVisitProseItems,
  applyVisitVitalItems,
  complaintFromAiParsed,
  diagnosisFromSuggestion,
  isVisitProposalEmpty,
  medicineFromVisitPlanItem,
  medicinesFromAiParsed,
  nextInvestigationsOrdersFromItem,
  splitVisitProposal,
} from "@/lib/cockpit/visit-parse-apply";
import {
  emptyVisitParseProposal,
  proposalFromTranscriptExtract,
  type VisitParseProposal as VisitParseProposalDto,
  type VisitParseTabId,
  type VisitTranscriptEvidence,
} from "@/lib/cockpit/visit-parse-orchestrator";
import {
  readAmendTranscriptSessionId,
  stripAmendTranscriptParam,
} from "@/lib/cockpit/visit-narrative-amendment";
import {
  EMPTY_VISIT_TRANSCRIPT_COUNTS,
  visitDescribeDismissed,
  visitDescribeTranscriptAccepted,
  visitDescribeTranscriptShown,
  type VisitTranscriptKindCounts,
} from "@/lib/telemetry/visit-describe";

export const AMENDMENT_BANNER_COPY =
  "Amending this visit's chart from the recording. Items you add go on this consult's record. A prescription PDF already sent to the patient is not updated.";

function transcriptShownCounts(
  proposal: VisitParseProposalDto | null
): VisitTranscriptKindCounts {
  if (!proposal) return EMPTY_VISIT_TRANSCRIPT_COUNTS;
  return {
    subjective: proposal.subjective.length,
    vitals: proposal.vitals.length,
    assessment: proposal.assessment.length,
    investigations: proposal.investigations.length,
    plan: proposal.plan.length,
    prose: proposal.prose.length,
  };
}

function evidenceFor(
  proposal: VisitParseProposalDto,
  tab: VisitParseTabId,
  index: number
): VisitTranscriptEvidence | undefined {
  if (tab === "subjective") return proposal.subjectiveEvidence?.[index];
  if (tab === "plan") return proposal.planEvidence?.[index];
  if (tab === "vitals") return proposal.vitals[index]?.evidence;
  if (tab === "assessment") return proposal.assessment[index]?.evidence;
  if (tab === "investigations") return proposal.investigations[index]?.evidence;
  return proposal.prose[index]?.evidence;
}

export function VisitNarrativeAmendmentHost({
  token,
}: {
  token: string;
  appointmentId?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sessionId = readAmendTranscriptSessionId(searchParams);
  if (!sessionId) return null;
  return (
    <VisitNarrativeAmendmentPanel
      token={token}
      sessionId={sessionId}
      onClose={() => {
        const next = stripAmendTranscriptParam(searchParams.toString());
        router.replace(`${pathname}${next}`, { scroll: false });
      }}
    />
  );
}

function VisitNarrativeAmendmentPanel({
  token,
  sessionId,
  onClose,
}: {
  token: string;
  sessionId: string;
  onClose: () => void;
}) {
  const { dispatch, setField, state } = useRxForm();
  const hidden = useRxHiddenTargets();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [proposal, setProposal] = useState<VisitParseProposalDto | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [headline, setHeadline] = useState("Reading the recording…");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setProposal(null);
    setHeadline("Reading the recording…");

    void (async () => {
      const extract = await extractVisitNarrative(token, {
        consultationSessionId: sessionId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (extract.status === "over_window") {
        setHeadline("Transcript longer than the extraction window.");
        setProposal(emptyVisitParseProposal());
        setStatus("ready");
        visitDescribeTranscriptShown(EMPTY_VISIT_TRANSCRIPT_COUNTS);
        return;
      }
      if (
        extract.status !== "ready" ||
        !extract.transcriptId ||
        !extract.transcriptText ||
        extract.lines.length === 0
      ) {
        setHeadline("Nothing to review from this recording.");
        setProposal(emptyVisitParseProposal());
        setStatus("ready");
        visitDescribeTranscriptShown(EMPTY_VISIT_TRANSCRIPT_COUNTS);
        return;
      }

      const built = await proposalFromTranscriptExtract({
        token,
        transcriptId: extract.transcriptId,
        transcriptText: extract.transcriptText,
        lines: extract.lines,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const { pending } = splitVisitProposal(built);
      const next = isVisitProposalEmpty(pending)
        ? emptyVisitParseProposal()
        : pending;
      setTranscriptText(extract.transcriptText);
      setProposal(next);
      setHeadline(
        isVisitProposalEmpty(pending)
          ? "Nothing to review from this recording."
          : AMENDMENT_BANNER_COPY
      );
      setStatus("ready");
      visitDescribeTranscriptShown(transcriptShownCounts(next));
    })().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      setHeadline("Nothing to review from this recording.");
      setProposal(emptyVisitParseProposal());
      setStatus("ready");
      visitDescribeTranscriptShown(EMPTY_VISIT_TRANSCRIPT_COUNTS);
    });

    return () => controller.abort();
  }, [sessionId, token]);

  const recordProvenance = useCallback(
    (tab: VisitParseTabId, index: number, createdRowId?: string) => {
      if (!proposal) return;
      const evidence = evidenceFor(proposal, tab, index);
      if (!evidence) return;
      void recordVisitNarrativeProvenance(token, {
        consultationSessionId: sessionId,
        transcriptId: evidence.transcriptId,
        spanStart: evidence.spanStart,
        spanEnd: evidence.spanEnd,
        targetKind: tab,
        createdRowId,
      }).catch(() => undefined);
    },
    [proposal, sessionId, token]
  );

  const finishOrSet = useCallback(
    (next: VisitParseProposalDto) => {
      setProposal(isVisitProposalEmpty(next) ? emptyVisitParseProposal() : next);
    },
    []
  );

  const handleAdd = useCallback(
    (tab: VisitParseTabId, index: number) => {
      if (!proposal) return;
      if (tab === "subjective") {
        const item = proposal.subjective[index];
        if (!item) return;
        visitDescribeTranscriptAccepted("subjective", 1);
        const complaint = complaintFromAiParsed(item);
        if (complaint) dispatch({ type: "ADD_COMPLAINT", complaint });
        recordProvenance(tab, index, complaint?.id);
        finishOrSet({
          ...proposal,
          subjective: proposal.subjective.filter((_, i) => i !== index),
          subjectiveSource: proposal.subjectiveSource.filter((_, i) => i !== index),
          subjectiveEvidence: proposal.subjectiveEvidence?.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "plan") {
        const item = proposal.plan[index];
        if (!item) return;
        visitDescribeTranscriptAccepted("plan", 1);
        const parsed = medicineFromVisitPlanItem(proposal, index);
        const rows = parsed ? [parsed] : medicinesFromAiParsed([item]);
        for (const row of rows) dispatch({ type: "ADD_MEDICINE", medicine: row });
        recordProvenance(tab, index);
        finishOrSet({
          ...proposal,
          plan: proposal.plan.filter((_, i) => i !== index),
          planSource: proposal.planSource.filter((_, i) => i !== index),
          planParsed: proposal.planParsed.filter((_, i) => i !== index),
          planEvidence: proposal.planEvidence?.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "vitals") {
        const item = proposal.vitals[index];
        if (!item) return;
        visitDescribeTranscriptAccepted("vitals", 1);
        applyVisitVitalItems(setField, state.fields, [item], hidden, showHiddenTarget);
        recordProvenance(tab, index);
        finishOrSet({
          ...proposal,
          vitals: proposal.vitals.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "assessment") {
        const item = proposal.assessment[index];
        if (!item) return;
        visitDescribeTranscriptAccepted("assessment", 1);
        const row = diagnosisFromSuggestion(item.suggestion, state.fields.diagnoses);
        if (row) dispatch({ type: "ADD_DIAGNOSIS", diagnosis: row });
        recordProvenance(tab, index, row?.id);
        finishOrSet({
          ...proposal,
          assessment: proposal.assessment.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "investigations") {
        const item = proposal.investigations[index];
        if (!item) return;
        visitDescribeTranscriptAccepted("investigations", 1);
        const next = nextInvestigationsOrdersFromItem(
          state.fields.investigationsOrders,
          item
        );
        if (next !== state.fields.investigationsOrders) {
          setField("investigationsOrders", next);
        }
        recordProvenance(tab, index);
        finishOrSet({
          ...proposal,
          investigations: proposal.investigations.filter((_, i) => i !== index),
        });
        return;
      }
      const item = proposal.prose[index];
      if (!item) return;
      visitDescribeTranscriptAccepted("prose", 1);
      applyVisitProseItems(setField, state.fields, [item]);
      recordProvenance(tab, index);
      finishOrSet({
        ...proposal,
        prose: proposal.prose.filter((_, i) => i !== index),
      });
    },
    [
      dispatch,
      finishOrSet,
      hidden,
      proposal,
      recordProvenance,
      setField,
      state.fields,
    ]
  );

  const handleAddTab = useCallback((_tab: VisitParseTabId) => {
    // Transcript groups never expose Add all (vnt-03). No bulk path here.
  }, []);

  return (
    <div
      data-testid="visit-narrative-amendment"
      className="mb-2 space-y-1.5 rounded-md border border-amber-500/50 bg-amber-50/80 p-2 dark:bg-amber-950/30"
    >
      <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
        {headline}
      </p>
      <VisitParseProposal
        status={status === "loading" ? "loading" : "ready"}
        proposal={proposal}
        transcriptText={transcriptText}
        onAdd={handleAdd}
        onAddTab={handleAddTab}
        onDismiss={() => {
          visitDescribeDismissed("transcript");
          onClose();
        }}
      />
    </div>
  );
}
