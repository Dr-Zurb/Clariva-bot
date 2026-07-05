"use client";

import { CategoricalVitalSelect } from "@/components/cockpit/rx/inputs/CategoricalVitalSelect";
import { VitalNoteField } from "@/components/cockpit/rx/inputs/VitalNoteField";
import { VitalProvenanceOverride } from "@/components/cockpit/rx/inputs/VitalProvenanceOverride";
import {
  contextKeysForNumericVital,
} from "@/lib/cockpit/vitals-group-layout";
import {
  isProvenanceOverrideVital,
} from "@/lib/cockpit/measurement-context";
import type { VitalKey } from "@/lib/cockpit/vitals-schema";

export interface VitalContextFieldsProps {
  parentKey: VitalKey;
  /** Optional per-vital note — rendered before “Measured differently”, wraps when cramped. */
  noteKey?: string;
  noteLabel?: string;
}

/** Inline context selects, provenance, and optional note paired with a parent vital. */
export function VitalContextFields({
  parentKey,
  noteKey,
  noteLabel,
}: VitalContextFieldsProps): JSX.Element | null {
  const keys = contextKeysForNumericVital(parentKey);
  const showProvenance = isProvenanceOverrideVital(parentKey);
  const showNote = noteKey != null && noteKey.length > 0;
  if (keys.length === 0 && !showProvenance && !showNote) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {keys.map((key) => (
        <CategoricalVitalSelect key={key} vitalKey={key} variant="inline" />
      ))}
      {showNote ? (
        <VitalNoteField noteKey={noteKey} label={noteLabel ?? "vital"} />
      ) : null}
      {showProvenance ? <VitalProvenanceOverride vitalKey={parentKey} /> : null}
    </div>
  );
}
