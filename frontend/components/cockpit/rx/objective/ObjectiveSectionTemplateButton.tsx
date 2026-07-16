"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildObjectiveCustomBlockTemplateApplyActions,
  buildObjectiveCustomBlockTemplateSavePayload,
  buildObjectiveTemplateApplyActions,
  buildObjectiveTemplateSavePayload,
  defaultObjectiveSaveName,
  objectiveScopeHasContent,
  type FormStateObjectiveTemplateScope,
} from "@/lib/cockpit/apply-objective-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

const SAVE_EMPTY_MESSAGES: Record<FormStateObjectiveTemplateScope, string> = {
  vitals: "Enter at least one vital before saving a template.",
  exam_systemic: "Record structured exam findings before saving a template.",
  exam_general: "Record general exam findings before saving a template.",
  exam_cvs: "Record cardiovascular exam findings before saving a template.",
  exam_resp: "Record respiratory exam findings before saving a template.",
  exam_abd: "Record abdominal exam findings before saving a template.",
  exam_cns: "Record neurological exam findings before saving a template.",
  exam_additional_notes: "Add examination additional notes before saving a template.",
  objective_notes: "Add objective notes before saving a template.",
  test_results: "Add a result row before saving a template.",
  point_of_care: "Add a point-of-care result row before saving a template.",
  objective_custom_block: "Add section notes or sub-sections before saving a template.",
  objective_full: "Add objective content before saving a template.",
};

const SAVE_PROMPT_LABELS: Record<FormStateObjectiveTemplateScope, string> = {
  vitals: "Save current vitals as template",
  exam_systemic: "Save current structured exam as template",
  exam_general: "Save current general exam as template",
  exam_cvs: "Save current cardiovascular exam as template",
  exam_resp: "Save current respiratory exam as template",
  exam_abd: "Save current abdominal exam as template",
  exam_cns: "Save current neurological exam as template",
  exam_additional_notes: "Save current examination additional notes as template",
  objective_notes: "Save current objective notes as template",
  test_results: "Save current reports as template",
  point_of_care: "Save current point-of-care results as template",
  objective_custom_block: "Save current custom section as template",
  objective_full: "Save current objective as template",
};

export interface ObjectiveSectionTemplateButtonProps {
  scope: Exclude<FormStateObjectiveTemplateScope, "objective_custom_block">;
  disabled?: boolean;
}

export function ObjectiveSectionTemplateButton({
  scope,
  disabled = false,
}: ObjectiveSectionTemplateButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    // rpt-01: remapped POC templates keep source-scoped merge so they don't wipe other rows.
    const applyScope =
      scope === "test_results" && template.scope === "point_of_care"
        ? "point_of_care"
        : scope;
    const actions = buildObjectiveTemplateApplyActions(applyScope, template, state.fields);
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    if (!objectiveScopeHasContent(scope, state.fields)) {
      window.alert(SAVE_EMPTY_MESSAGES[scope]);
      return;
    }

    const payload = buildObjectiveTemplateSavePayload(scope, state.fields);
    const nameSeed = defaultObjectiveSaveName(scope, state.fields);
    const name = window.prompt(`${SAVE_PROMPT_LABELS[scope]} — enter a short name:`, nameSeed);
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
              data-testid={`objective-section-template-save-${scope}`}
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
              data-testid={`objective-section-template-${scope}`}
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
        variant="objective"
        scope={scope}
        onApply={handleApply}
      />
    </>
  );
}

export interface ObjectiveWholeTemplateButtonProps {
  disabled?: boolean;
}

/**
 * obj-19: the whole-objective ("Templates") button. Composes obj-17's per-scope
 * save/apply for `objective_full` (exam + vitals + test results + custom sections)
 * under one combined applying state + one result summary. Form-state only — no
 * server step, so there is no partial-failure branch (mirrors subj-18).
 */
export function ObjectiveWholeTemplateButton({
  disabled = false,
}: ObjectiveWholeTemplateButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  const handleApply = async (template: DoctorRxTemplate) => {
    setApplying(true);
    setApplyNotice(null);
    try {
      const actions = buildObjectiveTemplateApplyActions(
        "objective_full",
        template,
        state.fields,
      );
      for (const action of actions) {
        dispatch(action);
      }
      setApplyNotice("Objective template applied");
    } finally {
      setApplying(false);
    }
  };

  const handleSaveCurrent = async () => {
    if (!objectiveScopeHasContent("objective_full", state.fields)) {
      window.alert(SAVE_EMPTY_MESSAGES.objective_full);
      return;
    }

    const payload = buildObjectiveTemplateSavePayload("objective_full", state.fields);
    const nameSeed = defaultObjectiveSaveName("objective_full", state.fields);
    const name = window.prompt(
      `${SAVE_PROMPT_LABELS.objective_full} — enter a short name:`,
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

  const busy = applying || saving;

  return (
    <>
      <IconTooltipGroup>
        <span className="inline-flex items-center gap-0.5">
          <IconTooltip label="Save current objective as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="objective-template-save-trigger"
              aria-label="Save current objective as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label={applying ? "Applying…" : "Templates"}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="objective-template-trigger"
              aria-label={applying ? "Applying template…" : "Templates"}
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </span>
      </IconTooltipGroup>

      {applyNotice ? (
        <span className="text-xs text-muted-foreground" role="status">
          {applyNotice}
        </span>
      ) : null}

      <TemplatePicker
        open={open}
        onClose={() => setOpen(false)}
        token={token}
        variant="objective"
        scope="objective_full"
        onApply={handleApply}
      />
    </>
  );
}

export interface ObjectiveCustomSectionTemplateButtonProps {
  sectionId: string;
  sectionTitle?: string;
  disabled?: boolean;
}

export function ObjectiveCustomSectionTemplateButton({
  sectionId,
  sectionTitle = "",
  disabled = false,
}: ObjectiveCustomSectionTemplateButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const scope: FormStateObjectiveTemplateScope = "objective_custom_block";

  const handleApply = async (template: DoctorRxTemplate) => {
    const actions = buildObjectiveCustomBlockTemplateApplyActions(
      sectionId,
      template,
      state.fields,
    );
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    const payload = buildObjectiveCustomBlockTemplateSavePayload(sectionId, state.fields);
    if (!payload) {
      window.alert(SAVE_EMPTY_MESSAGES.objective_custom_block);
      return;
    }

    const nameSeed =
      defaultObjectiveSaveName(scope, state.fields, { sectionId, sectionTitle }) ||
      "Custom section";
    const name = window.prompt(
      `${SAVE_PROMPT_LABELS.objective_custom_block} — enter a short name:`,
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
          <IconTooltip label="Save custom section as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`objective-custom-section-template-save-${sectionId}`}
              aria-label="Save custom section as template"
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
              data-testid={`objective-custom-section-template-${sectionId}`}
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
        variant="objective"
        scope="objective_custom_block"
        priorityCustomSectionId={sectionId}
        onApply={handleApply}
      />
    </>
  );
}
