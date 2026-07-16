"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm, type RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildPlanFullMedicinesFromTemplate,
  buildPlanTemplateApplyActions,
  buildPlanTemplateSavePayload,
  defaultPlanSaveName,
  planScopeHasContent,
  SAVE_EMPTY_MESSAGES,
  SAVE_PROMPT_LABELS,
  type PlanTemplateScope,
} from "@/lib/cockpit/apply-plan-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

export interface PlanSectionTemplateButtonProps {
  scope: Exclude<PlanTemplateScope, "plan_full">;
  disabled?: boolean;
}

/**
 * Scoped save / apply for a Plan L1 (advice / follow-up / referral /
 * clinical notes) — mirrors InvestigationsSectionTemplateButton.
 */
export function PlanSectionTemplateButton({
  scope,
  disabled = false,
}: PlanSectionTemplateButtonProps): JSX.Element {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    const actions = buildPlanTemplateApplyActions(scope, template);
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    if (!planScopeHasContent(scope, state.fields)) {
      window.alert(SAVE_EMPTY_MESSAGES[scope]);
      return;
    }

    const payload = buildPlanTemplateSavePayload(scope, state.fields);
    const nameSeed = defaultPlanSaveName(scope, state.fields);
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
              data-testid={`plan-section-template-save-${scope}`}
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
              data-testid={`plan-section-template-${scope}`}
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

export interface PlanWholeTemplateButtonProps {
  disabled?: boolean;
  /** Parent regenerates medicine instance ids after a full replace. */
  onMedicinesApplied?: (medicines: RxMedicine[]) => void;
}

/**
 * Whole-Plan ("Templates") button — save/apply `plan_full` (investigations +
 * medicines + advice + follow-up + referral + clinical notes).
 */
export function PlanWholeTemplateButton({
  disabled = false,
  onMedicinesApplied,
}: PlanWholeTemplateButtonProps): JSX.Element {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    setApplying(true);
    try {
      const actions = buildPlanTemplateApplyActions("plan_full", template);
      for (const action of actions) {
        dispatch(action);
      }
      if (onMedicinesApplied) {
        onMedicinesApplied(buildPlanFullMedicinesFromTemplate(template));
      }
    } finally {
      setApplying(false);
    }
  };

  const handleSaveCurrent = async () => {
    if (!planScopeHasContent("plan_full", state.fields)) {
      window.alert(SAVE_EMPTY_MESSAGES.plan_full);
      return;
    }

    const payload = buildPlanTemplateSavePayload("plan_full", state.fields);
    const nameSeed = defaultPlanSaveName("plan_full", state.fields);
    const name = window.prompt(
      `${SAVE_PROMPT_LABELS.plan_full} — enter a short name:`,
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
          <IconTooltip label="Save plan as template">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="plan-template-save-trigger"
              aria-label="Save plan as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label="Plan templates">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className={cn(ICON_BTN_CLASS)}
              data-testid="plan-template-trigger"
              aria-label="Plan templates"
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
        scope="plan_full"
        onApply={handleApply}
      />
    </>
  );
}
