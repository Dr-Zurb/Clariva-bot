'use client';

import { useEffect, useState } from 'react';
import { previewResolveModeForDate } from '@/lib/api';
import { todayLocalIso } from '@/lib/dates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OpdMode, OpdSessionDayModeSource } from '@/types/doctor-settings';

export function ModeScheduleTestDateWidget({ token }: { token: string }) {
  const [date, setDate] = useState<string>(todayLocalIso());
  const [result, setResult] = useState<{ mode: OpdMode; source: OpdSessionDayModeSource } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setResult(null);
      setError(null);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const res = await previewResolveModeForDate(token, date);
        setResult({ mode: res.data.mode, source: res.data.source });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed');
        setResult(null);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [token, date]);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3">
      <Label className="text-sm font-semibold text-gray-900">Test a date</Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Type any date to see which mode the booking flow would use.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
          aria-label="Date to test"
        />
        <span className="text-sm text-gray-500">→</span>
        {result ? (
          <span className="text-sm text-gray-900">
            <strong>{result.mode}</strong>
            <span className="ml-1 text-xs text-muted-foreground">(from {result.source})</span>
          </span>
        ) : error ? (
          <span className="text-sm text-red-600" role="alert">
            {error}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">…</span>
        )}
      </div>
    </div>
  );
}
