/**
 * Shared paragraph + mic entry for describe-visit (vnb-01 / vnb-04).
 *
 * One mount per host. Parse fires on Enter / Done — not per speech-final.
 * Deterministic hits apply immediately; AI groups wait for accept (VNB-D4).
 * VisitDescribeFormBar wires apply through existing form writers.
 */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Mic, Square } from "lucide-react";

import type { AiParsedComplaint } from "@/lib/api/complaint-parse";
import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { useRxSectionLock } from "@/components/cockpit/rx/useRxLock";
import {
  showHiddenTarget,
  useRxHiddenTargets,
} from "@/components/cockpit/rx/command-bar/rx-hidden-set";
import { VisitParseProposal } from "@/components/cockpit/rx/subjective/VisitParseProposal";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  parseVisitDescription,
  type VisitDiagnosisItem,
  type VisitInvestigationItem,
  type VisitParseProposal as VisitParseProposalDto,
  type VisitParseTabId,
  type VisitProseItem,
  type VisitVitalItem,
} from "@/lib/cockpit/visit-parse-orchestrator";
import {
  EMPTY_VISIT_DESCRIBE_COUNTS,
  visitDescribeAccepted,
  visitDescribeDismissed,
  visitDescribeShown,
  type VisitDescribeKind,
  type VisitDescribeKindCounts,
  type VisitDescribeSource,
} from "@/lib/telemetry/visit-describe";
import {
  appendDictationFinal,
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "@/lib/text/use-speech-recognition";

export interface VisitDescribeBarProps {
  token: string;
  disabled?: boolean;
  /** Palette row: compact input + proposal popover (ckd-01). */
  variant?: "block" | "embedded";
  onApplyDeterministic: (applied: VisitParseProposalDto) => void;
  onAcceptComplaints: (items: AiParsedComplaint[]) => void;
  onAcceptMedicines: (items: AiParsedMedicine[]) => void;
  onAcceptVitals: (items: VisitVitalItem[]) => void;
  onAcceptDiagnoses: (items: VisitDiagnosisItem[]) => void;
  onAcceptInvestigations: (items: VisitInvestigationItem[]) => void;
  onAcceptProse: (items: VisitProseItem[]) => void;
  onKeepAsTyped: (sourceText: string) => void;
}

function kindCountsFromSplit(
  applied: VisitParseProposalDto | null,
  pending: VisitParseProposalDto | null
): VisitDescribeKindCounts {
  return {
    ...EMPTY_VISIT_DESCRIBE_COUNTS,
    subjectiveDet: applied?.subjective.length ?? 0,
    subjectiveAi: pending?.subjective.length ?? 0,
    vitalsDet: applied?.vitals.length ?? 0,
    vitalsAi: pending?.vitals.length ?? 0,
    assessmentAi: pending?.assessment.length ?? 0,
    investigationsAi: pending?.investigations.length ?? 0,
    planDet: applied?.plan.length ?? 0,
    planAi: pending?.plan.length ?? 0,
    proseDet: applied?.prose.length ?? 0,
  };
}

function emitDetAccepted(
  source: VisitDescribeSource,
  applied: VisitParseProposalDto
): void {
  const rows: Array<[VisitDescribeKind, number]> = [
    ["subjective", applied.subjective.length],
    ["vitals", applied.vitals.length],
    ["plan", applied.plan.length],
    ["prose", applied.prose.length],
  ];
  for (const [kind, detCount] of rows) {
    if (detCount > 0) visitDescribeAccepted(source, kind, detCount, 0);
  }
}

export function VisitDescribeBar({
  token,
  disabled = false,
  variant = "block",
  onApplyDeterministic,
  onAcceptComplaints,
  onAcceptMedicines,
  onAcceptVitals,
  onAcceptDiagnoses,
  onAcceptInvestigations,
  onAcceptProse,
  onKeepAsTyped,
}: VisitDescribeBarProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle"
  );
  const [proposal, setProposal] = useState<VisitParseProposalDto | null>(null);
  const [applied, setApplied] = useState<VisitParseProposalDto | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dictatedRef = useRef(false);
  const parseSourceRef = useRef<VisitDescribeSource>("typed");
  // Feature-detect after mount — `window.SpeechRecognition` is absent during
  // SSR, so reading it on first paint hydrates a <button> the server HTML
  // never had.
  const [micSupported, setMicSupported] = useState(false);

  useEffect(() => {
    setMicSupported(isSpeechRecognitionSupported());
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runParse = useCallback(
    async (raw: string, refine = false) => {
      const trimmed = raw.trim();
      if (!trimmed || disabled || !token) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      setProposal(null);
      setApplied(null);
      let appliedForWrite: VisitParseProposalDto | null = null;
      try {
        const next = await parseVisitDescription({
          text: trimmed,
          token,
          refine,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const split = splitVisitProposal(next);
        appliedForWrite = isVisitProposalEmpty(split.applied)
          ? null
          : split.applied;
        setApplied(appliedForWrite);
        setProposal(isVisitProposalEmpty(split.pending) ? null : split.pending);
        setStatus("ready");
        setText("");
        const source: VisitDescribeSource = dictatedRef.current
          ? "dictated"
          : "typed";
        parseSourceRef.current = source;
        dictatedRef.current = false;
        visitDescribeShown(
          source,
          kindCountsFromSplit(appliedForWrite, split.pending)
        );
        if (appliedForWrite) emitDetAccepted(source, appliedForWrite);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setStatus("error");
        setApplied(null);
        setProposal(
          emptyVisitParseProposal(trimmed, refine ? "escalation" : "default")
        );
        return;
      }
      if (appliedForWrite) onApplyDeterministic(appliedForWrite);
    },
    [disabled, onApplyDeterministic, token]
  );

  const { isListening, start, stop } = useSpeechRecognition({
    onPartial: () => undefined,
    onFinal: (chunk) => {
      dictatedRef.current = true;
      setText((prev) => appendDictationFinal(prev, chunk));
    },
    onError: () => undefined,
  });

  const canParse = text.trim().length > 0 && status !== "loading" && !disabled;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setProposal(null);
    setApplied(null);
    dictatedRef.current = false;
  }, []);

  const handleKeepAsTyped = useCallback(() => {
    const source = proposal?.sourceText ?? applied?.sourceText ?? text;
    visitDescribeDismissed(parseSourceRef.current);
    onKeepAsTyped(source);
    setText(source);
    reset();
  }, [applied, onKeepAsTyped, proposal, reset, text]);

  const handleDismiss = useCallback(() => {
    visitDescribeDismissed(parseSourceRef.current);
    reset();
  }, [reset]);

  const finishOrSet = useCallback(
    (next: VisitParseProposalDto) => {
      if (
        isVisitProposalEmpty(next) &&
        (!applied || isVisitProposalEmpty(applied))
      ) {
        reset();
      } else if (isVisitProposalEmpty(next)) {
        setProposal(null);
      } else {
        setProposal(next);
      }
    },
    [applied, reset]
  );

  const handleAdd = useCallback(
    (tab: VisitParseTabId, index: number) => {
      if (!proposal) return;
      if (tab === "subjective") {
        const item = proposal.subjective[index];
        if (!item) return;
        onAcceptComplaints([item]);
        visitDescribeAccepted(parseSourceRef.current, "subjective", 0, 1);
        finishOrSet({
          ...proposal,
          subjective: proposal.subjective.filter((_, i) => i !== index),
          subjectiveSource: proposal.subjectiveSource.filter(
            (_, i) => i !== index
          ),
        });
        return;
      }
      if (tab === "plan") {
        const item = proposal.plan[index];
        if (!item) return;
        onAcceptMedicines([item]);
        visitDescribeAccepted(parseSourceRef.current, "plan", 0, 1);
        finishOrSet({
          ...proposal,
          plan: proposal.plan.filter((_, i) => i !== index),
          planSource: proposal.planSource.filter((_, i) => i !== index),
          planParsed: proposal.planParsed.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "vitals") {
        const item = proposal.vitals[index];
        if (!item) return;
        onAcceptVitals([item]);
        visitDescribeAccepted(parseSourceRef.current, "vitals", 0, 1);
        finishOrSet({
          ...proposal,
          vitals: proposal.vitals.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "assessment") {
        const item = proposal.assessment[index];
        if (!item) return;
        onAcceptDiagnoses([item]);
        visitDescribeAccepted(parseSourceRef.current, "assessment", 0, 1);
        finishOrSet({
          ...proposal,
          assessment: proposal.assessment.filter((_, i) => i !== index),
        });
        return;
      }
      if (tab === "investigations") {
        const item = proposal.investigations[index];
        if (!item) return;
        onAcceptInvestigations([item]);
        visitDescribeAccepted(parseSourceRef.current, "investigations", 0, 1);
        finishOrSet({
          ...proposal,
          investigations: proposal.investigations.filter((_, i) => i !== index),
        });
        return;
      }
      const item = proposal.prose[index];
      if (!item) return;
      onAcceptProse([item]);
      visitDescribeAccepted(parseSourceRef.current, "prose", 0, 1);
      finishOrSet({
        ...proposal,
        prose: proposal.prose.filter((_, i) => i !== index),
      });
    },
    [
      finishOrSet,
      onAcceptComplaints,
      onAcceptDiagnoses,
      onAcceptInvestigations,
      onAcceptMedicines,
      onAcceptProse,
      onAcceptVitals,
      proposal,
    ]
  );

  const handleAddTab = useCallback(
    (tab: VisitParseTabId) => {
      if (!proposal) return;
      if (tab === "subjective") {
        if (proposal.subjective.length === 0) return;
        onAcceptComplaints(proposal.subjective);
        visitDescribeAccepted(
          parseSourceRef.current,
          "subjective",
          0,
          proposal.subjective.length
        );
        finishOrSet({
          ...proposal,
          subjective: [],
          subjectiveSource: [],
        });
        return;
      }
      if (tab !== "plan" || proposal.plan.length === 0) return;
      onAcceptMedicines(proposal.plan);
      visitDescribeAccepted(
        parseSourceRef.current,
        "plan",
        0,
        proposal.plan.length
      );
      finishOrSet({
        ...proposal,
        plan: [],
        planSource: [],
        planParsed: [],
      });
    },
    [finishOrSet, onAcceptComplaints, onAcceptMedicines, proposal]
  );

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void runParse(text);
  }

  const embedded = variant === "embedded";
  const proposalOpen = status !== "idle";

  const inputRow = (
    <div className={cn("flex items-stretch gap-1.5", embedded && "min-w-0")}>
      {micSupported ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => (isListening ? stop() : start())}
          className="flex shrink-0 items-center justify-center rounded-md border border-border px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={isListening ? "Stop dictation" : "Dictate visit"}
          aria-pressed={isListening}
        >
          {isListening ? (
            <Square className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Mic className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      <input
        type="text"
        value={text}
        disabled={disabled || status === "loading"}
        onChange={(event) => {
          setText(event.target.value);
          if (status !== "idle") reset();
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          embedded
            ? "Add or describe anything…"
            : "Add or describe anything — a vital, a medicine, or the whole visit"
        }
        aria-label="Describe this visit"
        className={cn(
          "min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
          embedded ? "h-7" : "h-9",
        )}
      />
      {canParse ? (
        <button
          type="button"
          onClick={() => void runParse(text)}
          className="shrink-0 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted"
          aria-label="Parse visit"
        >
          Done
        </button>
      ) : null}
    </div>
  );

  const proposalCard = proposalOpen ? (
    <VisitParseProposal
      status={status === "loading" ? "loading" : status}
      proposal={proposal}
      applied={applied}
      onAdd={handleAdd}
      onAddTab={handleAddTab}
      onDismiss={handleDismiss}
      onKeepAsTyped={handleKeepAsTyped}
    />
  ) : null;

  if (embedded) {
    return (
      <Popover
        open={proposalOpen}
        onOpenChange={(open) => {
          if (!open) handleDismiss();
        }}
      >
        <PopoverAnchor asChild>
          <div className="min-w-0 flex-1" data-testid="visit-describe-embedded">
            {inputRow}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[min(100vw-2rem,28rem)] max-h-[min(70vh,28rem)] overflow-y-auto p-2"
        >
          {proposalCard}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-1">
      {inputRow}
      {proposalCard}
    </div>
  );
}

/** Single-host wrapper — apply goes through existing form actions. */
export function VisitDescribeFormBar({
  token,
  disabled: disabledProp = false,
  variant = "block",
}: {
  token: string;
  disabled?: boolean;
  variant?: "block" | "embedded";
}) {
  const { contentLocked } = useRxSectionLock(disabledProp);
  const disabled = contentLocked;
  const { dispatch, setField, state } = useRxForm();
  const hidden = useRxHiddenTargets();

  const onApplyDeterministic = useCallback(
    (applied: VisitParseProposalDto) => {
      applyVisitVitalItems(
        setField,
        state.fields,
        applied.vitals,
        hidden,
        showHiddenTarget
      );
      for (const item of applied.subjective) {
        const complaint = complaintFromAiParsed(item);
        if (complaint) dispatch({ type: "ADD_COMPLAINT", complaint });
      }
      applied.plan.forEach((_, index) => {
        const row = medicineFromVisitPlanItem(applied, index);
        if (row) dispatch({ type: "ADD_MEDICINE", medicine: row });
      });
      applyVisitProseItems(setField, state.fields, applied.prose);
    },
    [dispatch, hidden, setField, state.fields]
  );

  const onAcceptComplaints = useCallback(
    (items: AiParsedComplaint[]) => {
      for (const item of items) {
        const complaint = complaintFromAiParsed(item);
        if (complaint) dispatch({ type: "ADD_COMPLAINT", complaint });
      }
    },
    [dispatch]
  );

  const onAcceptMedicines = useCallback(
    (items: AiParsedMedicine[]) => {
      for (const row of medicinesFromAiParsed(items)) {
        dispatch({ type: "ADD_MEDICINE", medicine: row });
      }
    },
    [dispatch]
  );

  const onAcceptVitals = useCallback(
    (items: VisitVitalItem[]) => {
      applyVisitVitalItems(
        setField,
        state.fields,
        items,
        hidden,
        showHiddenTarget
      );
    },
    [hidden, setField, state.fields]
  );

  const onAcceptDiagnoses = useCallback(
    (items: VisitDiagnosisItem[]) => {
      let existing = state.fields.diagnoses;
      for (const item of items) {
        const row = diagnosisFromSuggestion(item.suggestion, existing);
        if (!row) continue;
        dispatch({ type: "ADD_DIAGNOSIS", diagnosis: row });
        existing = [row, ...existing];
      }
    },
    [dispatch, state.fields.diagnoses]
  );

  const onAcceptInvestigations = useCallback(
    (items: VisitInvestigationItem[]) => {
      let next = state.fields.investigationsOrders;
      for (const item of items) {
        next = nextInvestigationsOrdersFromItem(next, item);
      }
      if (next !== state.fields.investigationsOrders) {
        setField("investigationsOrders", next);
      }
    },
    [setField, state.fields.investigationsOrders]
  );

  const onAcceptProse = useCallback(
    (items: VisitProseItem[]) => {
      applyVisitProseItems(setField, state.fields, items);
    },
    [setField, state.fields]
  );

  const onKeepAsTyped = useCallback((_sourceText: string) => {
    // VNB-D4: dismiss / keep-as-typed writes nothing.
  }, []);

  return (
    <VisitDescribeBar
      token={token}
      disabled={disabled}
      variant={variant}
      onApplyDeterministic={onApplyDeterministic}
      onAcceptComplaints={onAcceptComplaints}
      onAcceptMedicines={onAcceptMedicines}
      onAcceptVitals={onAcceptVitals}
      onAcceptDiagnoses={onAcceptDiagnoses}
      onAcceptInvestigations={onAcceptInvestigations}
      onAcceptProse={onAcceptProse}
      onKeepAsTyped={onKeepAsTyped}
    />
  );
}
