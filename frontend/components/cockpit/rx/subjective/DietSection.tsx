"use client";

import { useMemo } from "react";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";
import {
  DIET_TYPE_OPTIONS,
  dietClinicalHints,
  dietHasContent,
  normalizeDietSection,
  type DietSectionInput,
  type DietType,
} from "@/lib/cockpit/social-history-diet";
import { setDiet, type SocialHistoryStructured } from "@/lib/cockpit/social-history";

const CHIP_CLASS =
  "min-h-9 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";

interface DietSectionProps {
  value: SocialHistoryStructured;
  disabled?: boolean;
  inputIdPrefix: string;
  hideLabel?: boolean;
  onChange: (next: SocialHistoryStructured) => void;
}

function patchDiet(
  structured: SocialHistoryStructured,
  patch: DietSectionInput | null,
): SocialHistoryStructured {
  return setDiet(structured, patch);
}

export function DietSection({
  value,
  disabled,
  inputIdPrefix,
  hideLabel = false,
  onChange,
}: DietSectionProps) {
  const diet = useMemo(() => normalizeDietSection(value.diet), [value.diet]);
  const hints = dietClinicalHints(diet);

  const updateDiet = (patch: DietSectionInput | null) => {
    onChange(patchDiet(value, patch));
  };

  const handleTypeSelect = (type: DietType | undefined) => {
    if (!type) {
      const preserved: DietSectionInput = {};
      if (diet?.notes) preserved.notes = diet.notes;
      updateDiet(dietHasContent(preserved) ? preserved : null);
      return;
    }

    updateDiet({
      ...(diet ?? {}),
      type,
      typeOther: undefined,
    });
  };

  return (
    <section className="space-y-2" aria-label="Diet">
      <div className="space-y-1.5" data-testid="social-diet-type">
        {!hideLabel ? <p className="text-xs font-medium text-foreground/80">Diet</p> : null}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Diet">
          {DIET_TYPE_OPTIONS.map((option) => {
            const isSelected = diet?.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={option.label}
                onClick={() => handleTypeSelect(isSelected ? undefined : option.value)}
                className={cn(
                  CHIP_CLASS,
                  isSelected
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1" data-testid="social-diet-notes-field">
        <label
          htmlFor={`${inputIdPrefix}-diet-notes`}
          className="text-xs font-medium text-foreground/80"
        >
          Notes (optional)
        </label>
        <input
          id={`${inputIdPrefix}-diet-notes`}
          type="text"
          disabled={disabled}
          value={diet?.notes ?? ""}
          maxLength={200}
          placeholder="E.g. eats twice a day, multiple small meals…"
          data-testid="social-diet-notes"
          onChange={(e) =>
            updateDiet({
              ...(diet ?? {}),
              notes: e.target.value.trim() || undefined,
            })
          }
          className={cn(RX_FIELD_INPUT_CLASS, "h-8 text-xs")}
        />
      </div>

      {hints.length > 0 && (
        <div className="space-y-1" data-testid="social-diet-hints" role="status">
          {hints.map((hint) => (
            <p key={hint} className="text-xs text-amber-800 dark:text-amber-200">
              {hint}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
