"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildAssessmentTemplateApplyActions,
  buildAssessmentTemplateSavePayload,
  defaultAssessmentSaveName,
  assessmentScopeHasContent,
  SAVE_EMPTY_MESSAGES,
  SAVE_PROMPT_LABELS,
  type AssessmentTemplateScope,
} from "@/lib/cockpit/apply-assessment-template";
import {
  knownConditionsTemplateHasContent,
} from "@/lib/chart/use-known-conditions-template-apply";
import type {
  DoctorRxTemplate,
  RxTemplateKnownCondition,
} from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

/** Chart bridge for Known conditions templates (Assessment). */
export interface KnownConditionsTemplateBridge {
  snapshotForSave: () => RxTemplateKnownCondition[];
  hasContent: () => boolean;
  applyFromTemplate: (template: DoctorRxTemplate) => Promise<void>;
}

export interface AssessmentSectionTemplateButtonProps {
  scope: Exclude<AssessmentTemplateScope, "assessment_full">;
  disabled?: boolean;
  knownConditionsBridge?: KnownConditionsTemplateBridge | null;
}

/**
 * Scoped save / apply for an Assessment L1 (diagnoses / notes / known conditions).
 */
export function AssessmentSectionTemplateButton({
  scope,
  disabled = false,
  knownConditionsBridge = null,
}: AssessmentSectionTemplateButtonProps): JSX.Element {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    if (scope === "known_conditions") {
      await knownConditionsBridge?.applyFromTemplate(template);
      return;
    }
    const actions = buildAssessmentTemplateApplyActions(scope, template);
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    const knownSnap =
      scope === "known_conditions"
        ? knownConditionsBridge?.snapshotForSave() ?? []
        : undefined;

    if (scope === "known_conditions") {
      if (!knownConditionsBridge?.hasContent()) {
        window.alert(SAVE_EMPTY_MESSAGES.known_conditions);
        return;
      }
    } else if (!assessmentScopeHasContent(scope, state.fields)) {
      window.alert(SAVE_EMPTY_MESSAGES[scope]);
      return;
    }

    const payload = buildAssessmentTemplateSavePayload(
      scope,
      state.fields,
      knownSnap,
    );
    const nameSeed = defaultAssessmentSaveName(scope, state.fields, knownSnap);
    const name = window.prompt(
      `${SAVE_PROMPT_LABELS[scope]} — enter a short name:`,
      nameSeed,
    );
    if (!name?.trim()) return;

    setSaving(true);
    try {
      await createRxTemplate(token, { name: name.trim(), ...payload });
      setOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <IconTooltipGroup>
        <span className="inline-flex items-center gap-0.5">
          <IconTooltip label="Save as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`assessment-section-template-save-${scope}`}
              aria-label="Save as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label="Templates">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`assessment-section-template-${scope}`}
              aria-label="Templates"
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </span>
      </IconTooltipGroup>

      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        variant="subjective"
        scope={scope}
        onApply={handleApply}
      />
    </>
  );
}

export interface AssessmentWholeTemplateButtonProps {
  disabled?: boolean;
  knownConditionsBridge?: KnownConditionsTemplateBridge | null;
}

/**
 * Whole-Assessment ("Templates") button — save/apply `assessment_full`
 * (diagnoses + notes + known conditions when bridge is present).
 */
export function AssessmentWholeTemplateButton({
  disabled = false,
  knownConditionsBridge = null,
}: AssessmentWholeTemplateButtonProps): JSX.Element {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    setApplying(true);
    try {
      const actions = buildAssessmentTemplateApplyActions("assessment_full", template);
      for (const action of actions) {
        dispatch(action);
      }
      if (knownConditionsTemplateHasContent(template)) {
        await knownConditionsBridge?.applyFromTemplate(template);
      }
    } finally {
      setApplying(false);
    }
  };

  const handleSaveCurrent = async () => {
    const knownSnap = knownConditionsBridge?.snapshotForSave() ?? [];
    if (
      !assessmentScopeHasContent("assessment_full", state.fields, knownSnap)
    ) {
      window.alert(SAVE_EMPTY_MESSAGES.assessment_full);
      return;
    }

    const payload = buildAssessmentTemplateSavePayload(
      "assessment_full",
      state.fields,
      knownSnap,
    );
    const nameSeed = defaultAssessmentSaveName(
      "assessment_full",
      state.fields,
      knownSnap,
    );
    const name = window.prompt(
      `${SAVE_PROMPT_LABELS.assessment_full} — enter a short name:`,
      nameSeed,
    );
    if (!name?.trim()) return;

    setSaving(true);
    try {
      await createRxTemplate(token, { name: name.trim(), ...payload });
      setOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const busy = disabled || saving || applying;

  return (
    <>
      <IconTooltipGroup>
        <span className="inline-flex items-center gap-0.5">
          <IconTooltip label="Save assessment as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="assessment-template-save-trigger"
              aria-label="Save assessment as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label="Assessment templates">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="assessment-template-trigger"
              aria-label="Assessment templates"
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </span>
      </IconTooltipGroup>

      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        variant="subjective"
        scope="assessment_full"
        onApply={handleApply}
      />
    </>
  );
}
