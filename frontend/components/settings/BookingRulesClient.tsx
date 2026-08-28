"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

type BookingRulesForm = {
  slot_interval_minutes: string;
  max_advance_booking_days: string;
  min_advance_hours: string;
  business_hours_summary: string;
  cancellation_policy_hours: string;
  max_appointments_per_day: string;
  booking_buffer_minutes: string;
};

function toNum(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function toForm(s: DoctorSettings): BookingRulesForm {
  const slotVal = s.slot_interval_minutes;
  const slotStr = slotVal >= 1 && slotVal <= 60 ? String(slotVal) : "15";
  return {
    slot_interval_minutes: slotStr,
    max_advance_booking_days: String(s.max_advance_booking_days ?? 30),
    min_advance_hours: String(s.min_advance_hours ?? 0),
    business_hours_summary: s.business_hours_summary ?? "",
    cancellation_policy_hours:
      s.cancellation_policy_hours != null ? String(s.cancellation_policy_hours) : "",
    max_appointments_per_day:
      s.max_appointments_per_day != null ? String(s.max_appointments_per_day) : "",
    booking_buffer_minutes:
      s.booking_buffer_minutes != null ? String(s.booking_buffer_minutes) : "",
  };
}

interface BookingRulesClientProps {
  token: string;
}

export function BookingRulesClient({ token }: BookingRulesClientProps) {
  const {
    form,
    setForm,
    isDirty,
    saving,
    saveSuccess,
    saveError,
    save,
    isLoading,
    loadError,
    refetch,
  } = useDoctorSettingsForm(token, toForm);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const slotInt = toNum(form.slot_interval_minutes);
    if (slotInt !== null && (slotInt < 1 || slotInt > 60)) return;

    const payload: PatchDoctorSettingsPayload = {
      slot_interval_minutes: slotInt ?? 15,
      max_advance_booking_days: toNum(form.max_advance_booking_days) ?? 30,
      min_advance_hours: toNum(form.min_advance_hours) ?? 0,
      business_hours_summary: form.business_hours_summary.trim() || null,
      cancellation_policy_hours: toNum(form.cancellation_policy_hours),
      max_appointments_per_day: toNum(form.max_appointments_per_day),
      booking_buffer_minutes: toNum(form.booking_buffer_minutes),
    };
    await save(payload);
  }

  return (
    <SettingsPageShell
      title="Booking rules"
      description="Slot length, advance booking limits, cancellation policy, and booking buffers. Prices and currency are under Pricing."
      isLoading={isLoading || !form}
      loadError={loadError}
      onRetry={() => void refetch()}
      saveError={saveError}
    >
      {form ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div>
            <FieldLabel
              htmlFor="slot_interval_minutes"
              tooltip="Length of each bookable appointment slot (e.g. 15 min = 4 slots per hour)."
            >
              Slot interval (minutes)
            </FieldLabel>
            <Input
              id="slot_interval_minutes"
              type="number"
              min={1}
              max={60}
              value={form.slot_interval_minutes}
              onChange={(e) =>
                setForm((p) => ({ ...p, slot_interval_minutes: e.target.value }))
              }
              list="slot_interval_presets"
              className="mt-1"
            />
            <datalist id="slot_interval_presets">
              {SLOT_INTERVAL_OPTIONS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel
                htmlFor="max_advance_booking_days"
                tooltip="How far in advance patients can book (e.g. 90 days)."
              >
                Max advance booking (days)
              </FieldLabel>
              <Input
                id="max_advance_booking_days"
                type="number"
                min={1}
                max={365}
                value={form.max_advance_booking_days}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    max_advance_booking_days: e.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="min_advance_hours"
                tooltip="Minimum hours before an appointment that patients must book."
              >
                Min advance (hours)
              </FieldLabel>
              <Input
                id="min_advance_hours"
                type="number"
                min={0}
                value={form.min_advance_hours}
                onChange={(e) =>
                  setForm((p) => ({ ...p, min_advance_hours: e.target.value }))
                }
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <FieldLabel
              htmlFor="business_hours_summary"
              tooltip="Short summary shown to patients (e.g. Mon–Fri 9am–5pm)."
            >
              Business hours summary
            </FieldLabel>
            <Input
              id="business_hours_summary"
              type="text"
              value={form.business_hours_summary}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  business_hours_summary: e.target.value,
                }))
              }
              maxLength={500}
              placeholder="e.g. Mon–Fri 9am–5pm"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel
                htmlFor="cancellation_policy_hours"
                tooltip="Hours before appointment by which patients must cancel."
              >
                Cancellation policy (hours)
              </FieldLabel>
              <Input
                id="cancellation_policy_hours"
                type="number"
                min={0}
                value={form.cancellation_policy_hours}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    cancellation_policy_hours: e.target.value,
                  }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="max_appointments_per_day"
                tooltip="Maximum appointments per day (empty = no limit)."
              >
                Max appointments/day
              </FieldLabel>
              <Input
                id="max_appointments_per_day"
                type="number"
                min={1}
                value={form.max_appointments_per_day}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    max_appointments_per_day: e.target.value,
                  }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="booking_buffer_minutes"
                tooltip="Buffer between appointments (e.g. 5 min wrap-up)."
              >
                Booking buffer (min)
              </FieldLabel>
              <Input
                id="booking_buffer_minutes"
                type="number"
                min={0}
                value={form.booking_buffer_minutes}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    booking_buffer_minutes: e.target.value,
                  }))
                }
                placeholder="Optional"
                className="mt-1"
              />
            </div>
          </div>
          <SaveButton
            isDirty={isDirty}
            saving={saving}
            saveSuccess={saveSuccess}
          />
        </form>
      ) : null}
    </SettingsPageShell>
  );
}
