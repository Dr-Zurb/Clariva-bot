"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deskErrorMessage,
  getDeskAvailableSlots,
  rescheduleDeskAppointment,
} from "@/lib/desk/api";
import { walkInAppointmentIsoOnDay } from "@/lib/desk/format";
import type { AvailableSlot } from "@/lib/api";

export function DeskMovePanel({
  token,
  doctorId,
  timezone,
  today,
  appointmentId,
  onMoved,
}: {
  token: string;
  doctorId: string;
  timezone: string;
  today: string;
  appointmentId: string;
  onMoved: () => void | Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getDeskAvailableSlots(doctorId, date)
      .then((res) => {
        if (!cancelled) setSlots(res.data.slots);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSlots([]);
          setError(deskErrorMessage(err, "Could not load times"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, date]);

  async function moveTo(iso: string) {
    setSaving(true);
    setError(null);
    try {
      await rescheduleDeskAppointment(token, appointmentId, iso);
      await onMoved();
    } catch (err) {
      setError(deskErrorMessage(err, "Could not move"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="w-fit space-y-1.5">
        <Label htmlFor="desk-move-date">Date</Label>
        <Input
          id="desk-move-date"
          type="date"
          value={date}
          min={today}
          onChange={(event) => setDate(event.target.value)}
          className="w-40"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading times…</p>
      ) : null}
      {!loading && slots.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No clock slots. Move to that day’s list.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() =>
              void moveTo(walkInAppointmentIsoOnDay(date, timezone))
            }
          >
            {saving ? "Moving…" : "Move to that day’s list"}
          </Button>
        </div>
      ) : null}
      {!loading && slots.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Available times">
          {slots.map((slot) => (
            <li key={slot.start}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 rounded-full px-4 lg:h-8 lg:px-3"
                disabled={saving}
                onClick={() => void moveTo(slot.start)}
              >
                {new Intl.DateTimeFormat("en-IN", {
                  timeZone: timezone,
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(slot.start))}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
