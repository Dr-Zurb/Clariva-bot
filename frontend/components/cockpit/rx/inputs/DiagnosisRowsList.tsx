"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
import {
  DiagnosisAutocomplete,
  type DiagnosisCommitPayload,
} from "@/components/cockpit/rx/inputs/DiagnosisAutocomplete";
import {
  DiagnosisAiProposal,
  type DiagnosisAiStatus,
} from "@/components/cockpit/rx/inputs/DiagnosisAiProposal";
import {
  resolveDiagnosisWithAI,
  type DiagnosisResolveSuggestion,
} from "@/lib/api/diagnosis-parse";
import { ChartPillToggle } from "@/components/ehr/chart/ChartPillToggle";
import {
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_ASSESSMENT_ZONE_CONTAINER_CLASS,
  RX_ASSESSMENT_ZONE_HEADING_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { resolveSoapNestedStatusDotClass } from "@/components/cockpit/rx/sections/section-chrome";
import { createEmptyDiagnosisRow, normalizeConditionKey } from "@/lib/cockpit/diagnoses";
import { findMatchingCondition } from "@/lib/chart/pmh-icd-shortcuts";
import { usePatientConditionsQuery } from "@/hooks/queries/usePatientConditionsQuery";
import { hasEntryCardSurface } from "@/lib/cockpit/entry-card-ui-state";
import { usePersistedOpenId } from "@/lib/cockpit/use-persisted-entry-open";
import { CollapsibleDepthProvider } from "@/components/ui/sticky-stack";
import { cn } from "@/lib/utils";
import type {
  AssessmentAcuity,
  DiagnosisKind,
  DiagnosisRow,
} from "@/types/prescription";

/** Primary diagnosis label input — tab editor anchor (asmt-01 / asmt-03). */
export const ASSESSMENT_TAB_DX_INPUT_ID = "rx-diagnosis-input";

/** Type-to-card capture input (asmt-05). */
export const ASSESSMENT_DX_CAPTURE_INPUT_ID = "rx-diagnosis-capture";

const ROLE_OPTIONS: ReadonlyArray<{ value: DiagnosisKind; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "differential", label: "Differential" },
];

const CERTAINTY_OPTIONS: ReadonlyArray<{
  value: "provisional" | "confirmed";
  label: string;
}> = [
  { value: "confirmed", label: "Confirmed" },
  // Short label — "Provisional/Working" overflowed narrow Assessment columns.
  { value: "provisional", label: "Provisional" },
];

const ACUITY_OPTIONS: ReadonlyArray<{ value: AssessmentAcuity; label: string }> = [
  { value: "improving", label: "Improving" },
  { value: "stable", label: "Stable" },
  { value: "worsening", label: "Worsening" },
];

const DDX_TOGGLE_OPTIONS: ReadonlyArray<{
  value: "provisional" | "excluded";
  label: string;
}> = [
  { value: "provisional", label: "Considering" },
  { value: "excluded", label: "Ruled out" },
];

const ROLE_LABEL: Record<DiagnosisKind, string> = {
  primary: "Primary",
  secondary: "Secondary",
  differential: "Differential",
};

const ACUITY_LABEL: Record<AssessmentAcuity, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
};

const ROLE_BADGE_CLASS: Record<DiagnosisKind, string> = {
  primary:
    "border-primary/50 bg-primary/10 text-foreground",
  secondary:
    "border-border/70 bg-muted/40 text-muted-foreground",
  differential:
    "border-dashed border-border text-muted-foreground",
};

function buildDiagnosisPreview(row: DiagnosisRow): string {
  // Role is already on the badge — preview only carries the rest.
  const parts: string[] = [];
  if (row.kind === "differential") {
    parts.push(row.certainty === "excluded" ? "Ruled out" : "Considering");
  } else {
    if (row.certainty === "confirmed") {
      parts.push("Confirmed");
    } else {
      // provisional + deprecated rule_out both surface as Provisional
      parts.push("Provisional");
    }
    if (row.acuity) {
      parts.push(ACUITY_LABEL[row.acuity]);
    }
  }
  return parts.join(" · ");
}

/**
 * Label + control row. Side-by-side when the entry card is wide enough; stacks
 * under narrow Assessment columns so pill groups keep a full-width wrap lane
 * (`CollapsibleEntryCard` is `@container/entry`).
 */
function DiagnosisFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1 @[22rem]/entry:flex-row @[22rem]/entry:items-start @[22rem]/entry:gap-3">
      <span
        className={cn(
          RX_EXAM_FIELD_LABEL_CLASS,
          "shrink-0 text-muted-foreground @[22rem]/entry:w-[4.75rem] @[22rem]/entry:pt-2",
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export interface DiagnosisRowsListProps {
  disabled?: boolean;
  /** When true, omit the in-body "Diagnoses" heading (L1 CollapsibleContainer owns it). */
  hideHeading?: boolean;
}

export function DiagnosisRowsList({
  disabled = false,
  hideHeading = false,
}: DiagnosisRowsListProps) {
  const { appointmentId, state, dispatch, token, patientId } = useRxForm();
  const diagnoses = state.fields.diagnoses;
  const [capture, setCapture] = useState("");
  const captureRef = useRef<HTMLInputElement | null>(null);
  const [openId, setOpenId] = usePersistedOpenId(appointmentId, "diagnoses");
  const seededOpenRef = useRef(false);

  // Shared known-conditions cache — used only to soft-link visit Dx cards
  // (conditionId). Never writes the chart from here (ASMT-D6).
  const conditionsQuery = usePatientConditionsQuery(token ?? "", patientId ?? "");
  const activeKnownConditions = useMemo(
    () =>
      (conditionsQuery.data ?? []).filter(
        (c) => !c.archived_at && c.status === "active",
      ),
    [conditionsQuery.data],
  );

  // Soft-reconcile visit Dx ↔ active known conditions (read chart only; ASMT-D6).
  // Stamp conditionId when a match appears; clear it when the linked condition
  // is archived / removed so the Known badge drops immediately.
  useEffect(() => {
    const activeIds = new Set(activeKnownConditions.map((c) => c.id));
    for (const row of diagnoses) {
      if (row.kind === "differential") continue;
      if (row.conditionId) {
        if (!activeIds.has(row.conditionId)) {
          dispatch({
            type: "UPDATE_DIAGNOSIS",
            id: row.id,
            patch: { conditionId: null },
          });
        }
        continue;
      }
      const matched = findMatchingCondition(
        activeKnownConditions,
        row.label,
        row.code,
      );
      if (matched) {
        dispatch({
          type: "UPDATE_DIAGNOSIS",
          id: row.id,
          patch: { conditionId: matched.id },
        });
      }
    }
  }, [activeKnownConditions, diagnoses, dispatch]);

  // asmt-07: gated AI ICD-11 resolver — fires only on the free-text (no catalog
  // match) path. Suggestion-only; the typed text is kept if declined (ASMT-D3).
  const [aiStatus, setAiStatus] = useState<DiagnosisAiStatus>("idle");
  const [aiSuggestions, setAiSuggestions] = useState<DiagnosisResolveSuggestion[]>([]);
  const [aiTypedText, setAiTypedText] = useState("");
  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  // Open the primary (or first) card once when diagnoses first appear — but
  // never override a session-persisted open/closed choice.
  useEffect(() => {
    if (seededOpenRef.current) return;
    if (diagnoses.length === 0) return;
    seededOpenRef.current = true;
    if (appointmentId && hasEntryCardSurface(appointmentId, "diagnoses")) return;
    const primary = diagnoses.find((d) => d.kind === "primary") ?? diagnoses[0];
    setOpenId(primary.id);
  }, [appointmentId, diagnoses, setOpenId]);

  // Drop openId if the row was removed — stay collapsed (don't auto-open another).
  useEffect(() => {
    if (openId && !diagnoses.some((d) => d.id === openId)) {
      setOpenId(null);
    }
  }, [diagnoses, openId]);

  function updateRow(id: string, patch: Partial<DiagnosisRow>) {
    dispatch({ type: "UPDATE_DIAGNOSIS", id, patch });
  }

  function commitDiagnosis(
    rawLabel: string,
    coding?: { code: string | null; codeTitle: string | null },
  ) {
    const label = rawLabel.trim();
    if (!label) return;
    const key = normalizeConditionKey(label);
    if (diagnoses.some((d) => normalizeConditionKey(d.label) === key)) {
      setCapture("");
      return;
    }
    const hasCommitted = diagnoses.some(
      (d) => d.kind === "primary" || d.kind === "secondary",
    );
    const kind: DiagnosisKind = hasCommitted ? "secondary" : "primary";
    const code = coding?.code ?? null;
    // Soft-link to an existing known condition when codes/labels match.
    // (Differentials are committed via a separate path and never get conditionId.)
    const matched = findMatchingCondition(activeKnownConditions, label, code);
    const row = {
      ...createEmptyDiagnosisRow(kind),
      label,
      code,
      codeTitle: coding?.codeTitle ?? null,
      conditionId: matched?.id ?? null,
    };
    dispatch({ type: "ADD_DIAGNOSIS", diagnosis: row });
    setCapture("");
    // Stay collapsed until the user opens the card (seededOpenRef blocks the
    // hydrate-once effect from expanding the just-added row).
    seededOpenRef.current = true;
  }

  function resetAiPanel() {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiStatus("idle");
    setAiSuggestions([]);
    setAiTypedText("");
  }

  // asmt-07: resolve messy free text against the ICD-11 catalog via the gated AI
  // resolver. Suggestion-only + catalog-constrained. Empty / error / abort never
  // dead-ends — the typed text degrades to an uncoded card (ASMT-D3).
  function runAiResolve(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiTypedText(trimmed);
    setAiSuggestions([]);
    setAiStatus("loading");

    const degradeToTyped = () => {
      aiAbortRef.current = null;
      setAiStatus("idle");
      setAiSuggestions([]);
      setAiTypedText("");
      commitDiagnosis(trimmed);
    };

    resolveDiagnosisWithAI(token, {
      text: trimmed,
      tier: "default",
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        const found = res.data.suggestions;
        // No catalog-constrained match → keep the typed line (today's path).
        if (found.length === 0) {
          degradeToTyped();
          return;
        }
        setAiSuggestions(found);
        setAiStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Never lose the doctor's typed Enter — degrade to an uncoded card.
        degradeToTyped();
      });
  }

  // asmt-06/07: catalog selection carries the ICD code; a forced free-text
  // (Shift+Enter) commits uncoded immediately (ASMT-D3). A genuine no-catalog
  // match routes through the gated AI resolver before falling back to uncoded.
  function handleCommit(payload: DiagnosisCommitPayload) {
    if (payload.source === "catalog") {
      resetAiPanel();
      commitDiagnosis(payload.entry.title, {
        code: payload.entry.code,
        codeTitle: payload.entry.title,
      });
      return;
    }
    if (payload.forced || !token || disabled) {
      resetAiPanel();
      commitDiagnosis(payload.label);
      return;
    }
    runAiResolve(payload.label);
  }

  function handleAcceptSuggestion(suggestion: DiagnosisResolveSuggestion) {
    resetAiPanel();
    commitDiagnosis(suggestion.title, {
      code: suggestion.code,
      codeTitle: suggestion.title,
    });
  }

  function handleKeepAsTyped() {
    const typed = aiTypedText;
    resetAiPanel();
    commitDiagnosis(typed);
  }

  function removeRow(id: string) {
    dispatch({ type: "REMOVE_DIAGNOSIS", id });
  }

  function setRole(id: string, kind: DiagnosisKind) {
    // Secondary needs another committed diagnosis to stay secondary —
    // otherwise enforceSinglePrimary silently re-promotes it to primary.
    if (kind === "secondary" && !canSelectSecondary(id)) return;
    dispatch({ type: "UPDATE_DIAGNOSIS", id, patch: { kind } });
  }

  /** True when selecting Secondary on `id` would leave ≥1 other committed Dx. */
  function canSelectSecondary(id: string): boolean {
    const otherCommitted = diagnoses.filter(
      (d) =>
        d.id !== id && (d.kind === "primary" || d.kind === "secondary"),
    ).length;
    return otherCommitted >= 1;
  }

  return (
    <CollapsibleDepthProvider depth={0}>
      <div
        className={RX_ASSESSMENT_ZONE_CONTAINER_CLASS}
        data-testid="diagnosis-rows-list"
      >
        {!hideHeading ? (
          <h4 className={RX_ASSESSMENT_ZONE_HEADING_CLASS}>
            Diagnoses
            {diagnoses.length > 0 ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({diagnoses.length})
              </span>
            ) : null}
          </h4>
        ) : null}

        <div>
          <label htmlFor={ASSESSMENT_DX_CAPTURE_INPUT_ID} className="sr-only">
            Add diagnosis
          </label>
          <DiagnosisAutocomplete
            inputId={ASSESSMENT_DX_CAPTURE_INPUT_ID}
            testId="diagnosis-capture-input"
            value={capture}
            onChange={setCapture}
            onCommit={handleCommit}
            token={token}
            disabled={disabled}
            ariaLabel="Add diagnosis"
            placeholder="Add diagnosis — search ICD or type and press Enter"
            inputRef={(el) => {
              captureRef.current = el;
            }}
          />
        </div>

        {aiStatus !== "idle" ? (
          <DiagnosisAiProposal
            status={aiStatus}
            suggestions={aiSuggestions}
            typedText={aiTypedText}
            onAccept={handleAcceptSuggestion}
            onKeepAsTyped={handleKeepAsTyped}
          />
        ) : null}

        {diagnoses.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No diagnoses yet. Type above and press Enter.
          </p>
        ) : null}

        <ul className="space-y-2">
          {diagnoses.map((row, index) => {
            const isPrimary = row.kind === "primary";
            const isDifferential = row.kind === "differential";
            const isExcluded = isDifferential && row.certainty === "excluded";
            const open = openId === row.id;
            const labelId =
              isPrimary || index === 0
                ? ASSESSMENT_TAB_DX_INPUT_ID
                : `rx-diagnosis-label-${row.id}`;
            const preview = buildDiagnosisPreview(row);

            return (
              <li key={row.id}>
                <CollapsibleEntryCard
                  testId={`diagnosis-row-${row.id}`}
                  title={
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={resolveSoapNestedStatusDotClass(
                          "assessment",
                          Boolean(row.label.trim()) && !isExcluded,
                          isDifferential ? "leaf" : "cluster",
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          // Prefer the diagnosis name — chips wrap under it when narrow.
                          // min-w-0 + break-words so long labels don't paint under trash/chevron.
                          "min-w-0 break-words font-medium text-foreground",
                          isExcluded && "text-muted-foreground line-through",
                        )}
                      >
                        {row.label.trim() || "Untitled diagnosis"}
                      </span>
                      {row.code ? (
                        <span
                          className="shrink-0 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                          title={row.codeTitle ?? row.code}
                          data-testid={`diagnosis-code-chip-${row.id}`}
                        >
                          {row.code}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          ROLE_BADGE_CLASS[row.kind],
                        )}
                      >
                        {ROLE_LABEL[row.kind]}
                      </span>
                      {row.conditionId && row.kind !== "differential" ? (
                        <span
                          className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground"
                          title="Linked to a known condition on the problem list"
                          data-testid={`diagnosis-known-badge-${row.id}`}
                        >
                          Known
                        </span>
                      ) : null}
                    </span>
                  }
                  preview={preview}
                  open={open}
                  onToggle={() => setOpenId(open ? null : row.id)}
                  onRemove={disabled ? undefined : () => removeRow(row.id)}
                  removeLabel={`Remove ${row.label.trim() || row.kind} diagnosis`}
                  disabled={disabled}
                  bodyId={`diagnosis-body-${row.id}`}
                  className={cn(
                    isPrimary && "border-primary/40",
                    isDifferential && "border-dashed",
                    isExcluded && "opacity-70",
                  )}
                >
                  <div
                    className="space-y-2"
                    data-kind={row.kind}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DiagnosisFieldRow label="Diagnosis">
                      <input
                        id={labelId}
                        type="text"
                        value={row.label}
                        onChange={(e) =>
                          updateRow(row.id, { label: e.target.value })
                        }
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-9 py-1.5")}
                        placeholder="Diagnosis label"
                        maxLength={500}
                        disabled={disabled}
                      />
                    </DiagnosisFieldRow>

                    <DiagnosisFieldRow label="Role">
                      <ChartPillToggle
                        options={ROLE_OPTIONS.map((opt) => {
                          const blockSecondary =
                            opt.value === "secondary" &&
                            !canSelectSecondary(row.id);
                          return blockSecondary
                            ? {
                                ...opt,
                                disabled: true,
                                title:
                                  "Add another diagnosis first — Secondary needs a Primary",
                              }
                            : opt;
                        })}
                        value={row.kind}
                        disabled={disabled}
                        ariaLabel="Diagnosis role"
                        testId={`diagnosis-role-${row.id}`}
                        onChange={(kind) => setRole(row.id, kind)}
                      />
                    </DiagnosisFieldRow>

                    {isDifferential ? (
                      <>
                        <DiagnosisFieldRow label="Status">
                          <ChartPillToggle
                            options={DDX_TOGGLE_OPTIONS}
                            value={
                              row.certainty === "excluded"
                                ? "excluded"
                                : "provisional"
                            }
                            disabled={disabled}
                            ariaLabel="Differential status"
                            testId={`diagnosis-ddx-toggle-${row.id}`}
                            onChange={(certainty) =>
                              updateRow(row.id, { certainty })
                            }
                          />
                        </DiagnosisFieldRow>
                        <DiagnosisFieldRow label="Note">
                          <input
                            id={`rx-dx-note-${row.id}`}
                            type="text"
                            value={row.note ?? ""}
                            onChange={(e) =>
                              updateRow(row.id, {
                                note: e.target.value || null,
                              })
                            }
                            className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-9 py-1.5")}
                            placeholder="Optional note"
                            maxLength={2000}
                            disabled={disabled}
                          />
                        </DiagnosisFieldRow>
                      </>
                    ) : (
                      <>
                        <DiagnosisFieldRow label="Certainty">
                          <ChartPillToggle
                            options={CERTAINTY_OPTIONS}
                            value={
                              row.certainty === "confirmed"
                                ? "confirmed"
                                : "provisional"
                            }
                            disabled={disabled}
                            ariaLabel="Certainty"
                            testId={`diagnosis-certainty-${row.id}`}
                            onChange={(certainty) =>
                              updateRow(row.id, { certainty })
                            }
                          />
                        </DiagnosisFieldRow>
                        <DiagnosisFieldRow label="Acuity">
                          <ChartPillToggle
                            options={ACUITY_OPTIONS}
                            value={row.acuity ?? null}
                            disabled={disabled}
                            ariaLabel="Acuity"
                            testId={`diagnosis-acuity-${row.id}`}
                            onChange={(acuity) =>
                              updateRow(row.id, {
                                acuity: row.acuity === acuity ? null : acuity,
                              })
                            }
                          />
                        </DiagnosisFieldRow>
                        <DiagnosisFieldRow label="Note">
                          <input
                            id={`rx-dx-note-${row.id}`}
                            type="text"
                            value={row.note ?? ""}
                            onChange={(e) =>
                              updateRow(row.id, {
                                note: e.target.value || null,
                              })
                            }
                            className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-9 py-1.5")}
                            placeholder="Optional note"
                            maxLength={2000}
                            disabled={disabled}
                          />
                        </DiagnosisFieldRow>
                      </>
                    )}
                  </div>
                </CollapsibleEntryCard>
              </li>
            );
          })}
        </ul>
      </div>
    </CollapsibleDepthProvider>
  );
}
