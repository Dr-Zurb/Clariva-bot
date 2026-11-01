/**
 * Three head counts for the dashboard shell badges and the header bell.
 * Replaces downloading the review list, the day's queue, and a page of
 * events just to read `.length`.
 */

import { DateTime } from 'luxon';
import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { getDoctorTimezone } from './doctor-settings-service';

const LIVE_QUEUE_STATUSES = ['waiting', 'called', 'in_consultation'] as const;

export interface DashboardCounts {
  bookingReviewsUnconfirmed: number;
  opdLive: number;
  dashboardEventsUnread: number;
}

type HeadResult = { count: number | null; error: unknown };

async function countHead(
  query: PromiseLike<HeadResult>,
  correlationId: string,
): Promise<number> {
  const { count, error } = await query;
  if (error) handleSupabaseError(error, correlationId);
  return count ?? 0;
}

export async function getDashboardCountsForDoctor(
  doctorId: string,
  correlationId: string,
): Promise<DashboardCounts> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('dashboard-counts: Supabase admin client unavailable');
  }

  const timezone = await getDoctorTimezone(doctorId);
  const today = DateTime.now().setZone(timezone).toISODate();
  if (!today) {
    throw new InternalError('dashboard-counts: doctor timezone did not resolve a clinic day');
  }

  const [bookingReviewsUnconfirmed, opdLive, dashboardEventsUnread] = await Promise.all([
    countHead(
      admin
        .from('service_staff_review_requests')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('status', 'pending'),
      correlationId,
    ),
    countHead(
      admin
        .from('opd_queue_entries')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('session_date', today)
        .in('status', [...LIVE_QUEUE_STATUSES]),
      correlationId,
    ),
    countHead(
      admin
        .from('doctor_dashboard_events')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .is('acknowledged_at', null),
      correlationId,
    ),
  ]);

  return { bookingReviewsUnconfirmed, opdLive, dashboardEventsUnread };
}
