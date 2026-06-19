"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { RemoveIconButton } from "@/components/cockpit/rx/subjective/RemoveIconButton";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  OBJECTIVE_CUSTOM_SECTIONS_MAX,
  objectiveCustomSectionsStructureKey,
  objectiveCustomSectionsToDefaultTemplate,
  saveObjectiveCustomSectionsDefault,
  type CustomSubsection,
} from "@/lib/cockpit/custom-objective-sections";
import { cn } from "@/lib/utils";

const CUSTOM_SECTION_TITLE_MAX = 200;
const CUSTOM_SECTION_BODY_MAX = 3000;
const DOCTOR_CUSTOM_SECTIONS_AUTOSAVE_MS = 500;

const ADD_CHIP_CLASS =
  "min-h-9 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50";

function sectionDisplayTitle(title: string): string {
  return title.trim() || "Untitled section";
}

export interface ObjectiveCustomSectionBlockProps {
  section: CustomSubsection;
  /** Index within `fields.objectiveCustomSections`. */
  index: number;
  disabled?: boolean;
  focusTitleOnMount?: boolean;
  /** Reorder grip supplied by ObjectiveSection (obj-11 shell). */
  leadingActions?: ReactNode;
}

/** A single per-visit objective custom free-text block (title + notes). */
export function ObjectiveCustomSectionBlock({
  section,
  index,
  disabled = false,
  focusTitleOnMount,
  leadingActions,
}: ObjectiveCustomSectionBlockProps) {
  const { dispatch } = useRxForm();
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const displayTitle = sectionDisplayTitle(section.title);

  useEffect(() => {
    if (focusTitleOnMount) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [focusTitleOnMount]);

  const handleUpdate = useCallback(
    (patch: Partial<CustomSubsection>) => {
      if (disabled) return;
      dispatch({ type: "UPDATE_OBJECTIVE_CUSTOM_SECTION", index, patch });
    },
    [disabled, dispatch, index],
  );

  const handleRemove = useCallback(() => {
    if (disabled) return;
    dispatch({ type: "REMOVE_OBJECTIVE_CUSTOM_SECTION", index });
  }, [disabled, dispatch, index]);

  const headerActions = disabled ? null : (
    <RemoveIconButton
      label={`Remove ${displayTitle}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        handleRemove();
      }}
    />
  );

  return (
    <CollapsibleContainer
      id={`objective-custom-section-${section.id}`}
      testId={`objective-custom-section-${section.id}`}
      title={displayTitle}
      preview={section.body?.trim() || null}
      toggleLabel={`Toggle ${displayTitle}`}
      leadingActions={disabled ? undefined : leadingActions}
      actions={headerActions}
      defaultOpen
      bodyClassName="space-y-3 px-3 pb-3 pt-0"
    >
      <div className="space-y-2">
        {disabled ? (
          <span className={RX_FIELD_LABEL_CLASS}>Section title</span>
        ) : (
          <label htmlFor={titleId} className={RX_FIELD_LABEL_CLASS}>
            Section title
          </label>
        )}
        {disabled ? (
          <p className="text-sm text-foreground">{displayTitle}</p>
        ) : (
          <input
            ref={titleRef}
            id={titleId}
            type="text"
            value={section.title}
            disabled={disabled}
            maxLength={CUSTOM_SECTION_TITLE_MAX}
            placeholder="e.g. P/V · P/S, ROM, lesion notes, MSE"
            data-testid={`objective-custom-section-title-${section.id}`}
            className={cn(RX_FIELD_INPUT_CLASS, "mt-0")}
            onChange={(e) => handleUpdate({ title: e.target.value })}
          />
        )}
      </div>

      <div className="space-y-2">
        {disabled ? (
          <span className={RX_FIELD_LABEL_CLASS}>Notes</span>
        ) : (
          <label htmlFor={bodyId} className={RX_FIELD_LABEL_CLASS}>
            Notes
          </label>
        )}
        {disabled ? (
          <p className="whitespace-pre-wrap text-sm text-foreground/90">
            {section.body?.trim() || "—"}
          </p>
        ) : (
          <textarea
            id={bodyId}
            rows={3}
            value={section.body ?? ""}
            disabled={disabled}
            maxLength={CUSTOM_SECTION_BODY_MAX}
            placeholder="Free-text exam content for this section"
            data-testid={`objective-custom-section-body-${section.id}`}
            className={cn(RX_FIELD_INPUT_CLASS, "mt-0 resize-y")}
            onChange={(e) => handleUpdate({ body: e.target.value || null })}
          />
        )}
      </div>
    </CollapsibleContainer>
  );
}

export interface ObjectiveCustomSectionsChromeProps {
  disabled?: boolean;
  onAdd: () => void;
}

/**
 * In-page add affordance + per-doctor default autosave for objective custom
 * sections. Renders an empty-state add panel when none exist, otherwise an
 * add-more footer. The doctor default (`objective_custom_sections`) autosaves
 * its title/structure whenever the section structure changes (obj-13 §1.2).
 */
export function ObjectiveCustomSectionsChrome({
  disabled = false,
  onAdd,
}: ObjectiveCustomSectionsChromeProps) {
  const { state, token } = useRxForm();
  const sections = state.fields.objectiveCustomSections;
  const [saveDefaultStatus, setSaveDefaultStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastPersistedStructureRef = useRef<string>(
    objectiveCustomSectionsStructureKey(state.fields.objectiveCustomSections),
  );

  useEffect(() => {
    if (disabled || !token) return;

    const structureKey = objectiveCustomSectionsStructureKey(sections);
    if (structureKey === lastPersistedStructureRef.current) return;

    const template = objectiveCustomSectionsToDefaultTemplate(sections);
    // Untitled-only edits never reach the default (the template drops them).
    if (template.length === 0 && sections.length > 0) {
      lastPersistedStructureRef.current = structureKey;
      return;
    }

    setSaveDefaultStatus("saving");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveObjectiveCustomSectionsDefault(token, sections);
          lastPersistedStructureRef.current = structureKey;
          setSaveDefaultStatus("saved");
        } catch {
          setSaveDefaultStatus("error");
        }
      })();
    }, DOCTOR_CUSTOM_SECTIONS_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [disabled, sections, token]);

  if (disabled) return null;

  if (sections.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-4"
        data-testid="objective-custom-sections-empty"
      >
        <p className="text-center text-sm text-muted-foreground">
          Add your own exam sections — e.g. P/V·P/S, range of motion, lesion notes, MSE.
        </p>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className={ADD_CHIP_CLASS}
            data-testid="objective-custom-sections-add-first"
            onClick={onAdd}
          >
            + Add custom section
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {saveDefaultStatus === "saved" ? (
        <span className="text-xs text-muted-foreground" role="status">
          Default saved
        </span>
      ) : null}
      {saveDefaultStatus === "error" ? (
        <span className="text-xs text-destructive" role="status">
          Could not save default
        </span>
      ) : null}
      {sections.length < OBJECTIVE_CUSTOM_SECTIONS_MAX ? (
        <button
          type="button"
          className={ADD_CHIP_CLASS}
          data-testid="objective-custom-sections-add-more"
          onClick={onAdd}
        >
          + Add custom section
        </button>
      ) : null}
    </div>
  );
}
