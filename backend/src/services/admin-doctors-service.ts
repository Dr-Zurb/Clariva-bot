/**
 * Admin Doctors Directory Service (admin-console-v3 · acon3-01; auth-v2).
 *
 * Read-only aggregation: `auth.users` (spine) LEFT-joined with
 * `doctor_settings` + `doctor_verification`. Derives `funnelStatus` from
 * verification only — invite/`password_set` signals retired with auth-v2.
 *
 * ## PII
 *
 * Email and full name are returned to the authenticated admin caller. Never
 * log them — structured logs carry only `correlationId` + `count` + event.
 *
 * @see docs/Work/Daily-plans/July 2026/23-07-2026/auth-v2/
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import type {
  AdminDoctorFunnelStatus,
  AdminDoctorListItem,
} from '../types/admin-doctor';
import type { VerificationStatus } from '../types/doctor-verification';
import { InternalError } from '../utils/errors';

type AuthUserRow = {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  user_metadata?: {
    full_name?: string;
  } & Record<string, unknown>;
};

function requireAdmin(): SupabaseClient {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

/**
 * Derive funnel status (auth-v2 · AV2-D6).
 * Exported for unit tests.
 */
export function deriveFunnelStatus(input: {
  verificationStatus: VerificationStatus | null;
}): AdminDoctorFunnelStatus {
  const v = input.verificationStatus;
  if (
    v === 'pending_review' ||
    v === 'verified' ||
    v === 'rejected' ||
    v === 'changes_requested'
  ) {
    return v;
  }
  // Authed but not yet submitted for verification (or unverified row).
  return 'onboarding';
}

async function listAllAuthUsers(admin: SupabaseClient): Promise<AuthUserRow[]> {
  const perPage = 200;
  const users: AuthUserRow[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new InternalError('Failed to list auth users for admin directory');
    }
    const batch = (data?.users ?? []) as AuthUserRow[];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

/**
 * List every auth user as an admin directory row with derived funnel status.
 * Optional `status` filters by the derived funnelStatus after aggregation.
 */
export async function listAdminDoctors(
  correlationId: string,
  status?: AdminDoctorFunnelStatus,
): Promise<AdminDoctorListItem[]> {
  const admin = requireAdmin();

  const authUsers = await listAllAuthUsers(admin);
  const withEmail = authUsers.filter(
    (u) => typeof u.email === 'string' && u.email.trim().length > 0,
  );
  const ids = withEmail.map((u) => u.id);

  const settingsById = new Map<
    string,
    { practiceName: string | null; specialty: string | null }
  >();
  const verificationById = new Map<
    string,
    { status: VerificationStatus; fullName: string | null; specialty: string | null }
  >();

  if (ids.length > 0) {
    const { data: settingsRows, error: settingsErr } = await admin
      .from('doctor_settings')
      .select('doctor_id, practice_name, specialty')
      .in('doctor_id', ids);

    if (settingsErr) {
      throw new InternalError('Failed to load doctor_settings for admin directory');
    }
    for (const row of settingsRows ?? []) {
      settingsById.set(row.doctor_id as string, {
        practiceName: (row.practice_name as string | null) ?? null,
        specialty: (row.specialty as string | null) ?? null,
      });
    }

    const { data: verificationRows, error: verificationErr } = await admin
      .from('doctor_verification')
      .select('doctor_id, status, full_name, specialty')
      .in('doctor_id', ids);

    if (verificationErr) {
      throw new InternalError(
        'Failed to load doctor_verification for admin directory',
      );
    }
    for (const row of verificationRows ?? []) {
      verificationById.set(row.doctor_id as string, {
        status: row.status as VerificationStatus,
        fullName: (row.full_name as string | null) ?? null,
        specialty: (row.specialty as string | null) ?? null,
      });
    }
  }

  const items: AdminDoctorListItem[] = withEmail.map((u) => {
    const settings = settingsById.get(u.id);
    const verification = verificationById.get(u.id);
    const metaFullName =
      typeof u.user_metadata?.full_name === 'string'
        ? u.user_metadata.full_name
        : null;
    const verificationStatus = verification?.status ?? null;
    const funnelStatus = deriveFunnelStatus({ verificationStatus });

    return {
      doctorId: u.id,
      email: (u.email as string).trim(),
      fullName: verification?.fullName ?? metaFullName,
      practiceName: settings?.practiceName ?? null,
      specialty: settings?.specialty ?? verification?.specialty ?? null,
      funnelStatus,
      verificationStatus,
      lastSignInAt: u.last_sign_in_at ?? null,
      createdAt: u.created_at ?? null,
    };
  });

  items.sort((a, b) => {
    const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bT - aT;
  });

  const filtered = status
    ? items.filter((i) => i.funnelStatus === status)
    : items;

  logger.info(
    {
      correlationId,
      count: filtered.length,
      event: 'admin_doctors_listed',
    },
    'admin_doctors_listed',
  );

  return filtered;
}
