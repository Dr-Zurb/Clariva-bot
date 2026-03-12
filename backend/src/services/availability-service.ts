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
import { InternalError, NotFoundError } from '../utils/errors';

/** Slot interval in minutes (default 30) */
const SLOT_INTERVAL_MINUTES = env.SLOT_INTERVAL_MINUTES;

/**
 * Per-doctor mutex to serialize PUT availability.
 * Prevents concurrent delete+insert from racing and causing 409 unique violation.
 */
const doctorAvailabilityLocks = new Map<string, Promise<unknown>>();

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
 * Note: Uses service role client. Ownership is validated before query; RLS would
 * require auth.uid() but the backend anon client has no user JWT, so we use admin.
 */
export async function getDoctorAvailability(
  doctorId: string,
  correlationId: string,
  userId: string
): Promise<Availability[]> {
  // Validate ownership (defense in depth)
  validateOwnership(doctorId, userId);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for availability fetch');
  }

  const { data: availability, error } = await admin
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

/** Options for getAvailableSlots (per-doctor overrides) */
export interface GetAvailableSlotsOptions {
  slotIntervalMinutes?: number;
  minAdvanceHours?: number;
  /** IANA timezone (e.g. Asia/Kolkata) for slot timestamps; availability times are local to this TZ (e-task-2) */
  timezone?: string;
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
 * @param options - Optional slotIntervalMinutes (default env), minAdvanceHours (default 0)
 * @returns Array of available slots { start, end, durationMinutes }; empty array if no availability
 * @throws InternalError if service role client not available or database fails
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string,
  correlationId: string,
  options?: GetAvailableSlotsOptions
): Promise<AvailableSlot[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new InternalError('Service role client not available for slot lookup');
  }

  const slotInterval = options?.slotIntervalMinutes ?? SLOT_INTERVAL_MINUTES;
  const minAdvanceHours = options?.minAdvanceHours ?? 0;
  const timezone = options?.timezone;

  const dayOfWeek = getDayOfWeek(date, timezone);
  const { dayStart, dayEnd } = getDayBounds(date, timezone);

  const [availabilityRows, blockedRows, appointmentRows] = await Promise.all([
    fetchAvailabilityForDay(supabaseAdmin, doctorId, dayOfWeek),
    fetchBlockedTimesForDay(supabaseAdmin, doctorId, dayStart, dayEnd),
    fetchBookedAppointmentsForDay(supabaseAdmin, doctorId, dayStart, dayEnd),
  ]);

  const slots = generateSlotsFromAvailability(
    date,
    availabilityRows as Availability[],
    slotInterval,
    timezone
  );

  const blockedList = blockedRows as BlockedTime[];
  const appointmentList = appointmentRows as { appointment_date: Date | string }[];
  let filtered = slots.filter((slot) => {
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);
    const blocked = blockedList.some((b) =>
      overlaps(slotStart, slotEnd, new Date(b.start_time), new Date(b.end_time))
    );
    const booked = appointmentList.some((a) => {
      const appStart = new Date(a.appointment_date);
      const appEnd = new Date(appStart.getTime() + slotInterval * 60 * 1000);
      return overlaps(slotStart, slotEnd, appStart, appEnd);
    });
    return !blocked && !booked;
  });

  // Always filter past slots (e-task-1): even when minAdvanceHours=0, exclude slots that have already started
  const now = new Date();
  filtered = filtered.filter((slot) => new Date(slot.start) >= now);

  if (minAdvanceHours > 0) {
    const cutoff = new Date(now.getTime() + minAdvanceHours * 60 * 60 * 1000);
    filtered = filtered.filter((slot) => new Date(slot.start) >= cutoff);
  }

  await logAuditEvent({
    correlationId,
    action: 'get_available_slots',
    resourceType: 'availability',
    status: 'success',
    metadata: { doctorId, date, slotCount: filtered.length },
  });

  return filtered;
}

function getDayOfWeek(dateStr: string, timezone?: string): number {
  if (!timezone) {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.getUTCDay();
  }
  const d = new Date(dateStr + 'T12:00:00Z');
  const localDay = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(d);
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return dayMap[localDay] ?? d.getUTCDay();
}

function getDayBounds(dateStr: string, timezone?: string): { dayStart: Date; dayEnd: Date } {
  if (!timezone) {
    return {
      dayStart: new Date(dateStr + 'T00:00:00.000Z'),
      dayEnd: new Date(dateStr + 'T23:59:59.999Z'),
    };
  }
  const dayStart = localTimeToUtc(dateStr, 0, 0, timezone);
  const dayEnd = localTimeToUtc(dateStr, 23, 59, timezone);
  dayEnd.setSeconds(59, 999);
  return { dayStart, dayEnd };
}

/** Convert local time (dateStr HH:MM in timezone) to UTC Date (e-task-2). local = UTC + offset, so UTC = local - offset. */
function localTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const localAsUtc = new Date(dateStr + 'T' + pad(hour) + ':' + pad(minute) + ':00.000Z');
  const offsetMs = getTimezoneOffsetMs(dateStr, timezone);
  return new Date(localAsUtc.getTime() - offsetMs);
}

function getTimezoneOffsetMs(dateStr: string, timezone: string): number {
  const utcNoon = new Date(dateStr + 'T12:00:00.000Z');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const str = formatter.format(utcNoon);
  const match = str.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const h = parseInt(match[2] || '0', 10);
  const m = parseInt(match[3] || '0', 10);
  return sign * (h * 60 + m) * 60 * 1000;
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
  intervalMinutes: number,
  timezone?: string
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
      const start = timezone
        ? localTimeToUtc(dateStr, sh, sm, timezone).toISOString()
        : `${dateStr}T${pad(sh)}:${pad(sm)}:00.000Z`;
      const endDate = timezone
        ? localTimeToUtc(dateStr, eh, em, timezone)
        : new Date(`${dateStr}T${pad(eh)}:${pad(em)}:00.000Z`);
      const endIso = timezone ? endDate.toISOString() : `${dateStr}T${pad(eh)}:${pad(em)}:00.000Z`;
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

/**
 * Replace entire availability for a doctor (delete all, insert new).
 * Used by PUT /api/v1/availability.
 * Serialized per doctor to prevent concurrent delete+insert from causing 409 unique violation.
 *
 * @param doctorId - Doctor ID (must match userId)
 * @param slots - Array of { day_of_week, start_time, end_time }
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @returns Array of created availability records
 */
export async function replaceDoctorAvailability(
  doctorId: string,
  slots: Array<{ day_of_week: number; start_time: string; end_time: string }>,
  correlationId: string,
  userId: string
): Promise<Availability[]> {
  validateOwnership(doctorId, userId);

  const prev = doctorAvailabilityLocks.get(doctorId) ?? Promise.resolve();
  const work = prev
    .then(() => doReplaceDoctorAvailability(doctorId, slots, correlationId, userId))
    .finally(() => {
      if (doctorAvailabilityLocks.get(doctorId) === work) {
        doctorAvailabilityLocks.delete(doctorId);
      }
    });
  doctorAvailabilityLocks.set(doctorId, work);
  return work;
}

async function doReplaceDoctorAvailability(
  doctorId: string,
  slots: Array<{ day_of_week: number; start_time: string; end_time: string }>,
  correlationId: string,
  userId: string
): Promise<Availability[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error: deleteError } = await admin
    .from('availability')
    .delete()
    .eq('doctor_id', doctorId);

  if (deleteError) {
    handleSupabaseError(deleteError, correlationId);
  }

  if (slots.length === 0) {
    await logDataModification(correlationId, userId, 'update', 'availability', doctorId);
    return [];
  }

  const normalizeTime = (t: string): string => {
    const parts = t.split(':');
    const h = parts[0]?.padStart(2, '0') ?? '00';
    const m = (parts[1] ?? '00').padStart(2, '0');
    const s = (parts[2] ?? '00').padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const insertRows = slots.map((s) => ({
    doctor_id: doctorId,
    day_of_week: s.day_of_week,
    start_time: normalizeTime(s.start_time),
    end_time: normalizeTime(s.end_time),
    is_available: true,
  }));

  const { data: inserted, error: insertError } = await admin
    .from('availability')
    .insert(insertRows)
    .select();

  if (insertError) {
    handleSupabaseError(insertError, correlationId);
  }

  await logDataModification(correlationId, userId, 'update', 'availability', doctorId);

  return (inserted || []) as Availability[];
}

/**
 * Get blocked times for a doctor (API).
 * Optionally filter by start_date and end_date (YYYY-MM-DD).
 *
 * @param doctorId - Doctor ID (must match userId)
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @param filters - Optional { startDate, endDate } for date range
 * @returns Array of blocked times
 */
export async function getBlockedTimesForDoctor(
  doctorId: string,
  correlationId: string,
  userId: string,
  filters?: { startDate?: string; endDate?: string }
): Promise<BlockedTime[]> {
  validateOwnership(doctorId, userId);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  let query = admin
    .from('blocked_times')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('start_time', { ascending: true });

  if (filters?.startDate) {
    const dayStart = `${filters.startDate}T00:00:00.000Z`;
    query = query.gte('end_time', dayStart);
  }
  if (filters?.endDate) {
    const dayEnd = `${filters.endDate}T23:59:59.999Z`;
    query = query.lte('start_time', dayEnd);
  }

  const { data, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, userId, 'blocked_times', undefined);

  return (data || []) as BlockedTime[];
}

/**
 * Create blocked time for a doctor.
 *
 * @param doctorId - Doctor ID (must match userId)
 * @param data - { start_time, end_time, reason? } (ISO datetime strings)
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 * @returns Created blocked time
 */
export async function createBlockedTimeForDoctor(
  doctorId: string,
  data: { start_time: string; end_time: string; reason?: string },
  correlationId: string,
  userId: string
): Promise<BlockedTime> {
  validateOwnership(doctorId, userId);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const insertData = {
    doctor_id: doctorId,
    start_time: data.start_time,
    end_time: data.end_time,
    reason: data.reason ?? null,
  };

  const { data: created, error } = await admin
    .from('blocked_times')
    .insert(insertData)
    .select()
    .single();

  if (error || !created) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(correlationId, userId, 'create', 'blocked_times', created.id);

  return created as unknown as BlockedTime;
}

/**
 * Delete blocked time by ID.
 * Validates ownership (blocked time must belong to doctor).
 *
 * @param id - Blocked time ID
 * @param doctorId - Doctor ID (must match userId)
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID
 */
export async function deleteBlockedTimeForDoctor(
  id: string,
  doctorId: string,
  correlationId: string,
  userId: string
): Promise<void> {
  validateOwnership(doctorId, userId);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('blocked_times')
    .select('id, doctor_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  if (existing.doctor_id !== doctorId) {
    throw new NotFoundError('Blocked time not found');
  }

  const { error: deleteError } = await admin
    .from('blocked_times')
    .delete()
    .eq('id', id)
    .eq('doctor_id', doctorId);

  if (deleteError) {
    handleSupabaseError(deleteError, correlationId);
  }

  await logDataModification(correlationId, userId, 'delete', 'blocked_times', id);
}
