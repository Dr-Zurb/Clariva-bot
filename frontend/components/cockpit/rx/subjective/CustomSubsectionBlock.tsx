"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import {
  CUSTOM_SUBSECTION_CHILDREN_MAX,
  type CustomSubsection,
  type CustomSubsectionChild,
} from "@/lib/cockpit/custom-subsections";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import { cn } from "@/lib/utils";

const CUSTOM_SUBSECTION_TITLE_MAX = 200;
const CUSTOM_SUBSECTION_BODY_MAX = 2000;

const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

const HEADER_TITLE_INPUT_CLASS =
  "min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground/80 placeholder:text-muted-foreground/70 focus:border-border focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-default disabled:opacity-100";

const ICON_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40";

function sectionDisplayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled section";
}

function childDisplayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled sub-section";
}

function ReorderButtons({
  index,
  count,
  disabled,
  labelPrefix,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  count: number;
  disabled?: boolean;
  labelPrefix: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={`${labelPrefix} order`}>
      <button
        type="button"
        disabled={disabled || index <= 0}
        aria-label={`Move ${labelPrefix} up`}
        className={ICON_BUTTON_CLASS}
        onClick={onMoveUp}
      >
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled || index >= count - 1}
        aria-label={`Move ${labelPrefix} down`}
        className={ICON_BUTTON_CLASS}
        onClick={onMoveDown}
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function CustomSubsectionChildRow({
  child,
  childIndex,
  childCount,
  disabled,
  focusOnMount,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  child: CustomSubsectionChild;
  childIndex: number;
  childCount: number;
  disabled?: boolean;
  focusOnMount?: boolean;
  onUpdate: (patch: Partial<CustomSubsectionChild>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div
      className="rounded-md border border-border/70 bg-background/60 p-2 space-y-2"
      data-testid={`custom-subsection-child-${child.id}`}
      role="group"
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {disabled ? (
            <span className={cn(RX_FIELD_LABEL_CLASS, "text-xs")}>Sub-section title</span>
          ) : (
            <label htmlFor={titleId} className={cn(RX_FIELD_LABEL_CLASS, "text-xs")}>
              Sub-section title
            </label>
          )}
          {disabled ? (
            <p className="text-sm text-foreground">{childDisplayTitle(child.title)}</p>
          ) : (
            <input
              ref={titleRef}
              id={titleId}
              type="text"
              value={child.title}
              disabled={disabled}
              maxLength={CUSTOM_SUBSECTION_TITLE_MAX}
              placeholder="Sub-section heading"
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0")}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
          )}
          {disabled ? (
            <span className={cn(RX_FIELD_LABEL_CLASS, "text-xs")}>Notes</span>
          ) : (
            <label htmlFor={bodyId} className={cn(RX_FIELD_LABEL_CLASS, "text-xs")}>
              Notes
            </label>
          )}
          {disabled ? (
            <p className="whitespace-pre-wrap text-sm text-foreground/90">
              {child.body?.trim() || "—"}
            </p>
          ) : (
            <textarea
              id={bodyId}
              rows={2}
              value={child.body ?? ""}
              disabled={disabled}
              maxLength={CUSTOM_SUBSECTION_BODY_MAX}
              placeholder="Free-text notes for this sub-section"
              className={cn(RX_FIELD_INPUT_CLASS, "mt-0 resize-y")}
              onChange={(e) => onUpdate({ body: e.target.value || null })}
            />
          )}
        </div>
        {!disabled ? (
          <div className="flex flex-col items-end gap-1 pt-6">
            <ReorderButtons
              index={childIndex}
              count={childCount}
              disabled={disabled}
              labelPrefix={childDisplayTitle(child.title)}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
            />
            <RemoveIconButton
              label={`Remove ${childDisplayTitle(child.title)}`}
              disabled={disabled}
              onClick={onRemove}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface CustomSubsectionBlockProps {
  section: CustomSubsection;
  sectionId: SubjectiveSectionId;
  disabled?: boolean;
  focusTitleOnMount?: boolean;
  pendingChildFocusId?: string | null;
  /** Header-mounted scoped template controls (subj-40). */
  templateActions?: ReactNode;
  onUpdate: (patch: Partial<CustomSubsection>) => void;
  onRemove: () => void;
  onAddChild: () => void;
  onUpdateChild: (childIndex: number, patch: Partial<CustomSubsectionChild>) => void;
  onRemoveChild: (childIndex: number) => void;
  onMoveChildUp: (childIndex: number) => void;
  onMoveChildDown: (childIndex: number) => void;
}

export function CustomSubsectionBlock({
  section,
  sectionId,
  disabled = false,
  focusTitleOnMount,
  pendingChildFocusId,
  templateActions,
  onUpdate,
  onRemove,
  onAddChild,
  onUpdateChild,
  onRemoveChild,
  onMoveChildUp,
  onMoveChildDown,
}: CustomSubsectionBlockProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyFieldId = useId();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const displayTitle = sectionDisplayTitle(section.title);
  const children = section.children ?? [];
  const preview =
    section.body?.trim() ||
    (children.length > 0 ? `${children.length} sub-section${children.length === 1 ? "" : "s"}` : null);

  useEffect(() => {
    if (focusTitleOnMount) setIsEditingTitle(true);
  }, [focusTitleOnMount]);

  useEffect(() => {
    if (isEditingTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [isEditingTitle]);

  const finishEditingTitle = useCallback(() => {
    const trimmed = section.title.trim();
    if (trimmed !== section.title) {
      onUpdate({ title: trimmed });
    }
    setIsEditingTitle(false);
  }, [onUpdate, section.title]);

  const headerTitleInput = disabled ? (
    <span className="truncate text-sm font-medium text-foreground/80">{displayTitle}</span>
  ) : (
    <input
      ref={titleRef}
      type="text"
      value={section.title}
      disabled={disabled}
      maxLength={CUSTOM_SUBSECTION_TITLE_MAX}
      placeholder="Custom section heading"
      aria-label="Section title"
      data-testid={`custom-subsection-title-${section.id}`}
      className={HEADER_TITLE_INPUT_CLASS}
      onChange={(e) => onUpdate({ title: e.target.value })}
      onBlur={finishEditingTitle}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          finishEditingTitle();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );

  const headerLeadingActions = disabled ? null : (
    <SectionReorderLeadingAction sectionId={sectionId} />
  );

  const headerActions = disabled ? null : (
    <>
      {templateActions}
      <button
        type="button"
        disabled={disabled}
        aria-label={`Rename ${displayTitle}`}
        className={ICON_BUTTON_CLASS}
        onClick={(e) => {
          e.stopPropagation();
          setIsEditingTitle(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      <RemoveIconButton
        label={`Remove ${displayTitle}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      />
    </>
  );

  return (
    <CollapsibleContainer
      id={`custom-subsection-${section.id}`}
      testId={`custom-subsection-${section.id}`}
      title={isEditingTitle ? undefined : displayTitle}
      interactiveTitle={isEditingTitle ? headerTitleInput : undefined}
      preview={preview}
      toggleLabel={`Toggle ${displayTitle}`}
      leadingActions={headerLeadingActions}
      actions={headerActions}
      defaultOpen
      bodyClassName="space-y-3 pt-0"
    >
      <div className="space-y-2">
        {disabled ? (
          <span className={RX_FIELD_LABEL_CLASS}>Section notes</span>
        ) : (
          <label htmlFor={bodyFieldId} className={RX_FIELD_LABEL_CLASS}>
            Section notes
          </label>
        )}
        {disabled ? (
          <p className="whitespace-pre-wrap text-sm text-foreground/90">
            {section.body?.trim() || "—"}
          </p>
        ) : (
          <textarea
            id={bodyFieldId}
            rows={3}
            value={section.body ?? ""}
            disabled={disabled}
            maxLength={CUSTOM_SUBSECTION_BODY_MAX}
            placeholder="Free-text notes for this section"
            className={cn(RX_FIELD_INPUT_CLASS, "mt-0 resize-y")}
            onChange={(e) => onUpdate({ body: e.target.value || null })}
          />
        )}
      </div>

      {children.length > 0 ? (
        <div className="space-y-2" data-testid={`custom-subsection-children-${section.id}`}>
          <p className={RX_FIELD_LABEL_CLASS}>Sub-sections</p>
          {children.map((child, childIndex) => (
            <CustomSubsectionChildRow
              key={child.id}
              child={child}
              childIndex={childIndex}
              childCount={children.length}
              disabled={disabled}
              focusOnMount={pendingChildFocusId === child.id}
              onUpdate={(patch) => onUpdateChild(childIndex, patch)}
              onRemove={() => onRemoveChild(childIndex)}
              onMoveUp={() => onMoveChildUp(childIndex)}
              onMoveDown={() => onMoveChildDown(childIndex)}
            />
          ))}
        </div>
      ) : null}

      {!disabled && children.length < CUSTOM_SUBSECTION_CHILDREN_MAX ? (
        <button
          type="button"
          className={ADD_CHIP_CLASS}
          data-testid={`custom-subsection-add-child-${section.id}`}
          onClick={onAddChild}
        >
          + Add sub-section
        </button>
      ) : null}
    </CollapsibleContainer>
  );
}
