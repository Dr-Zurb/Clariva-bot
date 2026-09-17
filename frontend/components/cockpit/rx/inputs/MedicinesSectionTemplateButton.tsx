"use client";

import { useState } from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { useRxForm, type RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import { useDoctorMedicinePackSuggestions } from "@/hooks/useDoctorMedicinePackSuggestions";
import { createRxTemplate } from "@/lib/api";
import type { DoctorMedicinePackSuggestion } from "@/lib/api/doctor-medicine-pack-suggestions";
import {
  buildMedicinesFromTemplate,
  buildMedicinesTemplateSavePayload,
  defaultMedicinesSaveName,
  MEDICINES_TEMPLATE_SCOPE,
  medicinesScopeHasContent,
  rxMedicinesFromPackSuggestion,
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
  const { suggestions, unseenCount, dismissPack, markSeen, removePack } =
    useDoctorMedicinePackSuggestions(token);

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

  const handleSaveSuggestion = async (pack: DoctorMedicinePackSuggestion) => {
    const medicines = rxMedicinesFromPackSuggestion(pack);
    const payload = buildMedicinesTemplateSavePayload({ medicines });
    const nameSeed = defaultMedicinesSaveName({ medicines });
    const name = window.prompt(
      "Save this pack as a template — enter a short name:",
      nameSeed,
    );
    if (!name?.trim()) return;

    setSaving(true);
    try {
      const created = await createRxTemplate(token, {
        name: name.trim(),
        ...payload,
      });
      removePack(pack);
      return created.data.template;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const templateLabel =
    unseenCount > 0
      ? `Templates, ${unseenCount} new pack suggestion${unseenCount === 1 ? "" : "s"}`
      : "Templates";

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
          <IconTooltip label={templateLabel}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || saving}
              className={cn(ICON_BTN_CLASS, "relative")}
              data-testid="medicines-section-template"
              aria-label={templateLabel}
              onClick={() => setOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
              {unseenCount > 0 ? (
                <span
                  data-testid="medicines-template-suggestion-nudge"
                  className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden
                />
              ) : null}
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
        packSuggestions={suggestions}
        onSavePackSuggestion={handleSaveSuggestion}
        onDismissPackSuggestion={(pack) => void dismissPack(pack)}
        onPackSuggestionsOpened={() => void markSeen()}
      />
    </>
  );
}
