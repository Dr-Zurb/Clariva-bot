"use client";

/**
 * VitalsCapture (EHR Sub-batch D / T5.22 — D.1).
 *
 * Bottom-sheet (mobile / <lg) or side-modal (lg+) form for recording a
 * patient_vitals row. All fields are optional — the doctor enters whatever
 * they have and saves. Server enforces the same CHECK ranges; we mirror them
 * client-side as soft hints (min/max on the input + helper text on blur).
 *
 * BMI behaviour (master-batch decision §26 LOCKED — persist over compute-on-read):
 *   - Computed live in the form from weight + height for visual feedback.
 *   - The DB trigger `patient_vitals_bmi_autocompute` (migration 087) also
 *     derives BMI when bmi is left NULL — manual override wins. We therefore
 *     leave `bmi` OUT of the payload and let the server compute it (single
 *     source of truth, avoids client/server drift on rounding).
 *
 * appointment_id propagation (master-batch decision §4):
 *   - In-call host passes the current appointment id ⇒ saved row carries it.
 *   - Chart-panel host (catch-up entry) passes null ⇒ row is patient-level.
 *   - Caller is responsible; this component is dumb about it.
 *
 * On save: returns the freshly created row to the parent so the parent can
 * optimistically prepend it to the section list and refresh the sparkline.
 */

import { useEffect, useMemo, useState } from "react";
import { createPatientVitals } from "@/lib/api/patient-chart";
import type {
  CreatePatientVitalsPayload,
  PatientVitalsReading,
} from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitalsCaptureLayout = "bottom-sheet" | "side-modal" | "auto";

interface VitalsCaptureProps {
  open: boolean;
  onClose: () => void;
  /** Auth + scope. */
  token: string;
  patientId: string;
  /** Master-batch §4 — caller decides whether to thread the appointment id. */
  appointmentId?: string | null;
  /**
   * Layout override. `auto` (default) renders bottom-sheet on screens
   * narrower than `lg` (1024px) and side-modal otherwise. Hosts that
   * already know the surface (e.g. the in-call panel always wants the
   * side-modal) can override.
   */
  layout?: VitalsCaptureLayout;
  /** Called with the freshly persisted row after a successful save. */
  onSaved?: (row: PatientVitalsReading) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const numericOrNull = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Server-side CHECK ranges from migration 087 — mirrored as soft input hints.
const RANGES = {
  bpSys: { min: 40, max: 300 },
  bpDia: { min: 20, max: 200 },
  hr: { min: 20, max: 250 },
  tempC: { min: 30, max: 45 },
  spo2: { min: 50, max: 100 },
  weightKg: { min: 0, max: 500 },
  heightCm: { min: 0, max: 300 },
} as const;

/** Match the server-side BMI trigger (migration 087, ROUND(., 1)). */
function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (
    weightKg === null ||
    heightCm === null ||
    !(heightCm > 0) ||
    !(weightKg > 0)
  ) {
    return null;
  }
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  return Math.round(bmi * 10) / 10;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VitalsCapture({
  open,
  onClose,
  token,
  patientId,
  appointmentId,
  layout = "auto",
  onSaved,
}: VitalsCaptureProps) {
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [hr, setHr] = useState("");
  const [tempC, setTempC] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------- effects --------

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) {
      // Reset on close so reopening starts blank.
      setBpSys("");
      setBpDia("");
      setHr("");
      setTempC("");
      setSpo2("");
      setWeightKg("");
      setHeightCm("");
      setNote("");
      setError(null);
    }
  }, [open]);

  // -------- derived --------

  const wKgNum = useMemo(() => numericOrNull(weightKg), [weightKg]);
  const hCmNum = useMemo(() => numericOrNull(heightCm), [heightCm]);
  const bmi = useMemo(() => computeBmi(wKgNum, hCmNum), [wKgNum, hCmNum]);

  const hasAnyValue = useMemo(() => {
    return [bpSys, bpDia, hr, tempC, spo2, weightKg, heightCm, note]
      .some((v) => v.trim().length > 0);
  }, [bpSys, bpDia, hr, tempC, spo2, weightKg, heightCm, note]);

  // -------- submit --------

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!hasAnyValue) {
      setError("Enter at least one vital before saving.");
      return;
    }

    const payload: CreatePatientVitalsPayload = {
      appointmentId: appointmentId ?? null,
      bpSystolic: numericOrNull(bpSys),
      bpDiastolic: numericOrNull(bpDia),
      heartRate: numericOrNull(hr),
      temperatureC: numericOrNull(tempC),
      spo2: numericOrNull(spo2),
      weightKg: wKgNum,
      heightCm: hCmNum,
      // Leave bmi unset — the DB trigger auto-derives it (decision §26).
      note: note.trim() || null,
    };

    setError(null);
    setBusy(true);
    try {
      const res = await createPatientVitals(token, patientId, payload);
      onSaved?.(res.data.vitals);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reading");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // ------- layout-aware container classes -------
  // `auto` collapses to bottom-sheet on mobile, side-modal on lg+.
  // We use Tailwind's responsive variants instead of JS so SSR has zero
  // hydration mismatch.
  const containerClass = (() => {
    if (layout === "bottom-sheet") {
      // Always-bottom: rare, but supported for tightly-constrained hosts.
      return "fixed inset-x-0 bottom-0 max-h-[90vh] w-full rounded-t-2xl";
    }
    if (layout === "side-modal") {
      return "fixed inset-y-0 right-0 h-full w-full max-w-md";
    }
    // auto:
    //   - <lg: pinned-bottom sheet (covers ~85vh)
    //   - lg+: pinned-right side modal (max-w-md)
    return [
      "fixed",
      "inset-x-0 bottom-0 max-h-[90vh] w-full rounded-t-2xl",
      "lg:inset-y-0 lg:bottom-auto lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:max-w-md lg:rounded-none lg:rounded-l-2xl",
    ].join(" ");
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Record vitals"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end"
      onClick={busy ? undefined : onClose}
    >
      <div
        className={`${containerClass} flex flex-col bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Record vitals
            </h3>
            <p className="text-[11px] text-gray-500">
              All fields optional — fill what you have.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        {/* Body — scrolls inside the sheet/modal */}
        <form
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
          noValidate
        >
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* Blood pressure (paired) */}
            <fieldset className="mb-4">
              <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Blood pressure
              </legend>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Systolic"
                  value={bpSys}
                  onChange={(e) => setBpSys(e.target.value)}
                  min={RANGES.bpSys.min}
                  max={RANGES.bpSys.max}
                  disabled={busy}
                  aria-label="Systolic blood pressure (mmHg)"
                  className="block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <span className="text-sm font-medium text-gray-400">/</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Diastolic"
                  value={bpDia}
                  onChange={(e) => setBpDia(e.target.value)}
                  min={RANGES.bpDia.min}
                  max={RANGES.bpDia.max}
                  disabled={busy}
                  aria-label="Diastolic blood pressure (mmHg)"
                  className="block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <span className="whitespace-nowrap text-xs text-gray-500">
                  mmHg
                </span>
              </div>
            </fieldset>

            {/* Pulse / Temp / SpO2 */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldNumber
                label="Heart rate"
                suffix="bpm"
                value={hr}
                onChange={setHr}
                min={RANGES.hr.min}
                max={RANGES.hr.max}
                disabled={busy}
                aria-label="Heart rate (bpm)"
              />
              <FieldNumber
                label="Temperature"
                suffix="°C"
                value={tempC}
                onChange={setTempC}
                min={RANGES.tempC.min}
                max={RANGES.tempC.max}
                step={0.1}
                disabled={busy}
                aria-label="Temperature (Celsius)"
              />
              <FieldNumber
                label="SpO₂"
                suffix="%"
                value={spo2}
                onChange={setSpo2}
                min={RANGES.spo2.min}
                max={RANGES.spo2.max}
                disabled={busy}
                aria-label="Oxygen saturation (percent)"
              />
            </div>

            {/* Weight / Height / BMI(read-only) */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FieldNumber
                label="Weight"
                suffix="kg"
                value={weightKg}
                onChange={setWeightKg}
                min={RANGES.weightKg.min}
                max={RANGES.weightKg.max}
                step={0.1}
                disabled={busy}
                aria-label="Weight (kilograms)"
              />
              <FieldNumber
                label="Height"
                suffix="cm"
                value={heightCm}
                onChange={setHeightCm}
                min={RANGES.heightCm.min}
                max={RANGES.heightCm.max}
                step={0.1}
                disabled={busy}
                aria-label="Height (centimeters)"
              />
              <div>
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
                  htmlFor="vitals-bmi"
                >
                  BMI
                </label>
                <div
                  id="vitals-bmi"
                  className="flex min-h-[44px] items-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                  aria-live="polite"
                >
                  {bmi !== null ? (
                    <span className="font-medium">{bmi.toFixed(1)}</span>
                  ) : (
                    <span className="text-gray-400">auto from W + H</span>
                  )}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="mb-2">
              <label
                htmlFor="vitals-note"
                className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
              >
                Note
              </label>
              <textarea
                id="vitals-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                disabled={busy}
                placeholder="e.g. before meal, post-walk…"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </p>
            )}
          </div>

          {/* Sticky footer */}
          <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !hasAnyValue}
              className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save reading"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface FieldNumberProps {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  "aria-label"?: string;
}

function FieldNumber({
  label,
  suffix,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  ...rest
}: FieldNumberProps) {
  const id = `vitals-field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={rest["aria-label"]}
          className="block w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
        />
        {suffix && (
          <span className="whitespace-nowrap text-xs text-gray-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
