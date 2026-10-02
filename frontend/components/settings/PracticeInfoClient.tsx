"use client";

import { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SpecialtyCombobox } from "@/components/practice-setup/SpecialtyCombobox";
import {
  SettingsPageShell,
  settingsFieldClassName,
} from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import type {
  DoctorSettings,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
] as const;

type PracticeInfoForm = {
  practice_name: string;
  public_slug: string;
  timezone: string;
  specialty: string;
  qualifications: string;
  address_summary: string;
  share_address_on_instagram: boolean;
};

function shareAddressOnInstagram(s: DoctorSettings): boolean {
  if (s.share_address_on_instagram === false) return false;
  if (s.share_address_on_instagram === true) return true;
  return Boolean(s.address_summary?.trim());
}

function toForm(s: DoctorSettings): PracticeInfoForm {
  return {
    practice_name: s.practice_name ?? "",
    public_slug: s.public_slug ?? "",
    timezone: s.timezone?.trim() || "UTC",
    specialty: s.specialty ?? "",
    qualifications: s.qualifications ?? "",
    address_summary: s.address_summary ?? "",
    share_address_on_instagram: shareAddressOnInstagram(s),
  };
}

interface PracticeInfoClientProps {
  token: string;
}

/**
 * Settings → Practice info (settings-refresh · sr-02). Currency lives on Pricing.
 */
export function PracticeInfoClient({ token }: PracticeInfoClientProps) {
  const [copied, setCopied] = useState(false);
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
    const slug = form.public_slug.trim().toLowerCase();
    const payload: PatchDoctorSettingsPayload = {
      practice_name: form.practice_name.trim() || null,
      ...(slug ? { public_slug: slug } : {}),
      timezone: form.timezone.trim() || "UTC",
      specialty: form.specialty.trim() || null,
      qualifications: form.qualifications.trim() || null,
      address_summary: form.address_summary.trim() || null,
      share_address_on_instagram: form.share_address_on_instagram,
    };
    await save(payload);
  }

  const bookingPath = form?.public_slug?.trim()
    ? `/d/${form.public_slug.trim().toLowerCase()}`
    : "";

  async function copyBookingLink() {
    if (!bookingPath || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${bookingPath}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SettingsPageShell
      title="Practice info"
      description="Practice name, timezone, specialty, qualifications, and address. Prices and currency are under Pricing."
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
              htmlFor="practice_name"
              tooltip="Name of your practice or clinic as shown to patients."
            >
              Practice name
            </FieldLabel>
            <Input
              id="practice_name"
              type="text"
              value={form.practice_name}
              onChange={(e) =>
                setForm((p) => ({ ...p, practice_name: e.target.value }))
              }
              maxLength={200}
              className="mt-1"
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="public_slug"
              tooltip="The link patients open from your bio. Lowercase letters, numbers, and hyphens."
            >
              Booking link
            </FieldLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              {bookingPath
                ? bookingPath
                : "Save practice info once and this link is created for you."}
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                id="public_slug"
                type="text"
                value={form.public_slug}
                onChange={(e) => {
                  setCopied(false);
                  setForm((p) => ({ ...p, public_slug: e.target.value }));
                }}
                maxLength={48}
                spellCheck={false}
                autoCapitalize="none"
                className="mt-0"
              />
              <button
                type="button"
                onClick={() => void copyBookingLink()}
                disabled={!bookingPath}
                className="shrink-0 rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <div>
            <FieldLabel
              htmlFor="timezone"
              tooltip="Your local timezone for scheduling and appointment times."
            >
              Timezone
            </FieldLabel>
            <select
              id="timezone"
              value={form.timezone}
              onChange={(e) =>
                setForm((p) => ({ ...p, timezone: e.target.value }))
              }
              className={settingsFieldClassName}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel
              htmlFor="specialty"
              tooltip="Search the curated list (India-focused). Pick a row or choose Other / not listed — then type a custom specialty (max 200 characters)."
            >
              Specialty
            </FieldLabel>
            <SpecialtyCombobox
              id="specialty"
              value={form.specialty}
              onChange={(next) => setForm((p) => ({ ...p, specialty: next }))}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="qualifications"
              tooltip="Degrees as they should appear on the prescription, e.g. MBBS, MD."
            >
              Qualifications
            </FieldLabel>
            <Input
              id="qualifications"
              type="text"
              value={form.qualifications}
              maxLength={200}
              className="mt-1"
              onChange={(e) =>
                setForm((p) => ({ ...p, qualifications: e.target.value }))
              }
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="address_summary"
              tooltip="Printed on the prescription. Instagram says it only when the box below is on."
            >
              Address summary
            </FieldLabel>
            <Input
              id="address_summary"
              type="text"
              value={form.address_summary}
              onChange={(e) =>
                setForm((p) => ({ ...p, address_summary: e.target.value }))
              }
              maxLength={500}
              placeholder="e.g. 123 Main St, City"
              className="mt-1"
            />
            <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.share_address_on_instagram}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    share_address_on_instagram: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span>
                <span className="font-medium">
                  Show this address when someone asks on Instagram
                </span>
                <span className="mt-1 block text-muted-foreground">
                  The prescription still prints this address. Instagram says it
                  only when this is on.
                </span>
              </span>
            </label>
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
