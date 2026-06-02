'use client';

import { Label } from '@/components/ui/label';
import type { OpdMode } from '@/types/doctor-settings';

export interface ModeScheduleDefaultEditorProps {
  value: OpdMode | undefined;
  onChange: (mode: OpdMode) => void;
  currentOpdModeColumn: OpdMode;
}

const OPTIONS = [
  { value: 'slot' as const, label: 'Slot mode', hint: 'Fixed appointment times.' },
  { value: 'queue' as const, label: 'Queue mode', hint: 'Token queue with estimated wait.' },
] as const;

export function ModeScheduleDefaultEditor({
  value,
  onChange,
  currentOpdModeColumn,
}: ModeScheduleDefaultEditorProps) {
  const effective = value ?? currentOpdModeColumn ?? 'slot';

  return (
    <div className="space-y-3" role="group" aria-labelledby="mode-schedule-default-heading">
      <Label id="mode-schedule-default-heading" className="text-base font-semibold text-gray-900">
        Default mode
      </Label>
      <p className="text-sm text-muted-foreground">
        Used for any future date not covered by a more specific rule below. Currently:{' '}
        <strong>{effective}</strong>.
        {!value && <span> (Inherited from your global OPD setting.)</span>}
      </p>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer gap-3 rounded-md border border-gray-200 p-3 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40"
          >
            <input
              type="radio"
              name="mode_schedule_default"
              value={opt.value}
              checked={effective === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="font-medium text-gray-900">{opt.label}</span>
              <span className="mt-0.5 block text-sm text-gray-600">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
