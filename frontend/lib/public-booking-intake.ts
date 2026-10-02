/**
 * mca-14: owned-page /book intake. Matches backend checkout validation.
 * Do not log these values.
 */

export const PUBLIC_BOOKING_PHONE_RE = /^\+?[1-9]\d{1,14}$/;
export const PUBLIC_BOOKING_NAME_MAX = 200;
export const PUBLIC_BOOKING_REASON_MAX = 500;

export type PublicBookingIntakeDraft = {
  patientName: string;
  patientPhone: string;
  reasonForVisit: string;
  consentGranted: boolean;
};

export type PublicBookingIntakeReady = {
  patientName: string;
  patientPhone: string;
  reasonForVisit: string;
  consentGranted: true;
};

export type PublicClinicSex = "male" | "female" | "other";

export type PublicBookingIntakeField =
  | "patientName"
  | "patientPhone"
  | "patientAge"
  | "patientSex"
  | "reasonForVisit"
  | "consentGranted";

export type PublicBookingIntakeResult =
  | { ok: true; value: PublicBookingIntakeReady }
  | { ok: false; field: PublicBookingIntakeField; message: string };

export function normalizePublicBookingPhone(raw: string): string {
  return raw.replace(/[\s().-]/g, "");
}

export function resolvePublicBookingIntake(
  draft: PublicBookingIntakeDraft
): PublicBookingIntakeResult {
  const patientName = draft.patientName.trim();
  if (!patientName) {
    return { ok: false, field: "patientName", message: "Name is required" };
  }
  if (patientName.length > PUBLIC_BOOKING_NAME_MAX) {
    return {
      ok: false,
      field: "patientName",
      message: `Name must be at most ${PUBLIC_BOOKING_NAME_MAX} characters`,
    };
  }

  const patientPhone = normalizePublicBookingPhone(draft.patientPhone);
  if (!patientPhone) {
    return { ok: false, field: "patientPhone", message: "Phone is required" };
  }
  if (!PUBLIC_BOOKING_PHONE_RE.test(patientPhone)) {
    return {
      ok: false,
      field: "patientPhone",
      message: "Please provide a valid phone number (e.g. +919876543210)",
    };
  }

  const reasonForVisit = draft.reasonForVisit.trim();
  if (!reasonForVisit) {
    return {
      ok: false,
      field: "reasonForVisit",
      message: "Reason for visit is required",
    };
  }
  if (reasonForVisit.length > PUBLIC_BOOKING_REASON_MAX) {
    return {
      ok: false,
      field: "reasonForVisit",
      message: `Reason for visit must be at most ${PUBLIC_BOOKING_REASON_MAX} characters`,
    };
  }

  if (draft.consentGranted !== true) {
    return {
      ok: false,
      field: "consentGranted",
      message: "Consent is required to continue",
    };
  }

  return {
    ok: true,
    value: {
      patientName,
      patientPhone,
      reasonForVisit,
      consentGranted: true,
    },
  };
}

export type PublicClinicIntakeDraft = PublicBookingIntakeDraft & {
  patientAge: string;
  patientSex: string;
};

export type PublicClinicIntakeReady = PublicBookingIntakeReady & {
  patientAge: number;
  patientSex: PublicClinicSex;
};

/** Slug checkout. Age and sex are required. Does not log the values. */
export function resolvePublicClinicIntake(
  draft: PublicClinicIntakeDraft
): { ok: true; value: PublicClinicIntakeReady } | { ok: false; field: PublicBookingIntakeField; message: string } {
  const base = resolvePublicBookingIntake(draft);
  if (!base.ok) return base;

  const age = Number.parseInt(draft.patientAge.trim(), 10);
  if (!draft.patientAge.trim() || Number.isNaN(age) || age < 1 || age > 120) {
    return {
      ok: false,
      field: "patientAge",
      message: "Please provide a valid age (1-120)",
    };
  }

  const sex = draft.patientSex.trim();
  if (sex !== "male" && sex !== "female" && sex !== "other") {
    return { ok: false, field: "patientSex", message: "Sex is required" };
  }

  return {
    ok: true,
    value: {
      ...base.value,
      patientAge: age,
      patientSex: sex,
    },
  };
}
