/**
 * Admin doctors directory types (admin-console-v3 · acon3-01; auth-v2 simplified).
 *
 * Funnel status is derived server-side from doctor_verification (AV2-D6).
 * Email is returned to the authenticated admin UI but must never be logged (PII).
 */

import type { VerificationStatus } from './doctor-verification';

export const ADMIN_DOCTOR_FUNNEL_STATUSES = [
  'onboarding',
  'pending_review',
  'verified',
  'rejected',
  'changes_requested',
] as const;

export type AdminDoctorFunnelStatus =
  (typeof ADMIN_DOCTOR_FUNNEL_STATUSES)[number];

/** Admin directory row — email is for UI identity only; never log it. */
export interface AdminDoctorListItem {
  doctorId: string;
  email: string;
  fullName: string | null;
  practiceName: string | null;
  specialty: string | null;
  funnelStatus: AdminDoctorFunnelStatus;
  /** Raw verification row status, or null when no doctor_verification row. */
  verificationStatus: VerificationStatus | null;
  lastSignInAt: string | null;
  createdAt: string | null;
}
