"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { VITAL_NOTE_MAX_LEN } from "@/lib/cockpit/vital-notes";
import { cn } from "@/lib/utils";

/** Shared layout — compact default like BP rows; grows with content up to the full row. */
export const VITAL_NOTE_WRAPPER_CLASS = "flex min-w-0 max-w-full shrink items-center gap-1";

export function vitalNoteInputClassName(className?: string): string {
  return cn(
    RX_FIELD_INPUT_CLASS,
    "mt-0 h-7 w-auto min-w-[8rem] max-w-full py-1 text-xs placeholder:text-muted-foreground sm:min-w-[11rem] [field-sizing:content]",
    className,
  );
}

export interface VitalNoteFieldProps {
  /** Registry vital key, cluster menu key, or custom vital id. */
  noteKey: string;
  /** Accessible label suffix — defaults to "vital". */
  label?: string;
  className?: string;
}

/** Optional per-vital note — same inline pattern as BP / glucose reading rows. */
export function VitalNoteField({
  noteKey,
  label = "vital",
  className,
}: VitalNoteFieldProps): JSX.Element {
  const { state, setField } = useRxForm();
  const value = state.fields.vitalsNotes[noteKey] ?? "";
  const inputId = `vital-note-${noteKey}`;

  return (
    <ReadingNoteField
      id={inputId}
      value={value}
      onChange={(next) => {
        setField("vitalsNotes", {
          ...state.fields.vitalsNotes,
          [noteKey]: next.length > 0 ? next : null,
        });
      }}
      label={label}
      className={className}
      testId={`vital-note-${noteKey}`}
    />
  );
}

export interface ReadingNoteFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  testId?: string;
}

/** Controlled note field for BP / glucose reading rows and vitalsNotes map entries. */
export function ReadingNoteField({
  id,
  value,
  onChange,
  label,
  className,
  testId,
}: ReadingNoteFieldProps): JSX.Element {
  return (
    <div className={cn(VITAL_NOTE_WRAPPER_CLASS, className)}>
      <label htmlFor={id} className="shrink-0 text-[11px] text-muted-foreground">
        Note
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Optional"
        maxLength={VITAL_NOTE_MAX_LEN}
        className={vitalNoteInputClassName()}
        aria-label={`${label} note`}
        data-testid={testId}
      />
    </div>
  );
}
