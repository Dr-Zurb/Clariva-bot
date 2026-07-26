"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stripDoctorPrefix } from "@/lib/auth/doctor-name";

export type DoctorNameFieldProps = {
  id: string;
  /** Bare name without Dr. prefix (component owns the chrome). */
  value: string;
  onChange: (bareName: string) => void;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/**
 * Full-name input with a fixed non-editable "Dr." prefix (AP-D13 / AP-D16).
 */
export function DoctorNameField({
  id,
  value,
  onChange,
  disabled,
  "aria-describedby": ariaDescribedBy,
}: DoctorNameFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Full name</Label>
      <div className="flex h-9 overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
        <span
          className="flex shrink-0 items-center border-r border-input bg-muted/40 px-3 text-sm font-medium text-muted-foreground"
          aria-hidden
        >
          Dr.
        </span>
        <Input
          id={id}
          type="text"
          autoComplete="name"
          value={value}
          onChange={(e) => onChange(stripDoctorPrefix(e.target.value))}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-label="Full name"
          className="h-full rounded-none border-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
