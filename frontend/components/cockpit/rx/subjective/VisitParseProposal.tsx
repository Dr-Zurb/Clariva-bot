/**
 * Tab-grouped describe-visit proposal (rfed-03 / vnb-04 / vnt-03).
 *
 * Confirm-to-apply for model-touched items. Deterministic hits that already
 * wrote on Enter render as an applied summary (VNB-D4). Transcript-derived
 * rows never auto-apply and never get Add all (VNT-D4, VN-DL-12). Callbacks
 * fire with tab + index; this file does not dispatch form state. Per-tab Add
 * all for extractor output only; no global Add all (RFE-DL-6, VN-DL-5).
 */

"use client";

import type { ReactNode } from "react";
import { Plus, Sparkles, X } from "lucide-react";

import type { AiParsedComplaint } from "@/lib/api/complaint-parse";
import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import type {
  VisitInvestigationItem,
  VisitItemSource,
  VisitParseProposal as VisitParseProposalDto,
  VisitParseTabId,
  VisitProseItem,
  VisitTranscriptEvidence,
  VisitVitalItem,
} from "@/lib/cockpit/visit-parse-orchestrator";
import {
  isTranscriptSource,
  sliceTranscriptQuote,
} from "@/lib/cockpit/visit-parse-orchestrator";
import { isVisitProposalEmpty } from "@/lib/cockpit/visit-parse-apply";

export type VisitParseProposalStatus = "loading" | "error" | "ready";

export interface VisitParseProposalProps {
  status: VisitParseProposalStatus;
  proposal: VisitParseProposalDto | null;
  applied?: VisitParseProposalDto | null;
  /** Full transcript text for quote slices. Required to render transcript rows. */
  transcriptText?: string;
  onAdd: (tab: VisitParseTabId, index: number) => void;
  onAddTab: (tab: VisitParseTabId) => void;
  onDismiss: () => void;
  onKeepAsTyped?: () => void;
}

const TAB_LABEL: Record<VisitParseTabId, string> = {
  subjective: "Subjective",
  plan: "Medications",
  vitals: "Vitals",
  assessment: "Assessment",
  investigations: "Investigations",
  prose: "Notes",
};

function humanizeKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function summarizeComplaint(complaint: AiParsedComplaint): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(complaint.patch)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${humanizeKey(key)}: ${value}`);
  }
  for (const name of complaint.associated) parts.push(name);
  return parts.join(" · ");
}

function summarizeMedicine(med: AiParsedMedicine): string {
  const parts: string[] = [];
  if (med.strengthValue != null) {
    parts.push(
      med.strengthUnit ? `${med.strengthValue} ${med.strengthUnit}` : String(med.strengthValue)
    );
  }
  if (med.frequencyCode) parts.push(med.frequencyCode);
  if (med.durationValue != null) {
    parts.push(
      med.durationUnit
        ? `${med.durationValue} ${med.durationUnit}`
        : String(med.durationValue)
    );
  }
  return parts.join(" · ");
}

function summarizeVital(item: VisitVitalItem): string {
  return item.option.label;
}

function summarizeInvestigation(item: VisitInvestigationItem): string {
  return item.label || item.term;
}

function proseTargetLabel(item: VisitProseItem): string {
  if (item.target === "exam") return "Exam";
  if (item.target === "advice") return "Advice";
  return "Note";
}

function groupHeading(tab: VisitParseTabId, count: number): string {
  const label = TAB_LABEL[tab];
  return count === 1 ? `1 item for ${label} →` : `${count} items for ${label} →`;
}

function appliedSummaryParts(applied: VisitParseProposalDto): string[] {
  const parts: string[] = [];
  for (const complaint of applied.subjective) {
    if (complaint.name.trim()) parts.push(complaint.name);
  }
  for (const vital of applied.vitals) {
    parts.push(summarizeVital(vital));
  }
  for (const med of applied.plan) {
    if (med.name.trim()) parts.push(med.name);
  }
  for (const item of applied.prose) {
    const text = item.text.trim();
    if (!text) continue;
    parts.push(`${proseTargetLabel(item)} — ${text}`);
  }
  return parts;
}

function readyCopy(
  hasApplied: boolean,
  hasPending: boolean,
  hasTranscriptPending: boolean,
  hasAiPending: boolean
): string {
  if (hasApplied && !hasPending) return "Added to this visit";
  if (hasTranscriptPending && !hasAiPending && hasPending) return "From the recording";
  if (hasPending) return "AI suggestions";
  return "No extra detail found.";
}

function resolveQuote(
  source: VisitItemSource | undefined,
  evidence: VisitTranscriptEvidence | undefined,
  transcriptText: string | undefined
): { kind: "none" } | { kind: "drop" } | { kind: "quote"; quote: string } {
  const transcript = source != null && isTranscriptSource(source);
  if (!transcript && evidence == null) return { kind: "none" };
  if (!evidence || transcriptText == null) return { kind: "drop" };
  const quote = sliceTranscriptQuote(
    transcriptText,
    evidence.spanStart,
    evidence.spanEnd
  );
  if (quote == null) return { kind: "drop" };
  return { kind: "quote", quote };
}

function sourceAt(
  sources: readonly VisitItemSource[] | undefined,
  index: number
): VisitItemSource | undefined {
  return sources?.[index];
}

function groupHasTranscript(
  sources: readonly VisitItemSource[] | undefined,
  count: number
): boolean {
  if (!sources) return false;
  for (let i = 0; i < count; i += 1) {
    if (sources[i] != null && isTranscriptSource(sources[i]!)) return true;
  }
  return false;
}

/**
 * Suggestion-only panel. Non-blocking. Empty groups are hidden.
 */
export function VisitParseProposal({
  status,
  proposal,
  applied = null,
  transcriptText,
  onAdd,
  onAddTab,
  onDismiss,
  onKeepAsTyped,
}: VisitParseProposalProps) {
  const subjective = proposal?.subjective ?? [];
  const plan = proposal?.plan ?? [];
  const vitals = proposal?.vitals ?? [];
  const assessment = proposal?.assessment ?? [];
  const investigations = proposal?.investigations ?? [];
  const prose = proposal?.prose ?? [];
  const ready = status === "ready";
  const hasApplied = Boolean(applied && !isVisitProposalEmpty(applied));
  const appliedParts = applied && hasApplied ? appliedSummaryParts(applied) : [];

  const subjectiveRows = subjective.map((complaint, index) => ({
    index,
    complaint,
    resolved: resolveQuote(
      sourceAt(proposal?.subjectiveSource, index),
      proposal?.subjectiveEvidence?.[index],
      transcriptText
    ),
  }));
  const planRows = plan.map((med, index) => ({
    index,
    med,
    resolved: resolveQuote(
      sourceAt(proposal?.planSource, index),
      proposal?.planEvidence?.[index],
      transcriptText
    ),
  }));
  const vitalRows = vitals.map((item, index) => ({
    index,
    item,
    resolved: resolveQuote(item.source, item.evidence, transcriptText),
  }));
  const assessmentRows = assessment.map((item, index) => ({
    index,
    item,
    resolved: resolveQuote(item.source, item.evidence, transcriptText),
  }));
  const investigationRows = investigations.map((item, index) => ({
    index,
    item,
    resolved: resolveQuote(item.source, item.evidence, transcriptText),
  }));
  const proseRows = prose.map((item, index) => ({
    index,
    item,
    resolved: resolveQuote(item.source, item.evidence, transcriptText),
  }));

  const visibleSubjective = subjectiveRows.filter((row) => row.resolved.kind !== "drop");
  const visiblePlan = planRows.filter((row) => row.resolved.kind !== "drop");
  const visibleVitals = vitalRows.filter((row) => row.resolved.kind !== "drop");
  const visibleAssessment = assessmentRows.filter((row) => row.resolved.kind !== "drop");
  const visibleInvestigations = investigationRows.filter(
    (row) => row.resolved.kind !== "drop"
  );
  const visibleProse = proseRows.filter((row) => row.resolved.kind !== "drop");

  const showSubjective = ready && visibleSubjective.length > 0;
  const showPlan = ready && visiblePlan.length > 0;
  const showVitals = ready && visibleVitals.length > 0;
  const showAssessment = ready && visibleAssessment.length > 0;
  const showInvestigations = ready && visibleInvestigations.length > 0;
  const showProse = ready && visibleProse.length > 0;
  const hasPending =
    showSubjective ||
    showPlan ||
    showVitals ||
    showAssessment ||
    showInvestigations ||
    showProse;
  const hasTranscriptPending =
    visibleSubjective.some((row) => row.resolved.kind === "quote") ||
    visiblePlan.some((row) => row.resolved.kind === "quote") ||
    visibleVitals.some((row) => row.resolved.kind === "quote") ||
    visibleAssessment.some((row) => row.resolved.kind === "quote") ||
    visibleInvestigations.some((row) => row.resolved.kind === "quote") ||
    visibleProse.some((row) => row.resolved.kind === "quote");
  const hasAiPending =
    visibleSubjective.some((row) => row.resolved.kind === "none") ||
    visiblePlan.some((row) => row.resolved.kind === "none") ||
    visibleVitals.some((row) => row.resolved.kind === "none") ||
    visibleAssessment.some((row) => row.resolved.kind === "none") ||
    visibleInvestigations.some((row) => row.resolved.kind === "none") ||
    visibleProse.some((row) => row.resolved.kind === "none");

  const subjectiveAddAll =
    visibleSubjective.length > 1 &&
    !groupHasTranscript(proposal?.subjectiveSource, subjective.length);
  const planAddAll =
    visiblePlan.length > 1 && !groupHasTranscript(proposal?.planSource, plan.length);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-xs font-medium text-foreground">
          {status === "loading"
            ? "Reading this visit…"
            : status === "error"
              ? "Couldn’t read this visit — keeping your typed text."
              : readyCopy(hasApplied, hasPending, hasTranscriptPending, hasAiPending)}
        </span>
        {onKeepAsTyped ? (
          <button
            type="button"
            onClick={onKeepAsTyped}
            className="rounded-sm border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Keep as typed
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss AI suggestions"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {ready && appliedParts.length > 0 ? (
        <p
          data-testid="visit-parse-applied-summary"
          className="mt-1.5 text-xs text-muted-foreground"
        >
          Applied: {appliedParts.join(" · ")}
        </p>
      ) : null}

      {showSubjective ? (
        <ProposalGroup
          tab="subjective"
          heading={groupHeading("subjective", visibleSubjective.length)}
          showAddAll={subjectiveAddAll}
          onAddTab={onAddTab}
        >
          {visibleSubjective.map((row) => {
            const detail = summarizeComplaint(row.complaint);
            return (
              <ProposalRow
                key={`${row.complaint.name}-${row.index}`}
                name={row.complaint.name}
                detail={detail}
                quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
                addLabel={`Add ${row.complaint.name}`}
                onAdd={() => onAdd("subjective", row.index)}
              />
            );
          })}
        </ProposalGroup>
      ) : null}

      {showVitals ? (
        <ProposalGroup
          tab="vitals"
          heading={groupHeading("vitals", visibleVitals.length)}
          showAddAll={false}
          onAddTab={onAddTab}
        >
          {visibleVitals.map((row) => (
            <ProposalRow
              key={`${row.item.option.id}-${row.index}`}
              name={row.item.option.label}
              detail=""
              quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
              addLabel={`Add ${row.item.option.label}`}
              onAdd={() => onAdd("vitals", row.index)}
            />
          ))}
        </ProposalGroup>
      ) : null}

      {showAssessment ? (
        <ProposalGroup
          tab="assessment"
          heading={groupHeading("assessment", visibleAssessment.length)}
          showAddAll={false}
          onAddTab={onAddTab}
        >
          {visibleAssessment.map((row) => (
            <ProposalRow
              key={`${row.item.suggestion.code}-${row.index}`}
              name={row.item.suggestion.title}
              detail={row.item.suggestion.code}
              quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
              addLabel={`Add ${row.item.suggestion.title}`}
              onAdd={() => onAdd("assessment", row.index)}
            />
          ))}
        </ProposalGroup>
      ) : null}

      {showInvestigations ? (
        <ProposalGroup
          tab="investigations"
          heading={groupHeading("investigations", visibleInvestigations.length)}
          showAddAll={false}
          onAddTab={onAddTab}
        >
          {visibleInvestigations.map((row) => (
            <ProposalRow
              key={`${row.item.catalogValue}-${row.index}`}
              name={summarizeInvestigation(row.item)}
              detail=""
              quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
              addLabel={`Add ${summarizeInvestigation(row.item)}`}
              onAdd={() => onAdd("investigations", row.index)}
            />
          ))}
        </ProposalGroup>
      ) : null}

      {showPlan ? (
        <ProposalGroup
          tab="plan"
          heading={groupHeading("plan", visiblePlan.length)}
          showAddAll={planAddAll}
          onAddTab={onAddTab}
        >
          {visiblePlan.map((row) => {
            const detail = summarizeMedicine(row.med);
            return (
              <ProposalRow
                key={`${row.med.name}-${row.index}`}
                name={row.med.name}
                detail={detail}
                quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
                addLabel={`Add ${row.med.name}`}
                onAdd={() => onAdd("plan", row.index)}
              />
            );
          })}
        </ProposalGroup>
      ) : null}

      {showProse ? (
        <ProposalGroup
          tab="prose"
          heading={groupHeading("prose", visibleProse.length)}
          showAddAll={false}
          onAddTab={onAddTab}
        >
          {visibleProse.map((row) => (
            <ProposalRow
              key={`${row.item.target}-${row.index}`}
              name={proseTargetLabel(row.item)}
              detail={row.item.text}
              quote={row.resolved.kind === "quote" ? row.resolved.quote : undefined}
              addLabel={`Add ${proseTargetLabel(row.item)}`}
              onAdd={() => onAdd("prose", row.index)}
            />
          ))}
        </ProposalGroup>
      ) : null}
    </div>
  );
}

function ProposalGroup({
  tab,
  heading,
  showAddAll,
  onAddTab,
  children,
}: {
  tab: VisitParseTabId;
  heading: string;
  showAddAll: boolean;
  onAddTab: (tab: VisitParseTabId) => void;
  children: ReactNode;
}) {
  const tabLabel = TAB_LABEL[tab];
  return (
    <div className="mt-1.5" data-testid={`visit-parse-group-${tab}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {heading}
        </span>
        {showAddAll ? (
          <button
            type="button"
            onClick={() => onAddTab(tab)}
            className="rounded-sm border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
            aria-label={`Add all ${tabLabel}`}
          >
            Add all
          </button>
        ) : null}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function ProposalRow({
  name,
  detail,
  quote,
  addLabel,
  onAdd,
}: {
  name: string;
  detail: string;
  quote?: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-start gap-1.5 rounded-sm bg-background/60 px-1.5 py-1">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {detail ? (
          <span className="ml-1 text-xs text-muted-foreground">{detail}</span>
        ) : null}
        {quote != null ? (
          <blockquote
            data-testid="visit-parse-quote"
            className="mt-1 border-l-2 border-amber-500/80 bg-amber-50/90 px-1.5 py-0.5 text-xs italic leading-snug text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <span className="line-clamp-2 break-words">“{quote}”</span>
          </blockquote>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex shrink-0 items-center gap-0.5 rounded-sm border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
        aria-label={addLabel}
      >
        <Plus className="h-3 w-3" aria-hidden />
        Add
      </button>
    </li>
  );
}
