"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";
import { settingsFieldClassName } from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

const PRACTICE_CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP"] as const;

const PRACTICE_CURRENCY_LABEL: Record<
  (typeof PRACTICE_CURRENCY_OPTIONS)[number],
  string
> = {
  INR: "INR (₹)",
  USD: "USD ($)",
  EUR: "EUR (€)",
  GBP: "GBP (£)",
};

type CurrencyForm = { currency: string };

function toForm(s: DoctorSettings): CurrencyForm {
  return {
    currency: (s.appointment_fee_currency ?? "INR").toUpperCase().slice(0, 3),
  };
}

interface PracticeCurrencyPanelProps {
  token: string;
}

/** Practice currency block for Pricing page (SR-D3). */
export function PracticeCurrencyPanel({ token }: PracticeCurrencyPanelProps) {
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
  } = useDoctorSettingsForm(token, toForm);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const currency = (form.currency.trim() || "INR").toUpperCase().slice(0, 3);
    const payload: PatchDoctorSettingsPayload = {
      appointment_fee_currency: currency,
    };
    await save(payload);
  }

  if (isLoading || !form) {
    return (
      <div
        className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading currency…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        {loadError}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4"
      aria-labelledby="practice-currency-heading"
    >
      <h2
        id="practice-currency-heading"
        className="text-sm font-semibold text-foreground"
      >
        Practice currency
      </h2>
      <p className="text-sm text-muted-foreground">
        All service catalog prices and checkout quotes use this currency.
      </p>
      {saveError ? (
        <p className="text-sm text-destructive" role="status">
          {saveError}
        </p>
      ) : null}
      <div className="max-w-xs">
        <FieldLabel
          htmlFor="appointment_fee_currency"
          tooltip="ISO 4217 code. Amounts are stored in minor units (e.g. paise or cents)."
        >
          Currency
        </FieldLabel>
        <select
          id="appointment_fee_currency"
          value={form.currency}
          onChange={(e) => setForm({ currency: e.target.value })}
          className={settingsFieldClassName}
        >
          {PRACTICE_CURRENCY_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {PRACTICE_CURRENCY_LABEL[code]}
            </option>
          ))}
        </select>
      </div>
      <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
    </form>
  );
}
