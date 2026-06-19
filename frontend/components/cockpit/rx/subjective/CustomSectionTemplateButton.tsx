"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildCustomBlockTemplateApplyActions,
  buildCustomBlockTemplateSavePayload,
} from "@/lib/cockpit/apply-subjective-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

const SAVE_EMPTY_MESSAGE = "Add section notes or sub-sections before saving a template.";
const SAVE_PROMPT_LABEL = "Save current custom section as template";

export interface CustomSectionTemplateButtonProps {
  /** Stable id of the live custom section this header controls (subj-40). */
  sectionId: string;
  /** Section title seed for the save prompt. */
  sectionTitle?: string;
  disabled?: boolean;
}

export function CustomSectionTemplateButton({
  sectionId,
  sectionTitle = "",
  disabled = false,
}: CustomSectionTemplateButtonProps) {
  const { token, dispatch, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    const actions = buildCustomBlockTemplateApplyActions(
      sectionId,
      template,
      state.fields,
    );
    for (const action of actions) {
      dispatch(action);
    }
  };

  const handleSaveCurrent = async () => {
    const payload = buildCustomBlockTemplateSavePayload(sectionId, state.fields);
    if (!payload) {
      window.alert(SAVE_EMPTY_MESSAGE);
      return;
    }

    const nameSeed = sectionTitle.trim() || "Custom section";
    const name = window.prompt(`${SAVE_PROMPT_LABEL} — enter a short name:`, nameSeed);
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
              data-testid={`custom-section-template-save-${sectionId}`}
              aria-label="Save custom section as template"
              onClick={() => void handleSaveCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </IconTooltip>
          <IconTooltip label="Templates for this custom section">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS)}
              data-testid={`custom-section-template-${sectionId}`}
              aria-label="Templates for this custom section"
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
        scope="custom_block"
        priorityCustomSectionId={sectionId}
        onApply={handleApply}
      />
    </>
  );
}
