'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ModeSchedule, OpdMode } from '@/types/doctor-settings';
import { ModeScheduleDefaultEditor } from './ModeScheduleDefaultEditor';
import { ModeScheduleWeeklyEditor } from './ModeScheduleWeeklyEditor';
import { ModeScheduleDateRangeEditor } from './ModeScheduleDateRangeEditor';
import { ModeScheduleDateOverridesEditor } from './ModeScheduleDateOverridesEditor';
import { ModeScheduleTestDateWidget } from './ModeScheduleTestDateWidget';

export interface ModeScheduleEditorProps {
  token: string;
  initialSchedule: ModeSchedule;
  /** doctor_settings.opd_mode — used for the mirror-on-first-save fallback */
  currentOpdModeColumn: OpdMode;
  onSave: (schedule: ModeSchedule, mirroredOpdMode?: OpdMode) => Promise<void>;
  saveError?: string | null;
  saving: boolean;
}

export function ModeScheduleEditor({
  token,
  initialSchedule,
  currentOpdModeColumn,
  onSave,
  saveError,
  saving,
}: ModeScheduleEditorProps) {
  const [schedule, setSchedule] = useState<ModeSchedule>(initialSchedule);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSchedule(initialSchedule);
    setDirty(false);
  }, [initialSchedule]);

  const updateSchedule = useCallback((updater: (prev: ModeSchedule) => ModeSchedule) => {
    setSchedule((prev) => {
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const isFirstSave = !initialSchedule.default_mode && Boolean(schedule.default_mode);
    const mirroredOpdMode =
      isFirstSave && schedule.default_mode ? schedule.default_mode : undefined;

    await onSave(schedule, mirroredOpdMode);
    setDirty(false);
  }, [schedule, initialSchedule, onSave]);

  const handleDiscard = () => {
    setSchedule(initialSchedule);
    setDirty(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode schedule</CardTitle>
        <CardDescription>
          Set how each day&apos;s OPD operates. Already-booked dates keep their assigned mode;
          policy changes apply to future bookings only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ModeScheduleDefaultEditor
          value={schedule.default_mode}
          onChange={(m) => updateSchedule((s) => ({ ...s, default_mode: m }))}
          currentOpdModeColumn={currentOpdModeColumn}
        />
        <ModeScheduleWeeklyEditor
          value={schedule.weekly_overrides ?? {}}
          onChange={(w) => updateSchedule((s) => ({ ...s, weekly_overrides: w }))}
        />
        <ModeScheduleDateRangeEditor
          value={schedule.date_range_overrides ?? []}
          onChange={(r) => updateSchedule((s) => ({ ...s, date_range_overrides: r }))}
        />
        <ModeScheduleDateOverridesEditor
          value={schedule.date_overrides ?? []}
          onChange={(d) => updateSchedule((s) => ({ ...s, date_overrides: d }))}
        />
        <ModeScheduleTestDateWidget token={token} />
        {saveError && (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {saveError}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="ghost" onClick={handleDiscard} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  );
}
