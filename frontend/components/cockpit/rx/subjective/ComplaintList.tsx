"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  createEmptyComplaint,
  useRxForm,
  type Complaint,
} from "@/components/cockpit/rx/RxFormContext";
import { ComplaintCard } from "@/components/cockpit/rx/subjective/ComplaintCard";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  resolveSubjectiveSectionIcon,
  sectionHeaderIcon,
} from "@/components/cockpit/rx/sections/section-chrome";
import { usePersistedOpenId } from "@/lib/cockpit/use-persisted-entry-open";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import {
  ComplaintCaptureBar,
  type ComplaintCapturePayload,
} from "@/components/cockpit/rx/subjective/ComplaintCaptureBar";
import {
  MAIN_COMPLAINT_DRAG_MIME,
  reorderInsertAfterIndex,
  reorderInsertBeforeIndex,
  resolveMainComplaintDropIntent,
  type MainComplaintDropIntent,
} from "@/lib/cockpit/complaint-drag";
import {
  formatDemoteComplaintError,
  getDemoteComplaintError,
} from "@/lib/cockpit/complaint-tree";
import {
  CHIEF_COMPLAINTS_SECTION_ID,
  scrollComplaintCaptureIntoView,
  scrollComplaintCardIntoView,
  type ComplaintCollapseSource,
} from "@/lib/cockpit/complaint-card-scroll";
import { COLLAPSE_CLOSE_MS } from "@/lib/cockpit/collapse-scroll";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import { complaintNamesEquivalent } from "@/lib/cockpit/complaint-search-normalize";
import {
  isLateralityValidForComplaint,
  parseComplaintText,
} from "@/lib/cockpit/parse-complaint-text";
import {
  buildParsedCueItems,
  recordParsedFields,
} from "@/lib/cockpit/parsed-fields-signal";
import {
  isComplaintCategory,
  resolveComplaintAttributeFields,
} from "@/lib/cockpit/complaint-schema";
import {
  parseComplaintWithAI,
  type AiParsedComplaint,
} from "@/lib/api/complaint-parse";
import {
  AiRefineProposal,
  type AiRefineStatus,
} from "@/components/cockpit/rx/subjective/AiRefineProposal";
import { SubjectiveSectionTemplateButton } from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { SubjectiveOtherPhotosStrip } from "@/components/cockpit/rx/subjective/SubjectiveOtherPhotosStrip";
import {
  complaintFromAiParsed,
  mergeAiParsedIntoComplaint,
} from "@/lib/cockpit/visit-parse-apply";
import { LastVisitComplaintsStrip } from "@/components/cockpit/rx/last-visit/LastVisitComplaintsStrip";

export interface ComplaintListProps {
  disabled?: boolean;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

function nextInstanceIds(count: number, start: number): string[] {
  return Array.from({ length: count }, (_, i) => `complaint-${start + i}`);
}

/** Turn parsed associated-symptom names into mini-card children (deduped, ≠ parent). */
function buildAssociatedChildren(
  names: string[],
  parentName: string
): Complaint[] {
  const children: Complaint[] = [];
  for (const raw of names) {
    const name = formatComplaintDisplayName(raw.trim());
    if (!name) continue;
    if (complaintNamesEquivalent(name, parentName)) continue;
    if (children.some((c) => complaintNamesEquivalent(c.name, name))) continue;
    const child = createEmptyComplaint();
    child.name = name;
    children.push(child);
  }
  return children;
}

interface DropTargetState {
  index: number;
  intent: MainComplaintDropIntent;
}

export function ComplaintList({
  disabled = false,
  sectionOpen,
  onSectionOpenChange,
}: ComplaintListProps) {
  const { appointmentId, state, dispatch, token } = useRxForm();
  const { complaints } = state.fields;

  const [instanceIds, setInstanceIds] = useState<string[]>(() =>
    complaints.map((c) => c.id)
  );
  const [activeInstanceId, setActiveInstanceId] = usePersistedOpenId(
    appointmentId,
    "complaints"
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const [demoteError, setDemoteError] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const instanceSeqRef = useRef(instanceIds.length);
  const collapseSourceRef = useRef<ComplaintCollapseSource | null>(null);
  const prevActiveInstanceIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (complaints.length > instanceIds.length) {
      const added = complaints.length - instanceIds.length;
      const newIds = nextInstanceIds(added, instanceSeqRef.current);
      instanceSeqRef.current += added;
      // Prepend — matches newest-first complaint order from addComplaintToTree.
      setInstanceIds((prev) => [...newIds, ...prev]);
    } else if (complaints.length < instanceIds.length) {
      setInstanceIds((prev) => prev.slice(0, complaints.length));
    }
  }, [complaints.length, instanceIds.length]);

  useLayoutEffect(() => {
    const prev = prevActiveInstanceIdRef.current;
    prevActiveInstanceIdRef.current = activeInstanceId;

    if (activeInstanceId) {
      // Accordion switch: wait for the previous card's close fold before gliding
      // the new card to the top so the landing is measured post-collapse.
      const switched = Boolean(prev && prev !== activeInstanceId);
      const delayMs = switched ? COLLAPSE_CLOSE_MS : 0;
      const instanceId = activeInstanceId;
      const timer = window.setTimeout(() => {
        scrollComplaintCardIntoView(instanceId);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }

    // Deliberate collapse (header / lip / Escape) → settle the capture bar back
    // into view *concurrently* with the body fold (live re-measurement tracks the
    // shrinking card), so close reads as one motion instead of fold-then-scroll.
    // The header is unified now (no mid-close swap), so there's nothing to race.
    // Blur-collapse (doc clicked Family history, etc.) → leave them there.
    if (prev && collapseSourceRef.current === "explicit") {
      collapseSourceRef.current = null;
      scrollComplaintCaptureIntoView();
      return;
    }
    collapseSourceRef.current = null;
  }, [activeInstanceId]);

  const clearDragState = useCallback(() => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  // ── subj-14: opt-in AI refine on an already-added card ──
  const [aiStatus, setAiStatus] = useState<AiRefineStatus | "idle">("idle");
  const [aiComplaints, setAiComplaints] = useState<AiParsedComplaint[]>([]);
  const [refiningInstanceId, setRefiningInstanceId] = useState<string | null>(
    null
  );
  const [cardApplied, setCardApplied] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  /** Build a card from a capture payload (deterministic fill + associated + cue). */
  const commitCapture = useCallback(
    ({ name, category, rawText, combo }: ComplaintCapturePayload) => {
      if (combo) {
        const finalName = combo.complaintName.trim() || name.trim();
        const duplicateIndex = complaints.findIndex((c) =>
          complaintNamesEquivalent(c.name, finalName)
        );
        if (duplicateIndex >= 0) {
          const existingId =
            instanceIds[duplicateIndex] ?? complaints[duplicateIndex]!.id;
          setActiveInstanceId(existingId);
          return;
        }

        const complaint = createEmptyComplaint();
        complaint.name = formatComplaintDisplayName(finalName);
        const comboCategory =
          combo.category && isComplaintCategory(combo.category)
            ? combo.category
            : category;
        if (comboCategory) complaint.category = comboCategory;
        if (
          combo.severityBand === "mild" ||
          combo.severityBand === "moderate" ||
          combo.severityBand === "severe" ||
          combo.severityBand === "very_severe"
        ) {
          complaint.severity = combo.severityBand;
        }
        if (combo.laterality) complaint.laterality = combo.laterality;
        if (combo.character) complaint.character = combo.character;
        if (
          !isLateralityValidForComplaint(
            complaint.name,
            complaint.category ?? undefined,
            complaint.laterality
          )
        ) {
          delete complaint.laterality;
        }

        const children = buildAssociatedChildren(
          combo.associatedNames,
          complaint.name
        );
        if (children.length > 0) complaint.associatedComplaints = children;

        recordParsedFields(
          complaint.id,
          buildParsedCueItems(
            complaint,
            {
              ...(complaint.severity != null ? { severity: complaint.severity } : {}),
              ...(complaint.laterality ? { laterality: complaint.laterality } : {}),
              ...(complaint.character ? { character: complaint.character } : {}),
            },
            children.map((child) => child.name)
          )
        );

        dispatch({ type: "ADD_COMPLAINT", complaint });
        return;
      }

      // Parse the doctor's original typed text for structured detail. When a
      // catalog row matched, `name` is the canonical catalog name and `rawText`
      // is what they typed — keep the catalog name as the title but still pull
      // fields + associated symptoms out of the full sentence.
      const parsed = parseComplaintText(rawText?.trim() || name);
      const finalName = (rawText ? name.trim() : parsed.name) || name.trim();

      const duplicateIndex = complaints.findIndex((c) =>
        complaintNamesEquivalent(c.name, finalName)
      );
      if (duplicateIndex >= 0) {
        const existingId =
          instanceIds[duplicateIndex] ?? complaints[duplicateIndex]!.id;
        setActiveInstanceId(existingId);
        return;
      }

      const complaint = createEmptyComplaint();
      complaint.name = formatComplaintDisplayName(finalName);
      if (category) complaint.category = category;
      Object.assign(complaint, parsed.patch);

      // Laterality was derived from the typed residue name; drop it if the final
      // (catalog) schema doesn't model it.
      if (
        !isLateralityValidForComplaint(
          complaint.name,
          complaint.category ?? undefined,
          complaint.laterality
        )
      ) {
        delete complaint.laterality;
      }

      // "...associated with nausea, vomiting" → associated-symptom mini-cards.
      const children = buildAssociatedChildren(
        parsed.associated,
        complaint.name
      );
      if (children.length > 0) complaint.associatedComplaints = children;

      // Transparency cue (subj-13 §3): record what was auto-filled so the new
      // card can show a brief "Auto-filled: …" summary when it mounts.
      recordParsedFields(
        complaint.id,
        buildParsedCueItems(
          complaint,
          parsed.patch,
          children.map((child) => child.name)
        )
      );

      dispatch({ type: "ADD_COMPLAINT", complaint });
    },
    [complaints, instanceIds, dispatch]
  );

  const resetAiPanel = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setRefiningInstanceId(null);
    setCardApplied(false);
    setAiStatus("idle");
    setAiComplaints([]);
  }, []);

  const refiningIndex = refiningInstanceId
    ? instanceIds.indexOf(refiningInstanceId)
    : -1;
  const refiningComplaint =
    refiningIndex >= 0 ? complaints[refiningIndex] : undefined;
  const refineMerge =
    refiningComplaint && aiComplaints[0]
      ? mergeAiParsedIntoComplaint(refiningComplaint, aiComplaints[0])
      : null;

  const runAiParse = useCallback(
    (text: string, instanceId: string, category?: Complaint["category"]) => {
      const trimmed = text.trim();
      if (!trimmed || !token || disabled) return;

      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      setRefiningInstanceId(instanceId);
      setCardApplied(false);
      setAiStatus("loading");
      setAiComplaints([]);

      const fieldSpec = resolveComplaintAttributeFields({
        complaintName: trimmed,
        category,
      }).filter((f) => f.type !== "painscale" && f.type !== "temperature");

      parseComplaintWithAI(token, {
        text: trimmed,
        fieldSpec,
        tier: "escalation",
        signal: controller.signal,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          setAiComplaints(res.data.complaints);
          setAiStatus("ready");
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setAiStatus("error");
        });
    },
    [token, disabled]
  );

  const handleCapture = useCallback(
    (payload: ComplaintCapturePayload) => {
      if (disabled) return;
      commitCapture(payload);
    },
    [disabled, commitCapture]
  );

  const handleCardRefine = useCallback(
    (index: number) => {
      const complaint = complaints[index];
      if (!complaint?.name.trim()) return;
      const instanceId = instanceIds[index] ?? complaint.id;
      runAiParse(complaint.name, instanceId, complaint.category);
    },
    [complaints, instanceIds, runAiParse]
  );

  const dismissAi = useCallback(() => {
    resetAiPanel();
  }, [resetAiPanel]);

  /** Add one AI-detected complaint as a real card. Returns false on dup/invalid. */
  const addAiComplaint = useCallback(
    (parsed: AiParsedComplaint): boolean => {
      if (disabled) return false;
      const finalName = formatComplaintDisplayName(parsed.name);
      if (!finalName) return false;

      const duplicateIndex = complaints.findIndex((c) =>
        complaintNamesEquivalent(c.name, finalName)
      );
      if (duplicateIndex >= 0) {
        const existingId =
          instanceIds[duplicateIndex] ?? complaints[duplicateIndex]!.id;
        setActiveInstanceId(existingId);
        return false;
      }

      const complaint = complaintFromAiParsed(parsed);
      if (!complaint) return false;

      dispatch({ type: "ADD_COMPLAINT", complaint });
      return true;
    },
    [disabled, complaints, instanceIds, dispatch]
  );

  const dropAiIndex = useCallback(
    (index: number) => {
      const remaining = aiComplaints.filter((_, i) => i !== index);
      if (remaining.length === 0) {
        resetAiPanel();
      } else {
        setAiComplaints(remaining);
      }
    },
    [aiComplaints, resetAiPanel]
  );

  const handleAddAiIndex = useCallback(
    (index: number) => {
      const target = aiComplaints[index];
      if (!target) return;
      addAiComplaint(target);
      dropAiIndex(index);
    },
    [aiComplaints, addAiComplaint, dropAiIndex]
  );

  const applyAiToRefiningCard = useCallback(
    (proposalIndex: number) => {
      const parsed = aiComplaints[proposalIndex];
      const complaint = complaints[refiningIndex];
      if (!parsed || !complaint || refiningIndex < 0) return;

      const { fieldPatch, associatedNames, suggestedName } =
        mergeAiParsedIntoComplaint(complaint, parsed);
      const nextName = suggestedName ?? complaint.name;
      const children = buildAssociatedChildren(associatedNames, nextName);
      const patch: Partial<Complaint> = { ...fieldPatch };
      if (suggestedName) patch.name = suggestedName;
      if (children.length > 0) {
        patch.associatedComplaints = [
          ...children,
          ...(complaint.associatedComplaints ?? []),
        ];
      }
      if (Object.keys(patch).length > 0) {
        dispatch({ type: "UPDATE_COMPLAINT", index: refiningIndex, patch });
      }
    },
    [aiComplaints, complaints, refiningIndex, dispatch]
  );

  const handleApplyAiIndex = useCallback(
    (index: number) => {
      applyAiToRefiningCard(index);
      setCardApplied(true);
      dropAiIndex(index);
    },
    [applyAiToRefiningCard, dropAiIndex]
  );

  const handleRenameFromAi = useCallback(() => {
    const suggestedName = refineMerge?.suggestedName;
    if (!suggestedName || refiningIndex < 0) return;
    dispatch({
      type: "UPDATE_COMPLAINT",
      index: refiningIndex,
      patch: { name: suggestedName },
    });
  }, [refineMerge?.suggestedName, refiningIndex, dispatch]);

  const handleAddAllAi = useCallback(() => {
    if (!cardApplied && refiningIndex >= 0 && aiComplaints[0]) {
      applyAiToRefiningCard(0);
      aiComplaints.slice(1).forEach((row) => addAiComplaint(row));
    } else {
      aiComplaints.forEach((row) => addAiComplaint(row));
    }
    resetAiPanel();
  }, [
    cardApplied,
    refiningIndex,
    aiComplaints,
    applyAiToRefiningCard,
    addAiComplaint,
    resetAiPanel,
  ]);

  const handlePatch = useCallback(
    (index: number, patch: Partial<Complaint>) => {
      dispatch({ type: "UPDATE_COMPLAINT", index, patch });
    },
    [dispatch]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const removedId = instanceIds[index];
      if (removedId === refiningInstanceId) resetAiPanel();
      dispatch({ type: "REMOVE_COMPLAINT", index });
      setInstanceIds((prev) => prev.filter((_, i) => i !== index));
      setActiveInstanceId((active) => (active === removedId ? null : active));
    },
    [dispatch, instanceIds, refiningInstanceId, resetAiPanel]
  );

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      dispatch({ type: "REORDER_COMPLAINTS", fromIndex, toIndex });
      setInstanceIds((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [dispatch]
  );

  const handleDemote = useCallback(
    (sourceIndex: number, targetParentId: string) => {
      const err = getDemoteComplaintError(
        complaints,
        sourceIndex,
        targetParentId
      );
      if (err) {
        setDemoteError(
          formatDemoteComplaintError(err, complaints[sourceIndex]?.name ?? "")
        );
        return;
      }

      setDemoteError(null);
      const removedId = instanceIds[sourceIndex];
      dispatch({ type: "DEMOTE_COMPLAINT", sourceIndex, targetParentId });
      setInstanceIds((prev) => prev.filter((_, i) => i !== sourceIndex));
      setActiveInstanceId((active) => (active === removedId ? null : active));
    },
    [complaints, dispatch, instanceIds]
  );

  const handleDropOnTarget = useCallback(
    (targetIndex: number, intent: MainComplaintDropIntent) => {
      const sourceIndex = dragIndexRef.current;
      if (sourceIndex === null || disabled) {
        clearDragState();
        return;
      }

      if (intent === "nest") {
        handleDemote(sourceIndex, complaints[targetIndex]!.id);
        clearDragState();
        return;
      }

      const toIndex =
        intent === "before"
          ? reorderInsertBeforeIndex(sourceIndex, targetIndex)
          : reorderInsertAfterIndex(sourceIndex, targetIndex);
      handleReorder(sourceIndex, toIndex);
      clearDragState();
    },
    [disabled, clearDragState, handleDemote, complaints, handleReorder]
  );

  const dragHandleProps = useCallback(
    (index: number) => ({
      draggable: !disabled,
      // Collapse the open card when the doctor presses the handle; visual drag
      // state is deferred to onDragStart so a click-without-drag doesn't grey
      // the card (and leave it stuck when dragend never fires).
      onMouseDown: () => {
        setActiveInstanceId(null);
        setDropTarget(null);
        setDemoteError(null);
      },
      onDragStart: (e: DragEvent<HTMLDivElement>) => {
        setActiveInstanceId(null);
        setDropTarget(null);
        setDemoteError(null);
        dragIndexRef.current = index;
        e.dataTransfer?.setData(MAIN_COMPLAINT_DRAG_MIME, String(index));
        e.dataTransfer?.setData("text/plain", String(index));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        setDragIndex(index);
      },
      onDragEnd: () => {
        clearDragState();
      },
    }),
    [disabled, clearDragState]
  );

  const handleCardDragOver = useCallback(
    (targetIndex: number, e: DragEvent<HTMLDivElement>) => {
      const sourceIndex = dragIndexRef.current;
      if (sourceIndex === null || sourceIndex === targetIndex) return;

      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      const rect = e.currentTarget.getBoundingClientRect();
      const intent = resolveMainComplaintDropIntent(e.clientY, rect);
      setDropTarget({ index: targetIndex, intent });
    },
    []
  );

  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
      "[role='button'][aria-label*='Complaint']"
    );
    const currentIndex = Array.from(focusable).indexOf(
      document.activeElement as HTMLElement
    );
    if (currentIndex === -1) return;

    if (e.key === "ArrowDown" && currentIndex < focusable.length - 1) {
      e.preventDefault();
      focusable[currentIndex + 1]?.focus();
    } else if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      focusable[currentIndex - 1]?.focus();
    }
  };

  return (
    <CollapsibleContainer
      id={CHIEF_COMPLAINTS_SECTION_ID}
      ariaLabel="Chief complaints"
      title="Chief complaints"
      sectionIcon={sectionHeaderIcon(
        resolveSubjectiveSectionIcon("chief_complaints")!
      )}
      toggleLabel="Toggle chief complaints"
      scrollIntoViewIfNeeded
      stickyHeader
      depthTone
      count={complaints.length}
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      className="scroll-mt-2"
      bodyClassName="space-y-2"
      leadingActions={
        <SectionReorderLeadingAction sectionId="chief_complaints" />
      }
      actions={
        !disabled ? (
          <SubjectiveSectionTemplateButton scope="chief_complaints" />
        ) : undefined
      }
    >
      <div className="space-y-2">
        <LastVisitComplaintsStrip disabled={disabled} />
        {!disabled ? (
          <ComplaintCaptureBar
            disabled={disabled}
            token={token}
            onCapture={handleCapture}
            inputId="complaint-capture"
            inputAriaLabel="Add chief complaint"
          />
        ) : null}

        {demoteError ? (
          <p className="text-xs text-destructive" role="alert">
            {demoteError}
          </p>
        ) : null}

        {complaints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Type a complaint above and press Enter to add. Tap a card later to
            fill onset, severity, and other details.
          </p>
        ) : (
          <div className="space-y-2" onKeyDown={handleListKeyDown}>
            {complaints.map((complaint, index) => {
              const instanceId = instanceIds[index] ?? complaint.id;
              const isDropTarget = dropTarget?.index === index;
              const dropIntent = isDropTarget ? dropTarget.intent : null;

              return (
                <div key={instanceId} className="relative">
                  {isDropTarget && dropIntent === "before" ? (
                    <div
                      className="pointer-events-none absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}

                  <div
                    onDragOver={(e) => handleCardDragOver(index, e)}
                    onDragLeave={(e) => {
                      if (
                        !e.currentTarget.contains(
                          e.relatedTarget as Node | null
                        )
                      ) {
                        setDropTarget((prev) =>
                          prev?.index === index ? null : prev
                        );
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndexRef.current === null) return;
                      const intent = resolveMainComplaintDropIntent(
                        e.clientY,
                        e.currentTarget.getBoundingClientRect()
                      );
                      handleDropOnTarget(index, intent);
                    }}
                  >
                    <ComplaintCard
                      index={index}
                      value={complaint}
                      scrollInstanceId={instanceId}
                      onPatch={handlePatch}
                      onRemove={handleRemove}
                      onRefine={
                        token && !disabled ? handleCardRefine : undefined
                      }
                      disabled={disabled}
                      isReadOnly={disabled}
                      isEditing={!disabled && activeInstanceId === instanceId}
                      onRequestEdit={(rowIndex) => {
                        if (disabled) return;
                        setActiveInstanceId(instanceIds[rowIndex] ?? null);
                      }}
                      onRequestCollapse={(rowIndex, source) => {
                        const rowInstanceId = instanceIds[rowIndex];
                        collapseSourceRef.current = source;
                        setActiveInstanceId((active) =>
                          active === rowInstanceId ? null : active
                        );
                      }}
                      dragHandleProps={dragHandleProps(index)}
                      token={token}
                      mainListDropIntent={dropIntent}
                      isMainListDragSource={dragIndex === index}
                      mainListDragActive={dragIndex !== null}
                      onMainNestHover={() => {
                        const sourceIndex = dragIndexRef.current;
                        if (sourceIndex !== null && sourceIndex !== index) {
                          setDropTarget({ index, intent: "nest" });
                        }
                      }}
                      onAcceptMainNestDrop={() => {
                        const sourceIndex = dragIndexRef.current;
                        if (sourceIndex !== null) {
                          handleDemote(sourceIndex, complaint.id);
                          clearDragState();
                        }
                      }}
                    />
                    {refiningInstanceId === instanceId &&
                    aiStatus !== "idle" ? (
                      <div className="mt-1">
                        <AiRefineProposal
                          status={aiStatus}
                          complaints={aiComplaints}
                          onAdd={handleAddAiIndex}
                          onAddAll={handleAddAllAi}
                          onDismiss={dismissAi}
                          onApply={cardApplied ? undefined : handleApplyAiIndex}
                          renameTo={refineMerge?.suggestedName}
                          onRename={
                            refineMerge?.suggestedName
                              ? handleRenameFromAi
                              : undefined
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  {isDropTarget && dropIntent === "after" ? (
                    <div
                      className="pointer-events-none absolute -bottom-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <SubjectiveOtherPhotosStrip disabled={disabled} />
      </div>
    </CollapsibleContainer>
  );
}
