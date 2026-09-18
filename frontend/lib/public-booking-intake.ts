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

export type PublicBookingIntakeField =
  | "patientName"
  | "patientPhone"
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
