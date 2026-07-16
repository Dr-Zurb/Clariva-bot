"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildInvestigationsTemplateApplyActions,
  buildInvestigationsTemplateSavePayload,
  defaultInvestigationsSaveName,
  INVESTIGATIONS_TEMPLATE_SCOPE,
  investigationsScopeHasContent,
} from "@/lib/cockpit/apply-investigations-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

export interface InvestigationsSectionTemplateButtonProps {
  disabled?: boolean;
}

/**
 * Scoped save / apply for Plan investigations orders — mirrors objective
 * section template buttons (form-state only).
 */
export function InvestigationsSectionTemplateButton({
  disabled = false,
}: InvestigationsSectionTemplateButtonProps): JSX.Element {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    const actions = buildInvestigationsTemplateApplyActions(template);
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    if (!investigationsScopeHasContent(state.fields)) {
      window.alert("Add at least one investigation before saving a template.");
      return;
    }

    const payload = buildInvestigationsTemplateSavePayload(state.fields);
    const nameSeed = defaultInvestigationsSaveName(state.fields);
    const name = window.prompt(
      "Save current investigations as template — enter a short name:",
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
              data-testid="investigations-section-template-save"
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
              data-testid="investigations-section-template"
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
        scope={INVESTIGATIONS_TEMPLATE_SCOPE}
        onApply={handleApply}
      />
    </>
  );
}
