"use client";

/**
 * Plan 03 · Task 12: compact editor shown when `catalog_mode === 'single_fee'`.
 *
 * Philosophy — intentionally minimal. A single-fee doctor has ONE decision to
 * make per setup visit: the flat amount and which modalities they offer. Every
 * other Plan 02 surface (AI sparkle, starter panel, review panel, health badge,
 * scope nudges) is hidden upstream at the page level because the multi-service
 * editor is not mounted at all in this mode.
 *
 * Persistence:
 *   - `appointment_fee_minor` : flat fee (minor units — paise/cents).
 *   - `appointment_fee_currency` : ISO code, matches practice-info picker.
 *   - `consultation_types`    : canonical "Text, Voice, Video consultations"
 *                               string; backend Task 09 parses it with the
 *                               shared keyword regex and rebuilds the one-entry
 *                               catalog. See
 *                               `backend/src/utils/consultation-types.ts` for
 *                               the authoritative parser.
 *
 * The backend regenerates `service_offerings_json` atomically on every
 * qualifying PATCH (Task 09 triggers B/C), so after a successful save the
 * parent page refetches `doctorSettings` and the preview updates from the
 * server-truth catalog.
 */

import { useEffect, useMemo, useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";
import {
  ALL_MODALITIES,
  modalitiesToConsultationTypes,
  modalityLabel,
  parseConsultationTypesToModalities,
  type AllowedModalities,
  type ModalityKey,
} from "@/lib/consultation-types-modalities";

/** ISO codes kept in sync with `PRACTICE_CURRENCY_OPTIONS` on the practice-info page. */
const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP"] as const;
type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];
const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

type Props = {
  doctorSettings: DoctorSettings;
  onSave: (patch: PatchDoctorSettingsPayload) => Promise<boolean>;
  isSaving: boolean;
  saveSuccess: boolean;
  /** Small footer affordance: ask the page to start the single→multi confirmation flow. */
  onRequestSwitchToMultiService: () => void;
  /** Surfaced so the preview label matches the auto-generated "{practice} Consultation" entry. */
  practiceName: string | null;
};

type FormState = {
  currency: CurrencyCode;
  amountMajor: string; // as typed — validated on save
  modalities: AllowedModalities;
};

function toFormState(s: DoctorSettings): FormState {
  const currency = (s.appointment_fee_currency ?? "INR").toUpperCase();
  const isKnown = (CURRENCY_OPTIONS as readonly string[]).includes(currency);
  return {
    currency: (isKnown ? currency : "INR") as CurrencyCode,
    amountMajor:
      s.appointment_fee_minor != null && s.appointment_fee_minor > 0
        ? String(s.appointment_fee_minor / 100)
        : "",
    modalities: parseConsultationTypesToModalities(s.consultation_types),
  };
}

function snapshot(state: FormState): string {
  return JSON.stringify(state);
}

/** Parse "123", "123.50", " 123.5 " etc. → minor units. Returns null on invalid input. */
function toMinor(amountMajor: string): number | null {
  const trimmed = amountMajor.trim();
  if (!trimmed) return null;
  // Allow digits with optional single decimal point (2 decimals for paise/cents).
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
  return Math.round(asNumber * 100);
}

export function SingleFeeCatalogEditor({
  doctorSettings,
  onSave,
  isSaving,
  saveSuccess,
  onRequestSwitchToMultiService,
  practiceName,
}: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(doctorSettings));
  const [lastSaved, setLastSaved] = useState<string>(() =>
    snapshot(toFormState(doctorSettings))
  );
  const [error, setError] = useState<string | null>(null);

  // Reset form when an externally-driven refetch changes the underlying settings
  // (e.g. after the parent PATCHes `catalog_mode` and refetches). `toFormState`
  // reads exactly these three fields; depending on the whole `doctorSettings`
  // object would thrash this effect on every unrelated setting change (WhatsApp
  // number, booking policy, etc.) and wipe the doctor's in-progress edits.
  useEffect(() => {
    const next = toFormState(doctorSettings);
    setForm(next);
    setLastSaved(snapshot(next));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    doctorSettings.appointment_fee_minor,
    doctorSettings.appointment_fee_currency,
    doctorSettings.consultation_types,
  ]);

  const isDirty = useMemo(
    () => snapshot(form) !== lastSaved,
    [form, lastSaved]
  );

  const modalitySelectedCount = useMemo(
    () =>
      (form.modalities.text ? 1 : 0) +
      (form.modalities.voice ? 1 : 0) +
      (form.modalities.video ? 1 : 0),
    [form.modalities]
  );

  const parsedAmount = useMemo(() => toMinor(form.amountMajor), [form.amountMajor]);

  const validationError = useMemo<string | null>(() => {
    if (!form.amountMajor.trim()) return "Enter your consultation fee.";
    if (parsedAmount == null) {
      return "Enter a valid amount (e.g. 500 or 500.00).";
    }
    if (modalitySelectedCount === 0) {
      return "Enable at least one consultation modality.";
    }
    return null;
  }, [form.amountMajor, parsedAmount, modalitySelectedCount]);

  const toggleModality = (m: ModalityKey) => {
    setForm((prev) => ({
      ...prev,
      modalities: { ...prev.modalities, [m]: !prev.modalities[m] },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (parsedAmount == null) return; // narrowed for TS; validation already surfaced

    const payload: PatchDoctorSettingsPayload = {
      appointment_fee_minor: parsedAmount,
      appointment_fee_currency: form.currency,
      consultation_types: modalitiesToConsultationTypes(form.modalities),
    };
    const ok = await onSave(payload);
    if (ok) {
      setLastSaved(snapshot(form));
    }
  };

  const currencySymbol = CURRENCY_SYMBOL[form.currency];
  const previewLabel = practiceName?.trim()
    ? `${practiceName.trim()} Consultation`
    : "Consultation";
  const previewModalities: string = useMemo(() => {
    const enabled = ALL_MODALITIES.filter((m) => form.modalities[m]);
    if (enabled.length === 0) return "no modalities enabled";
    if (enabled.length === ALL_MODALITIES.length) return "text, voice, video";
    return enabled.join(", ");
  }, [form.modalities]);

  return (
    <section
      aria-labelledby="single-fee-editor-heading"
      data-testid="single-fee-catalog-editor"
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="single-fee-editor-heading"
          className="text-base font-semibold text-gray-900"
        >
          Consultation fee
        </h2>
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
          Single-fee mode
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        One flat fee applies across every consultation modality you enable below.
        Quotes, checkout, and the assistant use the same number.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div>
            <FieldLabel
              htmlFor="single-fee-currency"
              tooltip="ISO 4217 code. Change the practice currency on Practice Info if this doesn't match."
            >
              Currency
            </FieldLabel>
            <select
              id="single-fee-currency"
              data-testid="single-fee-currency"
              value={form.currency}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  currency: e.target.value as CurrencyCode,
                }))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CURRENCY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel
              htmlFor="single-fee-amount"
              tooltip="Stored in minor units (paise / cents). Show the amount in major units — we convert automatically."
            >
              Amount
            </FieldLabel>
            <div className="mt-1 flex items-stretch rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <span
                aria-hidden
                className="inline-flex select-none items-center bg-gray-50 px-3 text-sm font-medium text-gray-600"
              >
                {currencySymbol}
              </span>
              <input
                id="single-fee-amount"
                data-testid="single-fee-amount"
                type="text"
                inputMode="decimal"
                value={form.amountMajor}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amountMajor: e.target.value }))
                }
                placeholder="500"
                className="block w-full rounded-r-md border-0 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>

        <fieldset
          aria-describedby="single-fee-modalities-hint"
          className="space-y-2"
        >
          <legend className="text-sm font-medium text-gray-700">
            Consultation modalities
          </legend>
          <p id="single-fee-modalities-hint" className="text-xs text-gray-500">
            Enable the channels you offer. All enabled modalities share the flat fee above.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {ALL_MODALITIES.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  data-testid={`single-fee-modality-${m}`}
                  checked={form.modalities[m]}
                  onChange={() => toggleModality(m)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{modalityLabel(m)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div
          data-testid="single-fee-preview"
          className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-700"
        >
          <span className="font-medium text-gray-900">Preview: </span>
          <span>
            &ldquo;{previewLabel}&rdquo; · {currencySymbol}
            {form.amountMajor || "0"} · {previewModalities}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <SaveButton
            isDirty={isDirty}
            saving={isSaving}
            saveSuccess={saveSuccess}
            disableReason={isDirty ? validationError : null}
          />
        </div>
      </form>

      <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
        Offering multiple services with different fees?{" "}
        <button
          type="button"
          data-testid="switch-to-multi-service"
          onClick={onRequestSwitchToMultiService}
          className="font-medium text-blue-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Switch to multi-service mode
        </button>
        .
      </div>
    </section>
  );
}
