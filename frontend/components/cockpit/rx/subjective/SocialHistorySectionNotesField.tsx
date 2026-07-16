"use client";

import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { cn } from "@/lib/utils";

interface SocialHistorySectionNotesFieldProps {
  id: string;
  testId: string;
  disabled?: boolean;
  value: string;
  placeholder?: string;
  onChange: (notes: string | undefined) => void;
}

export function SocialHistorySectionNotesField({
  id,
  testId,
  disabled,
  value,
  placeholder = "Additional context…",
  onChange,
}: SocialHistorySectionNotesFieldProps) {
  return (
    <div className="space-y-1" data-testid={`${testId}-field`}>
      <label htmlFor={id} className="text-xs font-medium text-foreground/80">
        Notes (optional)
      </label>
      <input
        id={id}
        type="text"
        disabled={disabled}
        value={value}
        maxLength={200}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
        className={cn(RX_FIELD_INPUT_CLASS, "h-8 text-xs")}
      />
    </div>
  );
}
