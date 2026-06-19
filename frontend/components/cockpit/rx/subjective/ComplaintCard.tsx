"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  GripVertical,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from "lucide-react";
import type { Complaint, ComplaintSeverity } from "@/types/prescription";
import type { ComplaintMasterRow } from "@/types/complaint-master";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  buildComplaintAssociatedSuffix,
  buildComplaintDetailSummary,
  complaintHasNotes,
  complaintNotesText,
  isComplaintComplete,
  isScoreInSeverityBand,
  listAssociatedComplaintNames,
  painScoreToSeverityBand,
  severityBandToScore,
  feverSummaryToneClass,
  severitySummaryToneClass,
  type ComplaintDetailSummary,
} from "@/lib/cockpit/complaint-card-state";
import {
  convertTemperatureUnit,
  feverGradeToTemperature,
  formatFeverGradeLabel,
  formatTemperatureDisplay,
  isFeltOnlyMeasured,
  isTemperatureInFeverGrade,
  temperatureToFeverGrade,
  type FeverGrade,
  type TemperatureUnit,
} from "@/lib/cockpit/fever-temperature";
import { ComplaintAssociatedNamesInline } from "@/components/cockpit/rx/subjective/ComplaintAssociatedNamesInline";
import { AssociatedSymptomsPanel } from "@/components/cockpit/rx/subjective/AssociatedComplaintsPanel";
import {
  COMPLAINT_CARD_HEADER_ATTR,
  COMPLAINT_CARD_INSTANCE_ATTR,
} from "@/lib/cockpit/complaint-card-scroll";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import { cn } from "@/lib/utils";
import type { ComplaintCapturePayload } from "@/components/cockpit/rx/subjective/ComplaintCaptureBar";
import {
  isLateralityValidForComplaint,
  parseComplaintText,
} from "@/lib/cockpit/parse-complaint-text";
import {
  buildConfirmedDefaultsPatch,
  filterSuggestionsForEmptyFields,
  mergePriorComplaintPools,
  resolveComplaintAttributeDefaults,
  suggestedFieldCount,
  type ComplaintAttributeDefaults,
} from "@/lib/cockpit/complaint-defaults";
import {
  COMPLAINT_QUICK_FIELD_KEYS,
  isAbdomenLateralityChips,
  isComplaintCategory,
  resolveAssociatedSymptomChips,
  resolveComplaintAttributeFields,
  resolveComplaintNameFieldDefaults,
  type ComplaintAttributeFieldDef,
  type ComplaintAttributeKey,
  type ComplaintCategory,
} from "@/lib/cockpit/complaint-schema";
import {
  buildInlineDurationOptions,
  DURATION_UNITS,
  formatDurationOptionLabel,
  parseDuration,
  serializeDuration,
  type DurationUnit,
} from "@/lib/cockpit/complaint-duration";
import type { MainComplaintDropIntent } from "@/lib/cockpit/complaint-drag";
import type { ComplaintCollapseSource } from "@/lib/cockpit/complaint-card-scroll";
import { getPromoteAssociatedComplaintError } from "@/lib/cockpit/complaint-tree";
import { ComplaintAutocomplete } from "@/components/cockpit/rx/subjective/ComplaintAutocomplete";
import { ParsedFieldsIndicator } from "@/components/cockpit/rx/subjective/ParsedFieldsIndicator";
import {
  buildParsedCueItems,
  readParsedFields,
  recordParsedFields,
  type ParsedCueItem,
} from "@/lib/cockpit/parsed-fields-signal";
import {
  createEmptyComplaint,
  useOptionalRxForm,
} from "@/components/cockpit/rx/RxFormContext";
import { getLastSubjectiveForPatient } from "@/lib/api/last-subjective";
import { recordNoteFavoriteUse } from "@/lib/api/note-favorites";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";

const SUGGESTED_CHIP_CLASS =
  "border-dashed border-primary/60 bg-primary/5 text-foreground hover:border-primary";
const SUGGESTED_INPUT_CLASS = "border-dashed border-primary/50 bg-primary/5";
const PRIOR_CHARTING_ARIA_SUFFIX = "(from prior charting)";

function priorChartingHelperText(value: string): string {
  return `Prior charting: ${value}`;
}

/** Shared rail geometry — collapsed and expanded cards use identical drag + badge placement. */
const COMPLAINT_CARD_DRAG_CLASS =
  "flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing";

const COMPLAINT_CARD_COMPACT_INPUT =
  "mt-0.5 w-full min-h-9 rounded-md border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted/30";

const COMPLAINT_CARD_COMPACT_LABEL = "block text-xs font-medium text-foreground/80";

const COMPLAINT_CARD_CHIP_CLASS =
  "min-h-9 rounded-full border px-2.5 text-xs disabled:opacity-50";

const lastSubjectiveComplaintsCache = new Map<string, Complaint[]>();

function ComplaintCardDragHandle({
  dragHandleProps,
  ariaLabel,
  stopPropagation = false,
}: {
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  ariaLabel: string;
  stopPropagation?: boolean;
}) {
  return (
    <div
      {...dragHandleProps}
      className={COMPLAINT_CARD_DRAG_CLASS}
      onClick={stopPropagation ? (e) => e.stopPropagation() : dragHandleProps?.onClick}
      aria-label={ariaLabel}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </div>
  );
}

function ComplaintCardBadge({ label }: { label: string }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
      aria-hidden
    >
      {label}
    </span>
  );
}

function ComplaintPromoteButton({
  ariaLabel,
  disabled,
  blockedReason,
  onPromote,
}: {
  ariaLabel: string;
  disabled?: boolean;
  blockedReason?: string | null;
  onPromote: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={blockedReason ?? "Move to main complaints"}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onPromote();
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
    >
      <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

export interface ComplaintCardProps {
  index: number;
  value: Complaint;
  onPatch: (index: number, patch: Partial<Complaint>) => void;
  onRemove: (index: number) => void;
  /** 0 = chief complaint; 1 = associated mini-card (subj-12). */
  depth?: 0 | 1;
  parentId?: string;
  parentName?: string;
  disabled?: boolean;
  isEditing?: boolean;
  onRequestEdit?: (index: number) => void;
  onRequestCollapse?: (index: number, source: ComplaintCollapseSource) => void;
  isReadOnly?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  /** Explicit category from `complaint_master` (Phase 2); v1 infers from name. */
  category?: ComplaintCategory | null;
  nameInputRef?: (el: HTMLInputElement | null) => void;
  token?: string;
  /** Stable scroll target id — main list passes row instance id; defaults to `value.id`. */
  scrollInstanceId?: string;
  /** Promote nested associated symptom to the main complaints list (depth 1 only). */
  onPromote?: (index: number) => void;
  /** Shown as button title when promote is blocked (e.g. duplicate name). */
  promoteBlockedReason?: string | null;
  /** Main-list drag: reorder-before / reorder-after / nest highlight. */
  mainListDropIntent?: MainComplaintDropIntent | null;
  isMainListDragSource?: boolean;
  mainListDragActive?: boolean;
  onMainNestHover?: () => void;
  onAcceptMainNestDrop?: () => void;
}

function mainListDragSurfaceClass(
  dropIntent: MainComplaintDropIntent | null | undefined,
): string {
  // Drop-target affordances only — the dragged card itself stays at full opacity
  // (dimming on mousedown stuck when the doctor clicked without dragging).
  if (dropIntent === "nest") {
    return "ring-2 ring-primary/40 bg-primary/5";
  }
  return "";
}

const INLINE_CARD_CONTROL_CLASS =
  "h-7 w-full rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50";

const INLINE_CARD_DROPDOWN_CLASS =
  "absolute left-0 right-0 top-full z-40 mt-0.5 max-h-44 overflow-auto rounded-md border border-border/80 bg-card py-0.5 shadow-md";

function stopCardActivation(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function inlineCardOptionClass(active: boolean): string {
  return `cursor-pointer border-l-2 px-2 py-1.5 text-xs transition-colors ${
    active
      ? "border-l-primary bg-primary/15 font-medium text-foreground"
      : "border-l-transparent text-foreground/90 hover:bg-muted/50"
  }`;
}

function useInlineDropdownDismiss(
  wrapperRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, onClose, wrapperRef]);
}

function InlineCardDropdownList({
  id,
  options,
  activeIdx,
  onSelect,
  onActiveIdxChange,
  optionRefs,
}: {
  id: string;
  options: Array<{ key: string; label: string }>;
  activeIdx: number;
  onSelect: (idx: number) => void;
  onActiveIdxChange: (idx: number) => void;
  optionRefs: MutableRefObject<Array<HTMLLIElement | null>>;
}) {
  useEffect(() => {
    optionRefs.current[activeIdx]?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, optionRefs]);

  return (
    <ul id={id} role="listbox" className={INLINE_CARD_DROPDOWN_CLASS}>
      {options.map((option, idx) => (
        <li
          key={option.key}
          id={`${id}-opt-${idx}`}
          ref={(el) => {
            optionRefs.current[idx] = el;
          }}
          role="option"
          aria-selected={idx === activeIdx}
          onMouseEnter={() => onActiveIdxChange(idx)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(idx);
          }}
          className={inlineCardOptionClass(idx === activeIdx)}
        >
          {option.label}
        </li>
      ))}
    </ul>
  );
}

function InlineDurationCombo({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const listId = `${id}-list`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const activeIdxRef = useRef(0);
  const durationOptionsRef = useRef<ReturnType<typeof buildInlineDurationOptions>>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const parsed = parseDuration(value);

  const numericDraft = draft.replace(/\D/g, "");
  const n = Number.parseInt(numericDraft, 10);
  const durationOptions = useMemo(
    () => (Number.isFinite(n) && n > 0 ? buildInlineDurationOptions(n) : []),
    [n],
  );
  const listOptions = useMemo(
    () => durationOptions.map((o) => ({ key: o.unit, label: o.label })),
    [durationOptions],
  );
  const showDropdown = open && listOptions.length > 0;

  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);
  useEffect(() => {
    durationOptionsRef.current = durationOptions;
  }, [durationOptions]);

  const committedLabel = parsed
    ? formatDurationOptionLabel(parsed.value, parsed.unit)
    : value.trim() || "";

  const closeDropdown = useCallback(() => setOpen(false), []);
  useInlineDropdownDismiss(wrapperRef, open, closeDropdown);

  const commit = (serialized: string) => {
    onChange(serialized);
    setDraft("");
    setOpen(false);
  };

  const handleFocus = () => {
    setOpen(true);
    setDraft(parsed ? String(parsed.value) : "");
    setActiveIdx(0);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, 4);
    setDraft(next);
    setOpen(true);
    setActiveIdx(0);
    if (!next) onChange("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    stopCardActivation(e);
    if (!showDropdown) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((idx) => Math.min(idx + 1, listOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((idx) => Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = durationOptionsRef.current[activeIdxRef.current];
      if (picked) commit(picked.serialized);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative w-[5.75rem] shrink-0"
      onClick={stopCardActivation}
      onKeyDown={stopCardActivation}
    >
      <input
        type="text"
        inputMode="numeric"
        value={open ? draft : committedLabel}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Duration"
        disabled={disabled}
        aria-label="Duration"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls={showDropdown ? listId : undefined}
        aria-activedescendant={showDropdown ? `${listId}-opt-${activeIdx}` : undefined}
        role="combobox"
        className={`${INLINE_CARD_CONTROL_CLASS} placeholder:text-muted-foreground/70`}
      />
      {showDropdown ? (
        <InlineCardDropdownList
          id={listId}
          options={listOptions}
          activeIdx={activeIdx}
          onActiveIdxChange={setActiveIdx}
          onSelect={(idx) => {
            const picked = durationOptions[idx];
            if (picked) commit(picked.serialized);
          }}
          optionRefs={optionRefs}
        />
      ) : null}
    </div>
  );
}

function ComplaintCardDurationField({
  index,
  value,
  disabled,
  onDurationChange,
}: {
  index: number;
  value: Complaint;
  disabled?: boolean;
  onDurationChange: (duration: string) => void;
}) {
  const durationValue = typeof value.duration === "string" ? value.duration : "";

  return (
    <InlineDurationCombo
      id={`complaint-duration-${index}`}
      value={durationValue}
      disabled={disabled}
      onChange={onDurationChange}
    />
  );
}

function ComplaintNotePopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((current) => !current);
          }}
          aria-label={`Note: ${text}`}
          data-testid="complaint-card-note-trigger"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <StickyNote className="h-3.5 w-3.5" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        className="max-w-xs p-2 text-xs leading-snug"
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </HoverCardContent>
    </HoverCard>
  );
}

function ComplaintCardDetailSummaryLine({
  summary,
  severity,
  feverGrade,
  className,
}: {
  summary: ComplaintDetailSummary;
  severity: ComplaintSeverity | null | undefined;
  feverGrade?: FeverGrade | null;
  className?: string;
}) {
  if (!summary.hasRow) return null;

  const leadToneClass =
    severity !== null && severity !== undefined
      ? severitySummaryToneClass(severity)
      : feverSummaryToneClass(feverGrade);

  return (
    <div
      className={cn("truncate text-xs leading-tight", className)}
      data-testid="complaint-card-detail-summary"
    >
      {summary.severityLabel ? (
        <span className={`font-medium ${leadToneClass}`}>
          {summary.severityLabel}
        </span>
      ) : null}
      {summary.severityLabel && summary.detailText ? (
        <span className="text-muted-foreground"> · </span>
      ) : null}
      {summary.detailText ? (
        <span className="text-muted-foreground">{summary.detailText}</span>
      ) : null}
    </div>
  );
}

interface ComplaintCardSummaryProps {
  index: number;
  value: Complaint;
  depth: 0 | 1;
  parentName?: string;
  readOnly?: boolean;
  disabled?: boolean;
  onPatch?: (index: number, patch: Partial<Complaint>) => void;
  onRequestEdit?: (index: number) => void;
  onRemove?: (index: number) => void;
  onPromote?: (index: number) => void;
  promoteBlockedReason?: string | null;
  mainListDropIntent?: MainComplaintDropIntent | null;
  isMainListDragSource?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  scrollInstanceId?: string;
  parsedCue?: ReactNode;
}

function complaintSummaryAriaLabel(
  index: number,
  value: Complaint,
  depth: 0 | 1,
  parentName: string | undefined,
  readOnly: boolean,
): string {
  const suffix = buildComplaintAssociatedSuffix(value);
  const displayName = formatComplaintDisplayName(value.name);
  const nameWithCount = suffix ? `${displayName} · ${suffix}` : displayName;
  if (depth === 1 && parentName) {
    return readOnly
      ? `Associated symptom ${index + 1} of ${parentName}: ${nameWithCount}`
      : `Associated symptom ${index + 1} of ${parentName}: ${nameWithCount} — tap to edit`;
  }
  return readOnly
    ? `Complaint ${index + 1}: ${nameWithCount}`
    : `Complaint ${index + 1}: ${nameWithCount} — tap to edit`;
}

function ComplaintCardSummary({
  index,
  value,
  depth,
  parentName,
  readOnly = false,
  disabled = false,
  onPatch,
  onRequestEdit,
  onRemove,
  onPromote,
  promoteBlockedReason,
  mainListDropIntent,
  isMainListDragSource,
  dragHandleProps,
  scrollInstanceId,
  parsedCue,
}: ComplaintCardSummaryProps) {
  const instanceId = scrollInstanceId ?? value.id;
  const associatedNames = listAssociatedComplaintNames(value);
  const displayName = formatComplaintDisplayName(value.name);
  const badgeLabel = depth === 1 ? `A${index + 1}` : String(index + 1);
  const dragLabel =
    depth === 1 && parentName
      ? `Drag associated symptom ${index + 1} of ${parentName}`
      : `Drag complaint ${index + 1}`;
  const canEditInline = !readOnly && Boolean(onPatch);
  const durationValue = typeof value.duration === "string" ? value.duration : "";
  const detailSummary = buildComplaintDetailSummary(value);
  const hasNotes = complaintHasNotes(value);
  const notesText = complaintNotesText(value);
  const detailsLabel =
    depth === 1
      ? `Associated symptom ${index + 1} details`
      : `Complaint ${index + 1} details`;
  const promoteLabel =
    depth === 1 && parentName
      ? `Move ${value.name.trim() || "symptom"} to main complaints`
      : `Move complaint ${index + 1} to main complaints`;
  const canPromote = depth === 1 && Boolean(onPromote) && value.name.trim().length > 0;

  function handleExpandKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRequestEdit?.(index);
    }
  }

  return (
    <div
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => onRequestEdit?.(index)}
      onKeyDown={readOnly ? undefined : handleExpandKeyDown}
      {...{ [COMPLAINT_CARD_INSTANCE_ATTR]: instanceId }}
      className={`group relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring data-[readonly=true]:cursor-default data-[readonly=true]:hover:bg-card ${mainListDragSurfaceClass(
        mainListDropIntent,
      )}`}
      data-readonly={readOnly || undefined}
      aria-label={complaintSummaryAriaLabel(index, value, depth, parentName, readOnly)}
    >
      {depth === 0 && mainListDropIntent === "nest" ? (
        <span className="pointer-events-none absolute inset-x-2 bottom-1 truncate text-center text-[10px] font-medium text-primary">
          Link as associated symptom
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <ComplaintCardDragHandle
          dragHandleProps={dragHandleProps}
          ariaLabel={dragLabel}
          stopPropagation
        />
        <ComplaintCardBadge label={badgeLabel} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline text-sm font-medium leading-tight">
          <span className="shrink-0">{displayName}</span>
          {parsedCue ? <span className="ml-1 self-center">{parsedCue}</span> : null}
          {associatedNames.length > 0 ? (
            <ComplaintAssociatedNamesInline names={associatedNames} />
          ) : null}
        </div>
        {detailSummary.hasRow || hasNotes ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-0.5 overflow-hidden">
            {detailSummary.hasRow ? (
              <ComplaintCardDetailSummaryLine
                summary={detailSummary}
                severity={value.severity}
                feverGrade={value.feverGrade}
                className="min-w-0"
              />
            ) : null}
            {hasNotes ? <ComplaintNotePopover text={notesText} /> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {canEditInline ? (
          <ComplaintCardDurationField
            index={index}
            value={value}
            disabled={disabled}
            onDurationChange={(duration) => onPatch!(index, { duration })}
          />
        ) : readOnly && durationValue.trim() ? (
          <span className="max-w-[8rem] truncate text-xs text-muted-foreground">
            {durationValue.trim()}
          </span>
        ) : null}

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestEdit?.(index);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label={detailsLabel}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
            {canPromote ? (
              <ComplaintPromoteButton
                ariaLabel={promoteLabel}
                disabled={disabled}
                blockedReason={promoteBlockedReason}
                onPromote={() => onPromote!(index)}
              />
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.(index);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive"
              aria-label={`Remove complaint ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SeverityField({
  id,
  value,
  suggestedValue,
  disabled,
  onChange,
  compact = false,
}: {
  id: string;
  value: ComplaintSeverity | null | undefined;
  suggestedValue?: ComplaintSeverity | null;
  disabled?: boolean;
  onChange: (next: ComplaintSeverity | null) => void;
  compact?: boolean;
}) {
  const chipClass = compact ? COMPLAINT_CARD_CHIP_CLASS : "min-h-11 rounded-full border px-3 text-sm disabled:opacity-50";
  const options: Array<{ value: ComplaintSeverity; label: string }> = [
    { value: "mild", label: "Mild" },
    { value: "moderate", label: "Moderate" },
    { value: "severe", label: "Severe" },
    { value: "very_severe", label: "Very severe" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
      <span id={id} className="sr-only">
        Severity
      </span>
      {options.map((option) => {
        const selected = value === option.value;
        const isSuggested =
          (value === null || value === undefined) && suggestedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={
              isSuggested ? `${option.label} ${PRIOR_CHARTING_ARIA_SUFFIX}` : option.label
            }
            onClick={() => onChange(selected ? null : option.value)}
            className={`${chipClass} ${
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : isSuggested
                  ? SUGGESTED_CHIP_CLASS
                  : "border-border text-muted-foreground hover:border-primary/60"
            }`}
          >
            {option.label}
            {isSuggested ? (
              <span className="sr-only"> {PRIOR_CHARTING_ARIA_SUFFIX}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function painScoreBand(score: number): string {
  if (score <= 0) return "No pain";
  if (score <= 3) return "Mild";
  if (score <= 6) return "Moderate";
  if (score <= 8) return "Severe";
  return "Very severe";
}

/** 0–10 Numeric Rating Scale (NRS) — draggable, with a Clear escape to unset. */
function PainScaleField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: number | null | undefined;
  disabled?: boolean;
  onChange: (next: number | null) => void;
}) {
  const score = typeof value === "number" ? value : null;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={score ?? 0}
        disabled={disabled}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-primary disabled:opacity-50"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={score ?? undefined}
        aria-valuetext={score === null ? "Not set" : `${score} out of 10 (${painScoreBand(score)})`}
      />
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {score === null ? "Not set" : `${score}/10 · ${painScoreBand(score)}`}
      </span>
      {score !== null ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Clear pain score"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

/**
 * Merged severity control for pain cards (subj-14 refine): the categorical chips
 * and the 0–10 NRS slider as one two-way-linked widget.
 *  - Drag the slider → the band chip highlights (0 clears both).
 *  - Tap a chip → sets a representative score, *unless* the score is already in
 *    that band (so a precise number the doctor dialled in isn't snapped away).
 *  - Clear (chip toggle-off or slider Clear) → clears both.
 */
function FeverGradeField({
  id,
  value,
  suggestedValue,
  disabled,
  onChange,
  compact = false,
}: {
  id: string;
  value: FeverGrade | null | undefined;
  suggestedValue?: FeverGrade | null;
  disabled?: boolean;
  onChange: (next: FeverGrade | null) => void;
  compact?: boolean;
}) {
  const chipClass = compact ? COMPLAINT_CARD_CHIP_CLASS : "min-h-11 rounded-full border px-3 text-sm disabled:opacity-50";
  const options: Array<{ value: FeverGrade; label: string }> = [
    { value: "mild", label: "Mild" },
    { value: "moderate", label: "Moderate" },
    { value: "high", label: "High" },
    { value: "very_high", label: "Very high" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
      <span id={id} className="sr-only">
        Fever grade
      </span>
      {options.map((option) => {
        const selected = value === option.value;
        const isSuggested =
          (value === null || value === undefined) && suggestedValue === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={
              isSuggested ? `${option.label} ${PRIOR_CHARTING_ARIA_SUFFIX}` : option.label
            }
            onClick={() => onChange(selected ? null : option.value)}
            className={`${chipClass} ${
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : isSuggested
                  ? SUGGESTED_CHIP_CLASS
                  : "border-border text-muted-foreground hover:border-primary/60"
            }`}
          >
            {option.label}
            {isSuggested ? (
              <span className="sr-only"> {PRIOR_CHARTING_ARIA_SUFFIX}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function TemperatureInputField({
  id,
  temperature,
  unit,
  disabled,
  onChange,
}: {
  id: string;
  temperature: number | null | undefined;
  unit: TemperatureUnit;
  disabled?: boolean;
  onChange: (patch: {
    temperature: number | null;
    temperatureUnit: TemperatureUnit;
    feverGrade: FeverGrade | null;
  }) => void;
}) {
  const min = unit === "F" ? 95 : 35;
  const max = unit === "F" ? 110 : 43;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(
    typeof temperature === "number" ? String(temperature) : "",
  );

  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setDraft(typeof temperature === "number" ? String(temperature) : "");
  }, [temperature, unit]);

  const TEMP_STEP = 0.1;

  const commitValue = (raw: string) => {
    if (!raw.trim()) {
      setDraft("");
      onChange({ temperature: null, temperatureUnit: unit, feverGrade: null });
      return;
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      setDraft(typeof temperature === "number" ? String(temperature) : "");
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n * 10) / 10));
    setDraft(String(clamped));
    onChange({
      temperature: clamped,
      temperatureUnit: unit,
      feverGrade: temperatureToFeverGrade(clamped, unit),
    });
  };

  const resolveStepBase = (): number => {
    if (typeof temperature === "number") return temperature;
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) return parsed;
    return unit === "F" ? 99 : 37;
  };

  const adjustTemperature = (delta: number) => {
    if (disabled) return;
    const next = Math.min(
      max,
      Math.max(min, Math.round((resolveStepBase() + delta) * 10) / 10),
    );
    commitValue(String(next));
    inputRef.current?.focus();
  };

  const switchUnit = (nextUnit: TemperatureUnit) => {
    if (unit === nextUnit) return;
    const nextTemp =
      typeof temperature === "number"
        ? convertTemperatureUnit(temperature, unit, nextUnit)
        : null;
    onChange({
      temperature: nextTemp,
      temperatureUnit: nextUnit,
      feverGrade:
        typeof nextTemp === "number" ? temperatureToFeverGrade(nextTemp, nextUnit) : null,
    });
    if (typeof nextTemp === "number") {
      setDraft(String(nextTemp));
    }
  };

  const clearTemperature = () => {
    setDraft("");
    onChange({ temperature: null, temperatureUnit: unit, feverGrade: null });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-24">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          placeholder={unit === "F" ? "e.g. 101" : "e.g. 38.5"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitValue(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitValue(draft);
              inputRef.current?.blur();
            }
          }}
          className={`${COMPLAINT_CARD_COMPACT_INPUT} w-full pr-7 tabular-nums`}
          aria-label={`Temperature in degrees ${unit === "F" ? "Fahrenheit" : "Celsius"}`}
        />
        {/* preventDefault keeps focus in the input so the click doesn't blur-commit
            the typed draft before the stepper/unit reads it (stale-base bug). */}
        <div className="absolute inset-y-0 right-0 flex w-6 flex-col border-l border-border">
          <button
            type="button"
            disabled={disabled}
            aria-label="Increase temperature"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustTemperature(TEMP_STEP)}
            className="flex flex-1 items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <ChevronUp className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label="Decrease temperature"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => adjustTemperature(-TEMP_STEP)}
            className="flex flex-1 items-center justify-center border-t border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Temperature unit">
        {(["F", "C"] as const).map((u) => (
          <button
            key={u}
            type="button"
            disabled={disabled}
            aria-pressed={unit === u}
            aria-label={u === "F" ? "Fahrenheit" : "Celsius"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => switchUnit(u)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              unit === u
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            °{u}
          </button>
        ))}
      </div>
      {typeof temperature === "number" ? (
        <span className="text-xs text-muted-foreground">
          {formatTemperatureDisplay(temperature, unit)}
          {temperatureToFeverGrade(temperature, unit)
            ? ` · ${formatFeverGradeLabel(temperatureToFeverGrade(temperature, unit))}`
            : ""}
        </span>
      ) : null}
      {typeof temperature === "number" ? (
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearTemperature}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Clear temperature"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

/** Linked fever grade chips + exact temperature (mirrors SeverityScaleControl). */
function FeverGradeControl({
  id,
  feverGrade,
  temperature,
  temperatureUnit,
  suggestedFeverGrade,
  disabled,
  measuredBy,
  onChange,
  compact,
}: {
  id: string;
  feverGrade: FeverGrade | null | undefined;
  temperature: number | null | undefined;
  temperatureUnit: TemperatureUnit | null | undefined;
  suggestedFeverGrade?: FeverGrade | null;
  disabled?: boolean;
  measuredBy?: string | null;
  onChange: (patch: Partial<Complaint>) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? COMPLAINT_CARD_COMPACT_LABEL : RX_FIELD_LABEL_CLASS;
  const unit: TemperatureUnit = temperatureUnit ?? "F";
  const feltOnly = isFeltOnlyMeasured(measuredBy);

  return (
    <div>
      <span className={labelClass}>Temperature</span>
      <FeverGradeField
        id={id}
        value={feverGrade}
        suggestedValue={suggestedFeverGrade}
        disabled={disabled}
        compact={compact}
        onChange={(next) => {
          if (next === null) {
            onChange({ feverGrade: null, temperature: null });
            return;
          }
          if (feltOnly) {
            onChange({ feverGrade: next, temperature: null });
            return;
          }
          const patch: Partial<Complaint> = { feverGrade: next };
          if (!isTemperatureInFeverGrade(temperature, unit, next)) {
            patch.temperature = feverGradeToTemperature(next, unit);
            patch.temperatureUnit = unit;
          }
          onChange(patch);
        }}
      />
      {feltOnly ? (
        <p className="mt-1 text-xs text-muted-foreground">Subjective — no exact reading</p>
      ) : (
        <div className="mt-1">
          <TemperatureInputField
            id={`${id}-reading`}
            temperature={temperature}
            unit={unit}
            disabled={disabled}
            onChange={(next) => onChange(next)}
          />
        </div>
      )}
    </div>
  );
}

function SeverityScaleControl({
  id,
  severity,
  painScore,
  suggestedSeverity,
  disabled,
  onChange,
  compact,
}: {
  id: string;
  severity: ComplaintSeverity | null | undefined;
  painScore: number | null | undefined;
  suggestedSeverity?: ComplaintSeverity | null;
  disabled?: boolean;
  onChange: (patch: Partial<Complaint>) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? COMPLAINT_CARD_COMPACT_LABEL : RX_FIELD_LABEL_CLASS;
  return (
    <div>
      <span className={labelClass}>Severity</span>
      <SeverityField
        id={id}
        value={severity}
        suggestedValue={suggestedSeverity}
        disabled={disabled}
        compact={compact}
        onChange={(next) => {
          if (next === null) {
            onChange({ severity: null, painScore: null });
            return;
          }
          const patch: Partial<Complaint> = { severity: next };
          if (!isScoreInSeverityBand(painScore, next)) {
            const repr = severityBandToScore(next);
            if (repr !== null) patch.painScore = repr;
          }
          onChange(patch);
        }}
      />
      <div className="mt-1">
        <PainScaleField
          id={`${id}-scale`}
          value={painScore}
          disabled={disabled}
          onChange={(nextScore) => {
            if (nextScore === null) {
              onChange({ painScore: null, severity: null });
              return;
            }
            onChange({ painScore: nextScore, severity: painScoreToSeverityBand(nextScore) });
          }}
        />
      </div>
    </div>
  );
}

function DurationField({
  id,
  field,
  value,
  suggestedValue,
  disabled,
  onPatch,
  compact = false,
}: {
  id: string;
  field: ComplaintAttributeFieldDef;
  value: string;
  suggestedValue?: string;
  disabled?: boolean;
  onPatch: (patch: Partial<Complaint>) => void;
  compact?: boolean;
}) {
  const chipClass = compact
    ? COMPLAINT_CARD_CHIP_CLASS
    : "min-h-11 rounded-full border px-3 text-sm disabled:opacity-50";
  const inputClass = compact ? COMPLAINT_CARD_COMPACT_INPUT : RX_FIELD_INPUT_CLASS;
  const parsed = parseDuration(value);
  const hasSuggestion = !value.trim() && Boolean(suggestedValue?.trim());

  const commitNumber = (rawNum: string, unit: DurationUnit) => {
    const n = Number.parseInt(rawNum, 10);
    onPatch({ duration: Number.isFinite(n) && n > 0 ? serializeDuration(n, unit) : "" });
  };

  return (
    <div>
      <div
        className={`flex flex-wrap gap-1 ${compact ? "mb-1" : "mb-2 gap-1.5"}`}
        role="group"
        aria-label="Duration presets"
      >
        {(field.chips ?? []).map((chip) => {
          const selected = value.trim().toLowerCase() === chip.toLowerCase();
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={chip}
              onClick={() => onPatch({ duration: selected ? "" : chip })}
              className={`${chipClass} ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/60"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          min={1}
          max={999}
          inputMode="numeric"
          value={parsed ? String(parsed.value) : ""}
          onChange={(e) => commitNumber(e.target.value, parsed?.unit ?? "day")}
          placeholder="No."
          disabled={disabled}
          aria-label="Duration value"
          className={`${inputClass} w-16`}
        />
        <select
          value={parsed?.unit ?? "day"}
          onChange={(e) => {
            const unit = e.target.value as DurationUnit;
            if (parsed) onPatch({ duration: serializeDuration(parsed.value, unit) });
          }}
          disabled={disabled || !parsed}
          aria-label="Duration unit"
          className={`${inputClass} flex-1`}
        >
          {DURATION_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}s
            </option>
          ))}
        </select>
        <input
          type="text"
          value={parsed ? "" : value}
          onChange={(e) => onPatch({ duration: e.target.value })}
          placeholder={hasSuggestion ? suggestedValue : field.placeholder}
          disabled={disabled}
          aria-label="Custom duration"
          className={`${inputClass} flex-1 ${hasSuggestion ? SUGGESTED_INPUT_CLASS : ""}`}
          maxLength={60}
        />
      </div>
      {hasSuggestion ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {priorChartingHelperText(suggestedValue!)}
        </p>
      ) : null}
    </div>
  );
}

function ChipFieldRow({
  index,
  field,
  value,
  suggestedValue,
  disabled,
  onPatch,
  compact = false,
}: {
  index: number;
  field: ComplaintAttributeFieldDef;
  value: Complaint;
  suggestedValue?: string;
  disabled?: boolean;
  onPatch: (patch: Partial<Complaint>) => void;
  compact?: boolean;
}) {
  const chipClass = compact ? COMPLAINT_CARD_CHIP_CLASS : "min-h-11 rounded-full border px-3 text-sm disabled:opacity-50";
  const labelClass = compact ? COMPLAINT_CARD_COMPACT_LABEL : RX_FIELD_LABEL_CLASS;
  const inputId = `complaint-${field.key}-${index}`;
  const fieldValue = value[field.key];
  const textValue = typeof fieldValue === "string" ? fieldValue : "";
  const hasSuggestion = !textValue && Boolean(suggestedValue?.trim());
  const inputClass = compact
    ? `${COMPLAINT_CARD_COMPACT_INPUT}${hasSuggestion ? ` ${SUGGESTED_INPUT_CLASS}` : ""}`
    : `${RX_FIELD_INPUT_CLASS}${hasSuggestion ? ` ${SUGGESTED_INPUT_CLASS}` : ""}`;
  // The abdomen 9-region laterality renders as an anatomically-ordered 3×3 grid
  // (top-left = upper right quadrant) instead of a flat wrap.
  const isAbdomenGrid =
    field.key === "laterality" && isAbdomenLateralityChips(field.chips);

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {field.label}
      </label>
      {field.chips && field.chips.length > 0 ? (
        <div
          className={
            isAbdomenGrid
              ? `grid grid-cols-3 gap-1 ${compact ? "mb-1" : "mb-2 gap-1.5"}`
              : `flex flex-wrap gap-1 ${compact ? "mb-1" : "mb-2 gap-1.5"}`
          }
          role="group"
          aria-label={`${field.label} chips`}
        >
          {field.chips.map((chip) => {
            const selected = textValue.toLowerCase() === chip.toLowerCase();
            const isSuggested =
              !textValue && suggestedValue?.toLowerCase() === chip.toLowerCase();
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={isSuggested ? `${chip} ${PRIOR_CHARTING_ARIA_SUFFIX}` : chip}
                onClick={() => onPatch({ [field.key]: selected ? "" : chip })}
                className={`${chipClass} ${
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : isSuggested
                      ? SUGGESTED_CHIP_CLASS
                      : "border-border text-muted-foreground hover:border-primary/60"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        id={inputId}
        type="text"
        value={textValue}
        onChange={(e) => onPatch({ [field.key]: e.target.value })}
        placeholder={hasSuggestion ? suggestedValue : field.placeholder}
        disabled={disabled}
        className={inputClass}
        maxLength={200}
        aria-describedby={hasSuggestion ? `${inputId}-suggested` : undefined}
      />
      {hasSuggestion ? (
        <p id={`${inputId}-suggested`} className="mt-1 text-xs text-muted-foreground">
          {priorChartingHelperText(suggestedValue!)}
        </p>
      ) : null}
    </div>
  );
}

function AttributeFieldRow({
  index,
  field,
  value,
  suggestions,
  disabled,
  onPatch,
  compact = false,
}: {
  index: number;
  field: ComplaintAttributeFieldDef;
  value: Complaint;
  suggestions: ComplaintAttributeDefaults;
  disabled?: boolean;
  onPatch: (patch: Partial<Complaint>) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? COMPLAINT_CARD_COMPACT_LABEL : RX_FIELD_LABEL_CLASS;
  const inputId = `complaint-${field.key}-${index}`;
  const suggestedRaw = suggestions[field.key];
  const suggestedText = typeof suggestedRaw === "string" ? suggestedRaw : undefined;
  const suggestedSeverity =
    field.key === "severity" && typeof suggestedRaw !== "string" ? suggestedRaw : undefined;

  if (field.type === "severity") {
    return (
      <div>
        <span className={labelClass}>{field.label}</span>
        <SeverityField
          id={inputId}
          value={value.severity}
          suggestedValue={suggestedSeverity}
          disabled={disabled}
          onChange={(severity) => onPatch({ severity })}
          compact={compact}
        />
      </div>
    );
  }

  if (field.type === "painscale") {
    // Pain scale is rendered inside the merged SeverityScaleControl, not as a
    // standalone row (it's filtered out of the body field list). Render nothing
    // if it ever reaches here.
    return null;
  }

  if (field.type === "temperature") {
    return null;
  }

  if (field.type === "duration") {
    const durationValue = typeof value.duration === "string" ? value.duration : "";
    return (
      <div>
        <span className={labelClass}>{field.label}</span>
        <DurationField
          id={inputId}
          field={field}
          value={durationValue}
          suggestedValue={suggestedText}
          disabled={disabled}
          onPatch={onPatch}
          compact={compact}
        />
      </div>
    );
  }

  if (field.type === "chips") {
    return (
      <ChipFieldRow
        index={index}
        field={field}
        value={value}
        suggestedValue={suggestedText}
        disabled={disabled}
        onPatch={onPatch}
        compact={compact}
      />
    );
  }

  const fieldValue = value[field.key];
  const textValue = typeof fieldValue === "string" ? fieldValue : "";
  const hasSuggestion = !textValue && Boolean(suggestedText?.trim());
  const inputClass = compact
    ? `${COMPLAINT_CARD_COMPACT_INPUT}${hasSuggestion ? ` ${SUGGESTED_INPUT_CLASS}` : ""}`
    : `${RX_FIELD_INPUT_CLASS}${hasSuggestion ? ` ${SUGGESTED_INPUT_CLASS}` : ""}`;

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {field.label}
      </label>
      <input
        id={inputId}
        type="text"
        value={textValue}
        onChange={(e) => onPatch({ [field.key]: e.target.value })}
        placeholder={hasSuggestion ? suggestedText : field.placeholder}
        disabled={disabled}
        className={inputClass}
        maxLength={200}
        aria-describedby={hasSuggestion ? `${inputId}-suggested` : undefined}
      />
      {hasSuggestion ? (
        <p id={`${inputId}-suggested`} className="mt-1 text-xs text-muted-foreground">
          {priorChartingHelperText(suggestedText!)}
        </p>
      ) : null}
    </div>
  );
}

function SuggestionBanner({
  count,
  disabled,
  onConfirm,
  onDismiss,
  compact = false,
}: {
  count: number;
  disabled?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  if (count === 0) return null;

  const btnClass = compact
    ? "min-h-9 rounded-md px-2.5 text-xs font-medium disabled:opacity-50"
    : "min-h-11 rounded-md px-3 text-xs font-medium disabled:opacity-50";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 ${
        compact ? "px-2 py-1.5" : "px-3 py-2 gap-2"
      }`}
      data-testid="complaint-suggestion-banner"
    >
      <p className="text-xs text-foreground">
        {count} empty field{count === 1 ? "" : "s"} match{count === 1 ? "es" : ""} your prior
        charting
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className={`${btnClass} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          Apply from history
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className={`${btnClass} border border-border text-muted-foreground hover:text-foreground`}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function ComplaintCardCollapseLip({
  ariaLabel,
  disabled,
  onCollapse,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onCollapse: () => void;
}) {
  return (
    <div
      className="relative flex justify-center py-0"
      data-testid="complaint-card-collapse-lip"
    >
      <span
        className="pointer-events-none absolute inset-x-2 top-0 h-px bg-border/50"
        aria-hidden
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onCollapse}
        aria-label={ariaLabel}
        aria-expanded
        className="relative -mt-2 flex h-5 w-7 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-50"
      >
        <ChevronUp className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

export function ComplaintCard({
  index,
  value,
  onPatch,
  onRemove,
  depth = 0,
  parentId,
  parentName,
  disabled = false,
  isEditing = true,
  onRequestEdit,
  onRequestCollapse,
  isReadOnly = false,
  dragHandleProps,
  category: categoryProp = null,
  nameInputRef,
  token,
  onPromote,
  promoteBlockedReason,
  mainListDropIntent = null,
  isMainListDragSource = false,
  mainListDragActive = false,
  onMainNestHover,
  onAcceptMainNestDrop,
  scrollInstanceId,
}: ComplaintCardProps) {
  const instanceId = scrollInstanceId ?? value.id;
  const rxForm = useOptionalRxForm();
  const dispatch = rxForm?.dispatch;
  const rowDisabled = disabled || isReadOnly;
  const resolvedCategory =
    (value.category && isComplaintCategory(value.category) ? value.category : null) ??
    categoryProp;
  const attributeFields = useMemo(
    () =>
      resolveComplaintAttributeFields({
        complaintName: value.name,
        category: resolvedCategory,
      }),
    [value.name, resolvedCategory],
  );
  const attributeKeys = useMemo(
    () => attributeFields.map((field) => field.key),
    [attributeFields],
  );
  const expandedFields = useMemo(
    () =>
      attributeFields.filter(
        (field) =>
          !COMPLAINT_QUICK_FIELD_KEYS.includes(field.key) &&
          field.key !== "severity" &&
          field.key !== "measuredBy" &&
          field.key !== "reportedBy" &&
          // Merged controls — not standalone body rows.
          field.type !== "painscale" &&
          field.type !== "temperature",
      ),
    [attributeFields],
  );
  const severityField = useMemo(
    () => attributeFields.find((field) => field.key === "severity"),
    [attributeFields],
  );
  const measuredByField = useMemo(
    () => attributeFields.find((field) => field.key === "measuredBy"),
    [attributeFields],
  );
  const reportedByField = useMemo(
    () => attributeFields.find((field) => field.key === "reportedBy"),
    [attributeFields],
  );
  const temperatureField = useMemo(
    () => attributeFields.find((field) => field.type === "temperature"),
    [attributeFields],
  );
  const hasPainScale = useMemo(
    () => attributeFields.some((field) => field.type === "painscale"),
    [attributeFields],
  );
  const [suggestions, setSuggestions] = useState<ComplaintAttributeDefaults>({});
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [lastVisitComplaints, setLastVisitComplaints] = useState<Complaint[]>([]);
  const prevNameRef = useRef(value.name);

  const siblingComplaints = useMemo(() => {
    const all = rxForm?.state.fields.complaints ?? [];
    return all.filter((_, i) => i !== index);
  }, [rxForm?.state.fields.complaints, index]);

  useEffect(() => {
    const patientId = rxForm?.patientId;
    const appointmentId = rxForm?.appointmentId;
    if (!token || !patientId || !appointmentId) return;

    const cacheKey = `${patientId}:${appointmentId}`;
    const cached = lastSubjectiveComplaintsCache.get(cacheKey);
    if (cached) {
      setLastVisitComplaints(cached);
      return;
    }

    let cancelled = false;
    void getLastSubjectiveForPatient(token, patientId, appointmentId)
      .then((res) => {
        const rows = res.data.subjective?.complaints ?? [];
        lastSubjectiveComplaintsCache.set(cacheKey, rows);
        if (!cancelled) setLastVisitComplaints(rows);
      })
      .catch(() => {
        if (!cancelled) setLastVisitComplaints([]);
      });

    return () => {
      cancelled = true;
    };
  }, [token, rxForm?.patientId, rxForm?.appointmentId]);

  const priorPool = useMemo(
    () => mergePriorComplaintPools(lastVisitComplaints, siblingComplaints),
    [lastVisitComplaints, siblingComplaints],
  );

  useEffect(() => {
    if (prevNameRef.current !== value.name) {
      prevNameRef.current = value.name;
      setSuggestionsDismissed(false);
    }

    if (suggestionsDismissed || !value.name.trim()) {
      if (!value.name.trim()) setSuggestions({});
      return;
    }

    const raw = resolveComplaintAttributeDefaults({
      complaintName: value.name,
      category: resolvedCategory,
      priorComplaints: priorPool,
      attributeKeys,
    });
    setSuggestions(filterSuggestionsForEmptyFields(value, raw, attributeKeys));
  }, [
    value,
    value.name,
    resolvedCategory,
    priorPool,
    suggestionsDismissed,
    attributeKeys,
  ]);

  // Name-derived fill, applied once per recognised name (mirrors the capture
  // parse so editing a card's name re-parses trailing detail — subj-13 §2).
  // Precedence: parsed free-text > name-default prefill. Both fill EMPTY fields
  // only, so a doctor's entry is never overwritten. The catalog/typed name is
  // left untouched here (no rename on manual edit); only field slots are filled.
  const appliedNameDefaultsForRef = useRef<string | null>(null);
  useEffect(() => {
    const trimmed = value.name.trim();
    if (!trimmed) {
      appliedNameDefaultsForRef.current = null;
      return;
    }
    const nameKey = trimmed.toLowerCase();
    if (appliedNameDefaultsForRef.current === nameKey) return;
    appliedNameDefaultsForRef.current = nameKey;

    const nameDefaults = resolveComplaintNameFieldDefaults(value.name);
    const parsed = parseComplaintText(value.name);
    const patch: Partial<Complaint> = {};
    for (const fieldKey of attributeKeys) {
      const parsedValue = (parsed.patch as Record<string, unknown>)[fieldKey];
      const implied =
        typeof parsedValue === "string" && parsedValue
          ? parsedValue
          : nameDefaults[fieldKey];
      if (typeof implied !== "string" || !implied) continue;
      const current = value[fieldKey];
      if (typeof current === "string" && current.trim()) continue;
      if (
        fieldKey === "laterality" &&
        !isLateralityValidForComplaint(value.name, value.category ?? undefined, implied)
      ) {
        continue;
      }
      (patch as Record<string, string>)[fieldKey] = implied;
    }
    if (Object.keys(patch).length > 0) onPatch(index, patch);
  }, [value, attributeKeys, index, onPatch]);

  const associatedSuggestionChips = useMemo(
    () =>
      resolveAssociatedSymptomChips({
        complaintName: value.name,
        category: resolvedCategory,
      }),
    [value.name, resolvedCategory],
  );
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Transparency cue (subj-13 §3): read-and-clear what the parser auto-filled
  // for this complaint at capture. Only freshly-parsed cards register, so
  // hydrated/saved cards never show a spurious cue.
  const [parsedCue, setParsedCue] = useState<ParsedCueItem[]>([]);
  useEffect(() => {
    const items = readParsedFields(value.id);
    if (items.length > 0) setParsedCue(items);
    // value.id is stable for a card instance — read once on mount. The signal
    // self-expires, so a brief remount won't drain it and stale cues won't recur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const parsedCueNode =
    parsedCue.length > 0 ? <ParsedFieldsIndicator items={parsedCue} /> : null;

  const rootComplaints = rxForm?.state.fields.complaints ?? [];
  const shouldShowSummary =
    isComplaintComplete(value) && (isReadOnly || isEditing === false);

  if (shouldShowSummary) {
    return (
      <ComplaintCardSummary
        index={index}
        value={value}
        depth={depth}
        parentName={parentName}
        readOnly={isReadOnly}
        disabled={disabled}
        onPatch={onPatch}
        onRequestEdit={onRequestEdit}
        onRemove={onRemove}
        onPromote={onPromote}
        promoteBlockedReason={promoteBlockedReason}
        mainListDropIntent={mainListDropIntent}
        isMainListDragSource={isMainListDragSource}
        dragHandleProps={dragHandleProps}
        scrollInstanceId={instanceId}
        parsedCue={parsedCueNode}
      />
    );
  }

  const handlePatch = (patch: Partial<Complaint>) => {
    let nextPatch =
      typeof patch.name === "string"
        ? { ...patch, name: formatComplaintDisplayName(patch.name) }
        : patch;
    const nextMeasuredBy =
      nextPatch.measuredBy !== undefined ? nextPatch.measuredBy : value.measuredBy;
    const feltOnly = nextMeasuredBy?.trim() === "Felt only";
    if (feltOnly) {
      nextPatch = { ...nextPatch, temperature: null };
    } else if (
      nextPatch.measuredBy !== undefined &&
      nextPatch.measuredBy?.trim() !== "Felt only"
    ) {
      nextPatch = { ...nextPatch, reportedBy: null };
    }
    onPatch(index, nextPatch);
    setSuggestions((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(nextPatch) as ComplaintAttributeKey[]) {
        if (key in next) delete next[key];
      }
      return next;
    });
  };

  const handleConfirmSuggestions = () => {
    const patch = buildConfirmedDefaultsPatch(suggestions);
    handlePatch(patch);
    setSuggestions({});
    setSuggestionsDismissed(true);
  };

  const handleDismissSuggestions = () => {
    setSuggestions({});
    setSuggestionsDismissed(true);
  };

  const suggestionCount = suggestedFieldCount(suggestions);
  const associatedComplaints = value.associatedComplaints ?? [];
  const badgeLabel = depth === 1 ? `A${index + 1}` : String(index + 1);
  const collapseHeaderLabel =
    depth === 1 && parentName
      ? `Collapse associated symptom ${index + 1} of ${parentName}`
      : `Collapse complaint ${index + 1}`;
  const collapseLipLabel =
    depth === 1 && parentName
      ? `Finish and collapse associated symptom ${index + 1} of ${parentName}`
      : `Finish and collapse complaint ${index + 1}`;
  const collapseNameLabel =
    depth === 1 && parentName
      ? `Associated symptom ${index + 1} of ${parentName}: ${value.name.trim() || "symptom"} — collapse`
      : `Complaint ${index + 1}: ${value.name.trim() || "Untitled complaint"} — collapse`;
  const dragLabel =
    depth === 1 && parentName
      ? `Drag associated symptom ${index + 1} of ${parentName}`
      : `Drag complaint ${index + 1}`;
  const associatedNames = listAssociatedComplaintNames(value);
  const associatedSuffix = buildComplaintAssociatedSuffix(value);
  const associatedNamesTitle = associatedSuffix ?? undefined;
  const expandedDisplayName =
    formatComplaintDisplayName(value.name) ||
    (depth === 1 ? "Associated symptom" : "Untitled complaint");
  const removeLabel =
    depth === 1 && parentName
      ? `Remove associated symptom ${index + 1} of ${parentName}`
      : `Remove complaint ${index + 1}`;
  const promoteLabel =
    depth === 1 && parentName
      ? `Move ${value.name.trim() || "symptom"} to main complaints`
      : `Move complaint ${index + 1} to main complaints`;
  const canPromote = depth === 1 && Boolean(onPromote) && value.name.trim().length > 0;

  const handleComplaintSelect = (complaint: ComplaintMasterRow) => {
    const nextCategory = isComplaintCategory(complaint.category)
      ? complaint.category
      : undefined;
    handlePatch({ name: complaint.name, category: nextCategory });
    if (token) {
      void recordNoteFavoriteUse(token, {
        fieldKey: "complaint_name",
        value: complaint.name,
      });
    }
  };

  const handleAddAssociated = ({ name, category, rawText }: ComplaintCapturePayload) => {
    if (!dispatch) return;
    // Parse typed detail off the original text; keep the catalog name when one
    // matched. Children are one level deep, so nested `associated` is ignored.
    const parsed = parseComplaintText(rawText?.trim() || name);
    const childName = formatComplaintDisplayName((rawText ? name.trim() : parsed.name) || name.trim());
    const child = createEmptyComplaint();
    child.name = childName;
    if (category) child.category = category;
    Object.assign(child, parsed.patch);
    if (!isLateralityValidForComplaint(child.name, child.category ?? undefined, child.laterality)) {
      delete child.laterality;
    }
    // Children are one level deep, so any nested `associated` is dropped here.
    recordParsedFields(child.id, buildParsedCueItems(child, parsed.patch, []));
    dispatch({ type: "ADD_COMPLAINT", complaint: child, parentId: value.id });
  };

  const resolveChildPromoteBlockedReason = (childIndex: number): string | null => {
    if (depth !== 0) return null;
    if (promoteError) return promoteError;
    const err = getPromoteAssociatedComplaintError(rootComplaints, value.id, childIndex);
    if (err === "duplicate_name") {
      const name = associatedComplaints[childIndex]?.name.trim() || "This symptom";
      return `${name} is already a main complaint`;
    }
    return null;
  };

  const handlePromoteChild = (childIndex: number) => {
    if (!dispatch || depth !== 0) return;
    const err = getPromoteAssociatedComplaintError(rootComplaints, value.id, childIndex);
    if (err === "duplicate_name") {
      const name = associatedComplaints[childIndex]?.name.trim() || "This symptom";
      setPromoteError(`${name} is already a main complaint`);
      return;
    }
    if (err) return;
    setPromoteError(null);
    const promotedId = associatedComplaints[childIndex]?.id;
    dispatch({ type: "PROMOTE_COMPLAINT", parentId: value.id, childIndex });
    if (promotedId && activeChildId === promotedId) {
      setActiveChildId(null);
    }
  };

  return (
    <div
      {...{ [COMPLAINT_CARD_INSTANCE_ATTR]: instanceId }}
      className={`relative overflow-hidden rounded-md border border-border bg-card ${mainListDragSurfaceClass(
        depth === 0 ? mainListDropIntent : null,
      )}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && isComplaintComplete(value)) {
          onRequestCollapse?.(index, "explicit");
        }
      }}
    >
      <div
        {...{ [COMPLAINT_CARD_HEADER_ATTR]: true }}
        className="scroll-mt-2 flex min-h-9 items-center gap-1.5 border-b border-border/60 bg-muted/25 px-2"
      >
        <ComplaintCardDragHandle
          dragHandleProps={dragHandleProps}
          ariaLabel={dragLabel}
          stopPropagation
        />
        <ComplaintCardBadge label={badgeLabel} />

        <button
          type="button"
          disabled={rowDisabled}
          onClick={() => onRequestCollapse?.(index, "explicit")}
          className="min-h-8 min-w-0 flex-1 truncate rounded-sm px-1 text-left text-sm font-medium leading-tight hover:bg-muted/50 disabled:opacity-50"
          aria-label={collapseNameLabel}
          aria-expanded
        >
          {expandedDisplayName}
          {associatedSuffix && depth === 0 ? (
            <span
              className="font-normal text-muted-foreground"
              title={associatedNamesTitle}
            >
              {" "}
              · {associatedSuffix}
            </span>
          ) : null}
        </button>

        {!isReadOnly ? (
          <ComplaintCardDurationField
            index={index}
            value={value}
            disabled={rowDisabled}
            onDurationChange={(duration) => handlePatch({ duration })}
          />
        ) : null}

        <button
          type="button"
          disabled={rowDisabled}
          onClick={() => onRequestCollapse?.(index, "explicit")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          aria-label={collapseHeaderLabel}
          aria-expanded
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>

        {!isReadOnly && canPromote ? (
          <ComplaintPromoteButton
            ariaLabel={promoteLabel}
            disabled={rowDisabled}
            blockedReason={promoteBlockedReason}
            onPromote={() => onPromote!(index)}
          />
        ) : null}

        {!isReadOnly ? (
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={rowDisabled}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-destructive disabled:opacity-50"
            aria-label={removeLabel}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="space-y-2 px-2 py-1.5">
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor={`complaint-name-${value.id}`} className={COMPLAINT_CARD_COMPACT_LABEL}>
              Name
            </label>
            {parsedCueNode}
          </div>
          {token ? (
            <ComplaintAutocomplete
              inputId={`complaint-name-${value.id}`}
              value={value.name}
              onChange={(name) => handlePatch({ name })}
              onSelect={handleComplaintSelect}
              token={token}
              disabled={rowDisabled}
              inputRef={nameInputRef}
              ariaLabel="Complaint name"
              className="min-h-9 [&_input]:min-h-9 [&_input]:py-1.5 [&_input]:text-sm"
            />
          ) : (
            <input
              id={`complaint-name-${value.id}`}
              ref={nameInputRef}
              type="text"
              value={value.name}
              onChange={(e) => handlePatch({ name: e.target.value })}
              placeholder="e.g. Headache"
              disabled={rowDisabled}
              className={COMPLAINT_CARD_COMPACT_INPUT}
              maxLength={200}
              aria-label="Complaint name"
            />
          )}
        </div>

        {depth === 0 && dispatch ? (
          <AssociatedSymptomsPanel
            parentId={value.id}
            parentName={value.name.trim() || "complaint"}
            suggestionChips={associatedSuggestionChips}
            associatedComplaints={associatedComplaints}
            activeChildId={activeChildId}
            setActiveChildId={setActiveChildId}
            disabled={rowDisabled}
            token={token}
            onAddChild={handleAddAssociated}
            onPatchChild={(childIndex, patch) =>
              dispatch({
                type: "UPDATE_COMPLAINT",
                index: childIndex,
                patch,
                parentId: value.id,
              })
            }
            onRemoveChild={(childIndex) =>
              dispatch({
                type: "REMOVE_COMPLAINT",
                index: childIndex,
                parentId: value.id,
              })
            }
            onReorderChildren={(fromIndex, toIndex) =>
              dispatch({
                type: "REORDER_COMPLAINTS",
                fromIndex,
                toIndex,
                parentId: value.id,
              })
            }
            onPromoteChild={handlePromoteChild}
            getPromoteBlockedReason={resolveChildPromoteBlockedReason}
            promoteError={promoteError}
            mainListDragActive={mainListDragActive}
            onMainNestHover={onMainNestHover}
            onAcceptMainNestDrop={onAcceptMainNestDrop}
            isMainNestDropTarget={mainListDropIntent === "nest"}
          />
        ) : null}

        {measuredByField ? (
          <AttributeFieldRow
            key={measuredByField.key}
            index={index}
            field={measuredByField}
            value={value}
            suggestions={suggestions}
            disabled={rowDisabled}
            onPatch={handlePatch}
            compact
          />
        ) : null}

        {reportedByField && isFeltOnlyMeasured(value.measuredBy) ? (
          <AttributeFieldRow
            key={reportedByField.key}
            index={index}
            field={reportedByField}
            value={value}
            suggestions={suggestions}
            disabled={rowDisabled}
            onPatch={handlePatch}
            compact
          />
        ) : null}

        {temperatureField ? (
          <FeverGradeControl
            key={temperatureField.key}
            id={`complaint-temperature-${index}`}
            feverGrade={value.feverGrade}
            temperature={value.temperature}
            temperatureUnit={value.temperatureUnit}
            measuredBy={value.measuredBy}
            suggestedFeverGrade={
              typeof suggestions.feverGrade === "string"
                ? (suggestions.feverGrade as FeverGrade)
                : undefined
            }
            disabled={rowDisabled}
            onChange={handlePatch}
            compact
          />
        ) : null}

        {severityField ? (
          hasPainScale ? (
            <SeverityScaleControl
              key={severityField.key}
              id={`complaint-severity-${index}`}
              severity={value.severity}
              painScore={value.painScore}
              suggestedSeverity={
                typeof suggestions.severity !== "string" ? suggestions.severity : undefined
              }
              disabled={rowDisabled}
              onChange={handlePatch}
              compact
            />
          ) : (
            <AttributeFieldRow
              key={severityField.key}
              index={index}
              field={severityField}
              value={value}
              suggestions={suggestions}
              disabled={rowDisabled}
              onPatch={handlePatch}
              compact
            />
          )
        ) : null}

        <SuggestionBanner
          count={suggestionCount}
          disabled={rowDisabled}
          onConfirm={handleConfirmSuggestions}
          onDismiss={handleDismissSuggestions}
          compact
        />
        {expandedFields.map((field) => (
          <AttributeFieldRow
            key={field.key}
            index={index}
            field={field}
            value={value}
            suggestions={suggestions}
            disabled={rowDisabled}
            onPatch={handlePatch}
            compact
          />
        ))}
      </div>

      <ComplaintCardCollapseLip
        ariaLabel={collapseLipLabel}
        disabled={rowDisabled}
        onCollapse={() => onRequestCollapse?.(index, "explicit")}
      />
    </div>
  );
}
