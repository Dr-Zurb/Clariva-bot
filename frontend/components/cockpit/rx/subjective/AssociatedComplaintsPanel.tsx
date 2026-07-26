"use client";

import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import {
  scrollComplaintCardIntoView,
  scrollParentComplaintCardIntoView,
  type ComplaintCollapseSource,
} from "@/lib/cockpit/complaint-card-scroll";
import { COLLAPSE_CLOSE_MS } from "@/lib/cockpit/collapse-scroll";
import type { Complaint } from "@/components/cockpit/rx/RxFormContext";
import { ComplaintCard } from "@/components/cockpit/rx/subjective/ComplaintCard";
import {
  ComplaintCaptureBar,
  type ComplaintCapturePayload,
} from "@/components/cockpit/rx/subjective/ComplaintCaptureBar";
import { complaintNamesEquivalent } from "@/lib/cockpit/complaint-search-normalize";
import { useDepthToneSurface } from "@/components/ui/sticky-stack";
import { cn } from "@/lib/utils";

const ASSOCIATED_LABEL_CLASS = "block text-xs font-medium text-foreground/80";

export interface AssociatedSymptomsPanelProps {
  parentId: string;
  /** Scroll anchor for the parent chief-complaint card (close target). */
  parentScrollInstanceId: string;
  parentName: string;
  /** Suggested common-symptom chips for the parent's category. */
  suggestionChips: string[];
  associatedComplaints: Complaint[];
  activeChildId: string | null;
  setActiveChildId: (id: string | null) => void;
  disabled?: boolean;
  token?: string;
  onAddChild: (payload: ComplaintCapturePayload) => void;
  onPatchChild: (index: number, patch: Partial<Complaint>) => void;
  onRemoveChild: (index: number) => void;
  onReorderChildren: (fromIndex: number, toIndex: number) => void;
  onPromoteChild: (index: number) => void;
  getPromoteBlockedReason: (index: number) => string | null;
  promoteError?: string | null;
  mainListDragActive?: boolean;
  onMainNestHover?: () => void;
  onAcceptMainNestDrop?: () => void;
  isMainNestDropTarget?: boolean;
}

/** Associated symptoms: capture + chips add mini-cards directly (no tag/Detail step). */
export function AssociatedSymptomsPanel({
  parentId,
  parentScrollInstanceId,
  parentName,
  suggestionChips,
  associatedComplaints,
  activeChildId,
  setActiveChildId,
  disabled = false,
  token,
  onAddChild,
  onPatchChild,
  onRemoveChild,
  onReorderChildren,
  onPromoteChild,
  getPromoteBlockedReason,
  promoteError,
  mainListDragActive = false,
  onMainNestHover,
  onAcceptMainNestDrop,
  isMainNestDropTarget = false,
}: AssociatedSymptomsPanelProps) {
  const tone = useDepthToneSurface();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const collapseSourceRef = useRef<ComplaintCollapseSource | null>(null);
  const prevActiveChildIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const prev = prevActiveChildIdRef.current;
    prevActiveChildIdRef.current = activeChildId;

    if (activeChildId) {
      const switched = Boolean(prev && prev !== activeChildId);
      const delayMs = switched ? COLLAPSE_CLOSE_MS : 0;
      const childId = activeChildId;
      const timer = window.setTimeout(() => {
        scrollComplaintCardIntoView(childId);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }

    // Explicit collapse (header / lip / Escape) → glide the parent complaint
    // card to the top *concurrently* with the child body fold (live glide tracks
    // the shrink), so close is one motion, not fold-then-scroll. Blur-collapse
    // leaves the doctor where they clicked.
    if (prev && collapseSourceRef.current === "explicit") {
      collapseSourceRef.current = null;
      scrollParentComplaintCardIntoView(parentScrollInstanceId);
      return;
    }

    collapseSourceRef.current = null;
  }, [activeChildId, parentScrollInstanceId]);

  const captureInputId = `complaint-capture-associated-${parentId}`;
  const isDuplicateName = (name: string) =>
    associatedComplaints.some((c) => complaintNamesEquivalent(c.name, name));

  const visibleSuggestions = suggestionChips.filter((chip) => !isDuplicateName(chip));

  const handleCapture = (payload: ComplaintCapturePayload) => {
    if (disabled) return;
    if (isDuplicateName(payload.name)) return;
    onAddChild(payload);
  };

  const dragHandleProps = (index: number) => ({
    draggable: !disabled,
    onMouseDown: () => {
      setActiveChildId(null);
    },
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      setActiveChildId(null);
      e.dataTransfer?.setData("text/plain", String(index));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      setDragIndex(index);
    },
    onDragEnd: () => setDragIndex(null),
  });

  const handleMainNestDragOver = (e: DragEvent<HTMLElement>) => {
    if (!mainListDragActive) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    onMainNestHover?.();
  };

  const handleMainNestDrop = (e: DragEvent<HTMLElement>) => {
    if (!mainListDragActive) return;
    e.preventDefault();
    e.stopPropagation();
    onAcceptMainNestDrop?.();
  };

  const nestDropClass =
    isMainNestDropTarget && mainListDragActive
      ? "rounded-md border-2 border-dashed border-primary/50 bg-primary/5 ring-1 ring-primary/20"
      : "";

  return (
    <div
      className={`space-y-2 ${nestDropClass}`}
      role="group"
      aria-labelledby={`associated-heading-${parentId}`}
      onDragOver={handleMainNestDragOver}
      onDrop={handleMainNestDrop}
    >
      <p id={`associated-heading-${parentId}`} className={ASSOCIATED_LABEL_CLASS}>
        Associated symptoms
        {isMainNestDropTarget && mainListDragActive ? (
          <span className="ml-1.5 font-normal text-primary">— drop to link</span>
        ) : null}
      </p>

      {!disabled ? (
        <ComplaintCaptureBar
          disabled={disabled}
          token={token}
          onCapture={handleCapture}
          inputId={captureInputId}
          inputAriaLabel={`Add associated symptom for ${parentName}`}
        />
      ) : null}

      {visibleSuggestions.length > 0 && !disabled ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={`Common symptoms with ${parentName}`}
        >
          {visibleSuggestions.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleCapture({ name: chip })}
              className="min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
              aria-label={`Add ${chip}`}
            >
              + {chip}
            </button>
          ))}
        </div>
      ) : null}

      {promoteError ? (
        <p className="text-xs text-destructive" role="alert">
          {promoteError}
        </p>
      ) : null}

      {associatedComplaints.length > 0 ? (
        <div
          className={cn(
            "space-y-2",
            !tone.active && "border-l-2 border-primary/20 pl-3",
          )}
          role="group"
          aria-label={`Associated complaints of ${parentName}`}
        >
          {associatedComplaints.map((child, childIndex) => (
            <div
              key={child.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) onReorderChildren(dragIndex, childIndex);
                setDragIndex(null);
              }}
            >
              <ComplaintCard
                index={childIndex}
                value={child}
                depth={1}
                parentId={parentId}
                parentName={parentName}
                onPatch={(idx, patch) => onPatchChild(idx, patch)}
                onRemove={(idx) => onRemoveChild(idx)}
                onPromote={(idx) => onPromoteChild(idx)}
                promoteBlockedReason={getPromoteBlockedReason(childIndex)}
                disabled={disabled}
                isReadOnly={disabled}
                isEditing={!disabled && activeChildId === child.id}
                onRequestEdit={() => setActiveChildId(child.id)}
                onRequestCollapse={(_idx, source) => {
                  collapseSourceRef.current = source;
                  setActiveChildId((active) => (active === child.id ? null : active));
                }}
                dragHandleProps={dragHandleProps(childIndex)}
                token={token}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
