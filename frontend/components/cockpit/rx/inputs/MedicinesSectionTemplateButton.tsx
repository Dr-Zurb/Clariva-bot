"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm, type RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { createRxTemplate } from "@/lib/api";
import {
  buildMedicinesFromTemplate,
  buildMedicinesTemplateSavePayload,
  defaultMedicinesSaveName,
  MEDICINES_TEMPLATE_SCOPE,
  medicinesScopeHasContent,
} from "@/lib/cockpit/apply-medicines-template";
import type { DoctorRxTemplate } from "@/types/rx-template";
import { Button } from "@/components/ui/button";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground";

export interface MedicinesSectionTemplateButtonProps {
  disabled?: boolean;
  /**
   * Parent owns instance-id regeneration after a scoped replace
   * (SET_MEDICINES alone is not enough for stable row keys).
   */
  onMedicinesApplied: (medicines: RxMedicine[]) => void;
}

/**
 * Scoped save / apply for Plan medicines — mirrors
 * InvestigationsSectionTemplateButton (form-state only).
 */
export function MedicinesSectionTemplateButton({
  disabled = false,
  onMedicinesApplied,
}: MedicinesSectionTemplateButtonProps): JSX.Element {
  const { token, state } = useRxForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleApply = async (template: DoctorRxTemplate) => {
    onMedicinesApplied(buildMedicinesFromTemplate(template));
  };

  const handleSaveCurrent = async () => {
    if (!medicinesScopeHasContent(state.fields)) {
      window.alert("Add at least one medicine before saving a template.");
      return;
    }

    const payload = buildMedicinesTemplateSavePayload(state.fields);
    const nameSeed = defaultMedicinesSaveName(state.fields);
    const name = window.prompt(
      "Save current medicines as template — enter a short name:",
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
              data-testid="medicines-section-template-save"
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
              data-testid="medicines-section-template"
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
        scope={MEDICINES_TEMPLATE_SCOPE}
        onApply={handleApply}
      />
    </>
  );
}
