'use client';

import { Label } from '@/components/ui/label';
import type { ModeScheduleWeeklyOverrides, ModeScheduleWeekday, OpdMode } from '@/types/doctor-settings';

const WEEKDAYS: { key: ModeScheduleWeekday; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const MODE_OPTIONS = [
  { value: '_inherit', label: 'Inherit' },
  { value: 'slot', label: 'Slot' },
  { value: 'queue', label: 'Queue' },
] as const;

export interface ModeScheduleWeeklyEditorProps {
  value: ModeScheduleWeeklyOverrides;
  onChange: (weekly: ModeScheduleWeeklyOverrides) => void;
}

export function ModeScheduleWeeklyEditor({ value, onChange }: ModeScheduleWeeklyEditorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold text-gray-900">Weekly overrides</Label>
      <p className="text-sm text-muted-foreground">
        Override the default for specific weekdays. Inherit = use the default mode.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WEEKDAYS.map(({ key, label }) => {
          const selected = value[key] ?? '_inherit';
          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-gray-900">{label}</span>
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={`${label} mode`}>
                {MODE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="inline-flex cursor-pointer items-center gap-1">
                    <input
                      type="radio"
                      name={`weekly_${key}`}
                      value={opt.value}
                      checked={selected === opt.value}
                      onChange={() => {
                        const next = { ...value };
                        if (opt.value === '_inherit') {
                          delete next[key];
                        } else {
                          next[key] = opt.value as OpdMode;
                        }
                        onChange(next);
                      }}
                      className="h-3.5 w-3.5 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
