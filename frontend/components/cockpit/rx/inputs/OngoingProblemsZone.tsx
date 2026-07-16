"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { CollapsibleEntryCard } from "@/components/cockpit/rx/inputs/CollapsibleEntryCard";
import {
  DiagnosisAutocomplete,
  type DiagnosisCommitPayload,
} from "@/components/cockpit/rx/inputs/DiagnosisAutocomplete";
import { ChartPillToggle } from "@/components/ehr/chart/ChartPillToggle";
import { ChartQuickAddChips } from "@/components/ehr/chart/ChartQuickAddChips";
import { usePatientConditionsQuery } from "@/hooks/queries/usePatientConditionsQuery";
import { usePersistedOpenId } from "@/lib/cockpit/use-persisted-entry-open";
import { queryKeys } from "@/lib/query/keys";
import { invalidatePatientConditions } from "@/lib/query/invalidate";
import {
  findMatchingCondition,
  isDuplicateCondition,
  normalizeConditionKey,
  PMH_ICD_SHORTCUTS,
} from "@/lib/chart/pmh-icd-shortcuts";
import {
  archivePatientCondition,
  createPatientCondition,
  updatePatientCondition,
} from "@/lib/api";
import {
  RX_EXAM_FIELD_LABEL_CLASS,
  RX_ASSESSMENT_ZONE_CONTAINER_CLASS,
  RX_ASSESSMENT_ZONE_HEADING_CLASS,
  RX_FIELD_INPUT_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { resolveSoapNestedStatusDotClass } from "@/components/cockpit/rx/sections/section-chrome";
import { CollapsibleDepthProvider } from "@/components/ui/sticky-stack";
import { cn } from "@/lib/utils";
import type { AssessmentAcuity } from "@/types/prescription";
import type {
  PatientChronicCondition,
  PatientConditionStatus,
} from "@/types/patient-chart";

export interface OngoingProblemsZoneProps {
  disabled?: boolean;
  /** When true, omit the in-body "Known conditions" heading (L1 CollapsibleContainer owns it). */
  hideHeading?: boolean;
}

const CONDITION_STATUS_OPTIONS: ReadonlyArray<{
  value: PatientConditionStatus;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Past" },
];

const ACUITY_OPTIONS: ReadonlyArray<{ value: AssessmentAcuity; label: string }> = [
  { value: "improving", label: "Improving" },
  { value: "stable", label: "Stable" },
  { value: "worsening", label: "Worsening" },
];

const ACUITY_LABEL: Record<AssessmentAcuity, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
};

const STATUS_BADGE_CLASS: Record<PatientConditionStatus, string> = {
  active: "border-primary/50 bg-primary/10 text-foreground",
  resolved: "border-border/70 bg-muted/40 text-muted-foreground",
};

/**
 * Label + control row — matches diagnosis cards. Stacks under narrow columns
 * (`CollapsibleEntryCard` is `@container/entry`).
 */
function ConditionFieldRow({
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

/**
 * Flat read-in of the patient's active PMH conditions (Subjective → Patient
 * background), labelled "Known conditions". Entry uses the same ICD-11
 * autocomplete as visit diagnoses (optional coding). Every write goes through
 * the shared conditions query so Subjective PMH stays in sync.
 */
export function OngoingProblemsZone({
  disabled = false,
  hideHeading = false,
}: OngoingProblemsZoneProps) {
  const { appointmentId, patientId, token, state, dispatch } = useRxForm();
  const queryClient = useQueryClient();
  const diagnoses = state.fields.diagnoses;
  const addInputId = useId();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [openId, setOpenId] = usePersistedOpenId(
    appointmentId,
    "knownConditions",
  );
  const [capture, setCapture] = useState("");
  /** In-flight create keys (code:… or label:…) — ref so UI never greys out. */
  const creatingKeysRef = useRef<Set<string>>(new Set());

  const canUseChart = Boolean(patientId && token);

  // Shared source of truth: the same conditions query the Subjective PMH writes
  // to. A write in either surface invalidates this key and both re-sync.
  const conditionsQuery = usePatientConditionsQuery(token ?? "", patientId ?? "");
  const conditions = useMemo(
    () =>
      (conditionsQuery.data ?? []).filter(
        (c) => !c.archived_at && c.status === "active",
      ),
    [conditionsQuery.data],
  );

  const quickAddItems = useMemo(() => {
    return PMH_ICD_SHORTCUTS.filter(
      (s) => !isDuplicateCondition(conditions, s.title, s.code),
    ).map((s) => ({ id: s.id, label: s.title, badge: s.code }));
  }, [conditions]);

  const loadError = conditionsQuery.isError
    ? conditionsQuery.error instanceof Error
      ? conditionsQuery.error.message
      : "Failed to load known conditions"
    : null;

  // Preserve an open card if it still exists; never auto-open (add stays collapsed).
  useEffect(() => {
    setOpenId((prev) => {
      if (prev && conditions.some((c) => c.id === prev)) return prev;
      return null;
    });
  }, [conditions]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Optimistically patch one row in the shared conditions cache. */
  function patchConditionInCache(
    id: string,
    patch: Partial<PatientChronicCondition>,
  ) {
    queryClient.setQueryData<PatientChronicCondition[]>(
      queryKeys.patient(patientId ?? "").conditions(),
      (prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function conditionsCacheKey() {
    return queryKeys.patient(patientId ?? "").conditions();
  }

  function forgetDrafts(id: string) {
    setDraftNames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDraftNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOpenId((prev) => (prev === id ? null : prev));
  }

  async function addCondition(
    label: string,
    coding?: { code: string | null; codeTitle: string | null },
  ) {
    if (!patientId || !token || disabled) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    const code = coding?.code?.trim() || null;
    const codeTitle = coding?.codeTitle?.trim() || null;
    const createKey = code
      ? `code:${code}`
      : `label:${normalizeConditionKey(trimmed)}`;
    if (isDuplicateCondition(conditions, trimmed, code)) {
      setActionError(null);
      setCapture("");
      return;
    }
    if (creatingKeysRef.current.has(createKey)) return;

    creatingKeysRef.current.add(createKey);
    setActionError(null);
    setCapture("");

    const conditionsKey = queryKeys.patient(patientId).conditions();
    const tempId = `temp-cond-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: PatientChronicCondition = {
      id: tempId,
      doctor_id: "",
      patient_id: patientId,
      condition: trimmed,
      status: "active",
      diagnosed_on: null,
      diagnosed_ago_value: null,
      diagnosed_ago_unit: null,
      resolved_ago_value: null,
      resolved_ago_unit: null,
      on_treatment: null,
      acuity: null,
      code,
      code_title: codeTitle,
      note: null,
      archived_at: null,
      created_at: now,
      updated_at: now,
    };

    // Cancel in-flight refetch so it can't overwrite the optimistic insert.
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    // Newest-first — matches listChronicConditions (created_at DESC) so the
    // card lands at the top and does not jump after reconcile/refetch.
    queryClient.setQueryData<PatientChronicCondition[]>(conditionsKey, (prev) => {
      const list = prev ?? [];
      if (list.some((c) => c.id === tempId)) return list;
      return [optimistic, ...list];
    });

    try {
      const res = await createPatientCondition(token, patientId, {
        condition: trimmed,
        status: "active",
        code,
        codeTitle,
      });
      const created = res.data.condition;
      queryClient.setQueryData<PatientChronicCondition[]>(conditionsKey, (prev) => {
        const list = prev ?? [];
        // Replace temp in place (keeps top slot); fall back to prepend.
        if (list.some((c) => c.id === tempId)) {
          return list.map((c) => (c.id === tempId ? created : c));
        }
        if (list.some((c) => c.id === created.id)) return list;
        return [created, ...list];
      });
      // Soft reconcile: stamp conditionId onto matching visit diagnoses.
      for (const dx of diagnoses) {
        if (dx.kind === "differential" || dx.conditionId) continue;
        if (findMatchingCondition([created], dx.label, dx.code)) {
          dispatch({
            type: "UPDATE_DIAGNOSIS",
            id: dx.id,
            patch: { conditionId: created.id },
          });
        }
      }
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      queryClient.setQueryData<PatientChronicCondition[]>(conditionsKey, (prev) =>
        (prev ?? []).filter((c) => c.id !== tempId),
      );
      setActionError(
        err instanceof Error ? err.message : "Failed to add condition",
      );
    } finally {
      creatingKeysRef.current.delete(createKey);
    }
  }

  function handleCaptureCommit(payload: DiagnosisCommitPayload) {
    if (payload.source === "catalog") {
      void addCondition(payload.entry.title, {
        code: payload.entry.code,
        codeTitle: payload.entry.title,
      });
      return;
    }
    void addCondition(payload.label);
  }

  function handleQuickAdd(item: { id: string; label: string; badge?: string }) {
    const shortcut = PMH_ICD_SHORTCUTS.find((s) => s.id === item.id);
    if (!shortcut) return;
    void addCondition(shortcut.title, {
      code: shortcut.code,
      codeTitle: shortcut.title,
    });
  }

  async function commitRename(condition: PatientChronicCondition) {
    if (!patientId || !token || disabled) return;
    const nextName = (draftNames[condition.id] ?? condition.condition).trim();
    if (!nextName || nextName === condition.condition) {
      setDraftNames((prev) => ({ ...prev, [condition.id]: condition.condition }));
      return;
    }
    const conditionsKey = conditionsCacheKey();
    setBusy(condition.id, true);
    setActionError(null);
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    try {
      const res = await updatePatientCondition(token, patientId, condition.id, {
        condition: nextName,
      });
      const updated = res.data.condition;
      patchConditionInCache(condition.id, updated);
      setDraftNames((prev) => ({ ...prev, [condition.id]: updated.condition }));
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to rename condition",
      );
      setDraftNames((prev) => ({
        ...prev,
        [condition.id]: condition.condition,
      }));
    } finally {
      setBusy(condition.id, false);
    }
  }

  async function commitNote(condition: PatientChronicCondition) {
    if (!patientId || !token || disabled) return;
    const nextNote = (draftNotes[condition.id] ?? condition.note ?? "").trim();
    const prevNote = (condition.note ?? "").trim();
    if (nextNote === prevNote) {
      setDraftNotes((prev) => ({
        ...prev,
        [condition.id]: condition.note ?? "",
      }));
      return;
    }
    const conditionsKey = conditionsCacheKey();
    setBusy(condition.id, true);
    setActionError(null);
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    try {
      const res = await updatePatientCondition(token, patientId, condition.id, {
        note: nextNote || null,
      });
      const updated = res.data.condition;
      patchConditionInCache(condition.id, updated);
      setDraftNotes((prev) => ({
        ...prev,
        [condition.id]: updated.note ?? "",
      }));
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update note",
      );
      setDraftNotes((prev) => ({
        ...prev,
        [condition.id]: condition.note ?? "",
      }));
    } finally {
      setBusy(condition.id, false);
    }
  }

  async function setStatus(
    condition: PatientChronicCondition,
    status: PatientConditionStatus,
  ) {
    if (!patientId || !token || disabled) return;
    if (status === condition.status) return;
    const conditionsKey = conditionsCacheKey();
    setBusy(condition.id, true);
    setActionError(null);
    // Cancel in-flight list so a stale refetch can't revive an active card
    // after Past/optimistic status change.
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    const previous =
      queryClient.getQueryData<PatientChronicCondition[]>(conditionsKey) ?? [];
    // Known conditions lists active only — flipping to Past drops the card here
    // (optimistic), while the Subjective PMH keeps it as a Past row.
    patchConditionInCache(condition.id, { status });
    if (status === "resolved") forgetDrafts(condition.id);
    try {
      await updatePatientCondition(token, patientId, condition.id, { status });
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      queryClient.setQueryData(conditionsKey, previous);
      setActionError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setBusy(condition.id, false);
    }
  }

  async function setAcuity(
    condition: PatientChronicCondition,
    acuity: AssessmentAcuity | null,
  ) {
    if (!patientId || !token || disabled) return;
    const prev = condition.acuity ?? null;
    if (acuity === prev) return;
    const conditionsKey = conditionsCacheKey();
    setBusy(condition.id, true);
    setActionError(null);
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    patchConditionInCache(condition.id, { acuity });
    try {
      await updatePatientCondition(token, patientId, condition.id, { acuity });
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update acuity",
      );
      patchConditionInCache(condition.id, { acuity: prev });
    } finally {
      setBusy(condition.id, false);
    }
  }

  async function removeCondition(condition: PatientChronicCondition) {
    if (!patientId || !token || disabled) return;
    const conditionsKey = conditionsCacheKey();
    setBusy(condition.id, true);
    setActionError(null);
    // Cancel in-flight list first — otherwise a stale refetch can overwrite the
    // optimistic drop and the card "reappears" after remove.
    await queryClient.cancelQueries({ queryKey: conditionsKey });
    const previous =
      queryClient.getQueryData<PatientChronicCondition[]>(conditionsKey) ?? [];
    // Drop from cache — GET list excludes archived rows (same as server).
    queryClient.setQueryData<PatientChronicCondition[]>(
      conditionsKey,
      previous.filter((c) => c.id !== condition.id),
    );
    forgetDrafts(condition.id);
    // Optimistic unlink: drop Known badge on visit Dx stamped to this condition.
    for (const dx of diagnoses) {
      if (dx.conditionId === condition.id) {
        dispatch({
          type: "UPDATE_DIAGNOSIS",
          id: dx.id,
          patch: { conditionId: null },
        });
      }
    }
    try {
      await archivePatientCondition(token, patientId, condition.id);
      // Don't active-refetch the Known list — optimistic drop is authoritative;
      // a GET right after soft-archive can briefly revive the card.
      void invalidatePatientConditions(queryClient, patientId, {
        actingSurface: "conditions",
      });
    } catch (err) {
      queryClient.setQueryData(conditionsKey, previous);
      setActionError(
        err instanceof Error ? err.message : "Failed to remove condition",
      );
    } finally {
      setBusy(condition.id, false);
    }
  }

  if (!canUseChart) return null;

  return (
    <CollapsibleDepthProvider depth={0}>
      <div
        className={RX_ASSESSMENT_ZONE_CONTAINER_CLASS}
        data-testid="ongoing-problems-zone"
      >
        {!hideHeading ? (
          <h4 className={RX_ASSESSMENT_ZONE_HEADING_CLASS}>
            Known conditions
            {conditions.length > 0 ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({conditions.length})
              </span>
            ) : null}
          </h4>
        ) : null}

        {loadError ? (
          <p className="text-xs text-destructive">{loadError}</p>
        ) : null}
        {actionError ? (
          <p className="text-xs text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}

        {!disabled && token ? (
          <div className="space-y-2">
            <DiagnosisAutocomplete
              inputId={addInputId}
              testId="known-condition-add"
              value={capture}
              onChange={setCapture}
              onCommit={handleCaptureCommit}
              token={token}
              ariaLabel="Add known condition"
              placeholder="Add condition — search ICD or type and press Enter"
            />
            <ChartQuickAddChips
              items={quickAddItems}
              groupLabel="Common conditions"
              testId="known-condition-quick-add"
              onAddItem={handleQuickAdd}
            />
          </div>
        ) : null}

        {conditions.length === 0 && !loadError ? (
          <p className="text-xs text-muted-foreground">
            No active conditions on the chart. Add one above, or in Subjective →
            Patient background.
          </p>
        ) : null}

        <ul className="space-y-2" data-testid="ongoing-problems-list">
          {conditions.map((condition) => {
            const busy = busyIds.has(condition.id);
            const open = openId === condition.id;
            const status = condition.status ?? "active";
            const previewParts: string[] = [];
            if (condition.acuity) previewParts.push(ACUITY_LABEL[condition.acuity]);
            if (condition.note?.trim()) previewParts.push(condition.note.trim());
            const preview = previewParts.join(" · ");

            return (
              <li key={condition.id}>
                <CollapsibleEntryCard
                  testId={`ongoing-problem-${condition.id}`}
                  title={
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={resolveSoapNestedStatusDotClass(
                          "assessment",
                          true,
                          "cluster",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 break-words font-medium text-foreground">
                        {(draftNames[condition.id] ?? condition.condition).trim() ||
                          "Untitled condition"}
                      </span>
                      {condition.code ? (
                        <span
                          className="shrink-0 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                          title={condition.code_title ?? condition.code}
                          data-testid={`known-condition-code-${condition.id}`}
                        >
                          {condition.code}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          STATUS_BADGE_CLASS[status],
                        )}
                      >
                        {status === "resolved" ? "Past" : "Active"}
                      </span>
                    </span>
                  }
                  preview={preview}
                  open={open}
                  onToggle={() => setOpenId(open ? null : condition.id)}
                  onRemove={
                    disabled || busy
                      ? undefined
                      : () => void removeCondition(condition)
                  }
                  removeLabel={`Remove ${condition.condition}`}
                  disabled={disabled || busy}
                  bodyId={`known-condition-body-${condition.id}`}
                >
                  <div
                    className="space-y-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <ConditionFieldRow label="Condition">
                      <input
                        type="text"
                        value={draftNames[condition.id] ?? condition.condition}
                        onChange={(e) =>
                          setDraftNames((prev) => ({
                            ...prev,
                            [condition.id]: e.target.value,
                          }))
                        }
                        onBlur={() => void commitRename(condition)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        disabled={disabled || busy}
                        maxLength={200}
                        aria-label={`Rename ${condition.condition}`}
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-9 py-1.5")}
                      />
                    </ConditionFieldRow>

                    <ConditionFieldRow label="Status">
                      <ChartPillToggle
                        options={CONDITION_STATUS_OPTIONS}
                        value={status}
                        disabled={disabled || busy}
                        ariaLabel={`${condition.condition} status`}
                        testId={`known-condition-status-${condition.id}`}
                        onChange={(next) => void setStatus(condition, next)}
                      />
                    </ConditionFieldRow>

                    <ConditionFieldRow label="Acuity">
                      <ChartPillToggle
                        options={ACUITY_OPTIONS}
                        value={condition.acuity ?? null}
                        disabled={disabled || busy}
                        ariaLabel={`${condition.condition} acuity`}
                        testId={`known-condition-acuity-${condition.id}`}
                        onChange={(next) =>
                          void setAcuity(
                            condition,
                            condition.acuity === next ? null : next,
                          )
                        }
                      />
                    </ConditionFieldRow>

                    <ConditionFieldRow label="Note">
                      <input
                        type="text"
                        value={draftNotes[condition.id] ?? condition.note ?? ""}
                        onChange={(e) =>
                          setDraftNotes((prev) => ({
                            ...prev,
                            [condition.id]: e.target.value,
                          }))
                        }
                        onBlur={() => void commitNote(condition)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        disabled={disabled || busy}
                        maxLength={2000}
                        aria-label={`Note for ${condition.condition}`}
                        placeholder="Optional note"
                        className={cn(RX_FIELD_INPUT_CLASS, "mt-0 h-9 py-1.5")}
                      />
                    </ConditionFieldRow>
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
