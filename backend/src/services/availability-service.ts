/**
 * Availability Service Functions
 *
 * Service functions for availability-related database operations.
 * Availability contains no PHI (administrative data).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { Availability, InsertAvailability, UpdateAvailability, BlockedTime } from '../types';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { logDataModification, logDataAccess, logAuditEvent } from '../utils/audit-logger';
import { InternalError } from '../utils/errors';

/** Slot interval in minutes (default 30) */
const SLOT_INTERVAL_MINUTES = env.SLOT_INTERVAL_MINUTES;

export interface AvailableSlot {
  start: string;
  end: string;
  durationMinutes?: number;
}

/**
 * Get doctor availability
 * 
 * Retrieves all availability records for a specific doctor.
 * 
 * @param doctorId - Doctor ID
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (must match doctorId)
 * @returns Array of availability records
 * 
 * @throws ForbiddenError if doctor_id doesn't match userId
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function getDoctorAvailability(
  doctorId: string,
  correlationId: string,
  userId: string
): Promise<Availability[]> {
  // Validate ownership (defense in depth)
  validateOwnership(doctorId, userId);

  const { data: availability, error } = await supabase
    .from('availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('day_of_week', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (read access)
  await logDataAccess(correlationId, userId, 'availability', undefined);

  return (availability || []) as Availability[];
}

/**
 * Get available time slots for a doctor on a date
 *
 * Fetches availability for the date's day_of_week; generates slots within availability windows;
 * excludes blocked_times and booked appointments (status pending/confirmed).
 * Uses service role client (no userId) for webhook worker and patient-facing unauthenticated API.
 *
 * @param doctorId - Doctor ID
 * @param date - Date string YYYY-MM-DD
 * @param correlationId - Request correlation ID
 * @returns Array of available slots { start, end, durationMinutes }; empty array if no availability
 * @throws InternalError if service role client not available or database fails
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string,
  correlationId: string
): Promise<AvailableSlot[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available for slot lookup');
  }

  const dayOfWeek = getDayOfWeek(date);
  const { dayStart, dayEnd } = getDayBounds(date);

  const [availabilityRows, blockedRows, appointmentRows] = await Promise.all([
    fetchAvailabilityForDay(supabaseAdmin, doctorId, dayOfWeek),
    fetchBlockedTimesForDay(supabaseAdmin, doctorId, dayStart, dayEnd),
    fetchBookedAppointmentsForDay(supabaseAdmin, doctorId, dayStart, dayEnd),
  ]);

  const slots = generateSlotsFromAvailability(
    date,
    availabilityRows as Availability[],
    SLOT_INTERVAL_MINUTES
  );

  const blockedList = blockedRows as BlockedTime[];
  const appointmentList = appointmentRows as { appointment_date: Date | string }[];
  const filtered = slots.filter((slot) => {
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);
    const blocked = blockedList.some((b) =>
      overlaps(slotStart, slotEnd, new Date(b.start_time), new Date(b.end_time))
    );
    const booked = appointmentList.some((a) => {
      const appStart = new Date(a.appointment_date);
      const appEnd = new Date(appStart.getTime() + SLOT_INTERVAL_MINUTES * 60 * 1000);
      return overlaps(slotStart, slotEnd, appStart, appEnd);
    });
    return !blocked && !booked;
  });

  await logAuditEvent({
    correlationId,
    action: 'get_available_slots',
    resourceType: 'availability',
    status: 'success',
    metadata: { doctorId, date, slotCount: filtered.length },
  });

  return filtered;
}

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.getUTCDay();
}

function getDayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
  return { dayStart, dayEnd };
}

async function fetchAvailabilityForDay(
  client: SupabaseClient,
  doctorId: string,
  dayOfWeek: number
): Promise<unknown[]> {
  const { data, error } = await client
    .from('availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_available', true)
    .order('start_time', { ascending: true });

  if (error) throw new InternalError('Failed to fetch availability');
  return data || [];
}

async function fetchBlockedTimesForDay(
  client: SupabaseClient,
  doctorId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<unknown[]> {
  const { data, error } = await client
    .from('blocked_times')
    .select('*')
    .eq('doctor_id', doctorId)
    .lte('start_time', dayEnd.toISOString())
    .gte('end_time', dayStart.toISOString());

  if (error) throw new InternalError('Failed to fetch blocked times');
  return data || [];
}

async function fetchBookedAppointmentsForDay(
  client: SupabaseClient,
  doctorId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<unknown[]> {
  const { data, error } = await client
    .from('appointments')
    .select('id, appointment_date')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', dayStart.toISOString())
    .lte('appointment_date', dayEnd.toISOString());

  if (error) throw new InternalError('Failed to fetch appointments');
  return data || [];
}

function generateSlotsFromAvailability(
  dateStr: string,
  availability: Availability[],
  intervalMinutes: number
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];

  for (const row of availability) {
    const [startH, startM] = parseTime(row.start_time);
    const [endH, endM] = parseTime(row.end_time);
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;

    while (current + intervalMinutes <= end) {
      const sh = Math.floor(current / 60);
      const sm = current % 60;
      const eh = Math.floor((current + intervalMinutes) / 60);
      const em = (current + intervalMinutes) % 60;
      const start = `${dateStr}T${pad(sh)}:${pad(sm)}:00.000Z`;
      const endIso = `${dateStr}T${pad(eh)}:${pad(em)}:00.000Z`;
      slots.push({
        start,
        end: endIso,
        durationMinutes: intervalMinutes,
      });
      current += intervalMinutes;
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

function parseTime(t: string): [number, number] {
  const parts = t.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return [h, m];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Create availability record
 * 
 * Creates a new availability record for a doctor.
 * 
 * @param data - Availability data to insert
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor)
 * @returns Created availability record
 * 
 * @throws ForbiddenError if doctor_id doesn't match userId
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function createAvailability(
  data: InsertAvailability,
  correlationId: string,
  userId: string
): Promise<Availability> {
  // Validate ownership (defense in depth)
  validateOwnership(data.doctor_id, userId);

  // Create availability (user role - respects RLS)
  const { data: availability, error } = await supabase
    .from('availability')
    .insert(data)
    .select()
    .single();

  if (error || !availability) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    userId,
    'create',
    'availability',
    availability.id
  );

  return availability as Availability;
}

/**
 * Update availability record
 * 
 * Updates an existing availability record.
 * 
 * @param id - Availability ID
 * @param data - Update data
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor)
 * @returns Updated availability record
 * 
 * @throws ForbiddenError if availability doesn't belong to user
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function updateAvailability(
  id: string,
  data: UpdateAvailability,
  correlationId: string,
  userId: string
): Promise<Availability> {
  // Get existing availability (to validate ownership)
  const { data: existing, error: fetchError } = await supabase
    .from('availability')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  // Validate ownership (defense in depth)
  validateOwnership(existing.doctor_id, userId);

  // Update availability (user role - respects RLS)
  const { data: updated, error } = await supabase
    .from('availability')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Get changed fields (field names only, not values)
  const changedFields = Object.keys(data as Record<string, unknown>).filter(
    (key) => key !== 'id'
  );

  // Audit log
  await logDataModification(
    correlationId,
    userId,
    'update',
    'availability',
    id,
    changedFields
  );

  return updated as Availability;
}
