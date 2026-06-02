/**
 * OPD session overrun bulk-resolve orchestrator (pdm-09 · DL-7).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../config/logger';
import { getDoctorSettings } from '../doctor-settings-service';
import { acquireSessionDayAdvisoryLock } from './opd-mode-conversion-service';
import { localDayUtcRange } from './opd-queue-service';
import {
  rescheduleAppointmentToNextAvailable,
  rescheduleAppointmentToSpecificSlot,
} from '../reschedule-service';
import { refundAppointment } from '../refund-service';

export type OverrunAction =
  | 'reschedule_all'
  | 'reschedule_per_patient'
  | 'mark_completed'
  | 'cancel_refund'
  | 'mark_no_show';

export interface PerRowOverride {
  appointmentId: string;
  action: OverrunAction;
  rescheduleTo?: string;
}

export interface BulkResolveSessionOverrunOptions {
  triggeredBy: 'doctor' | 'system_overrun_fallback';
  correlationId?: string;
}

export interface PerRowResult {
  appointmentId: string;
  action: OverrunAction;
  status: 'success' | 'skipped' | 'error';
  message?: string;
}

export interface BulkResolveSessionOverrunResult {
  resolved: number;
  results: PerRowResult[];
}

type OverrunAppointmentRow = {
  id: string;
  status: string;
  patient_id: string | null;
  consultation_type: string | null;
  catalog_service_id: string | null;
  appointment_date: string;
};

function recordOverrunTelemetry(
  event: string,
  payload: Record<string, unknown>
): void {
  logger.info({ event, ...payload }, event);
}

export async function bulkResolveSessionOverrun(
  supabase: SupabaseClient,
  doctorId: string,
  date: string,
  action: OverrunAction,
  perRowOverrides: PerRowOverride[] | undefined,
  options: BulkResolveSessionOverrunOptions
): Promise<BulkResolveSessionOverrunResult> {
  return acquireSessionDayAdvisoryLock(supabase, doctorId, date, async () => {
    const settings = await getDoctorSettings(doctorId);
    const timezone = settings?.timezone ?? 'Asia/Kolkata';
    const { start, end } = localDayUtcRange(date, timezone);

    const { data: rows, error } = await supabase
      .from('appointments')
      .select('id, status, patient_id, consultation_type, catalog_service_id, appointment_date')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', start)
      .lt('appointment_date', end)
      .in('status', ['pending', 'confirmed'])
      .not('session_overrun_at', 'is', null);

    if (error) {
      throw new Error(`bulkResolveSessionOverrun: fetch failed: ${error.message}`);
    }

    const overrunRows = (rows ?? []) as OverrunAppointmentRow[];
    const result: BulkResolveSessionOverrunResult = { resolved: 0, results: [] };
    const overrideMap = new Map<string, PerRowOverride>(
      (perRowOverrides ?? []).map((o) => [o.appointmentId, o])
    );

    for (const row of overrunRows) {
      const override = overrideMap.get(row.id);
      const effectiveAction = override?.action ?? action;

      const rowResult = await applyOverrunAction(
        supabase,
        row,
        effectiveAction,
        override?.rescheduleTo,
        options
      );
      result.results.push(rowResult);
      if (rowResult.status === 'success') {
        result.resolved += 1;
      }
    }

    recordOverrunTelemetry('opd_overrun.bulk_resolved', {
      doctor_id: doctorId,
      date,
      action,
      resolved: result.resolved,
      total: overrunRows.length,
      triggered_by: options.triggeredBy,
      correlation_id: options.correlationId,
    });

    return result;
  });
}

async function applyOverrunAction(
  supabase: SupabaseClient,
  row: OverrunAppointmentRow,
  action: OverrunAction,
  rescheduleTo: string | undefined,
  options: BulkResolveSessionOverrunOptions
): Promise<PerRowResult> {
  const correlationId = options.correlationId;
  const noteSuffix = ` (${options.triggeredBy})`;

  try {
    switch (action) {
      case 'reschedule_all': {
        await rescheduleAppointmentToNextAvailable(supabase, row.id, {
          triggeredBy: options.triggeredBy,
          reason: 'session_overrun',
          correlationId,
        });
        return { appointmentId: row.id, action, status: 'success' };
      }
      case 'reschedule_per_patient': {
        if (!rescheduleTo) {
          return {
            appointmentId: row.id,
            action,
            status: 'skipped',
            message: 'rescheduleTo missing',
          };
        }
        await rescheduleAppointmentToSpecificSlot(supabase, row.id, rescheduleTo, {
          triggeredBy: options.triggeredBy,
          reason: 'session_overrun',
          correlationId,
        });
        return { appointmentId: row.id, action, status: 'success' };
      }
      case 'mark_completed': {
        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'completed',
            session_overrun_at: null,
            notes: `Marked completed by doctor after session overrun${noteSuffix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .in('status', ['pending', 'confirmed']);
        if (error) throw error;
        return { appointmentId: row.id, action, status: 'success' };
      }
      case 'cancel_refund': {
        await refundAppointment(supabase, row.id, {
          reason: 'session_overrun',
          correlationId,
        });
        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            session_overrun_at: null,
            notes: `Cancelled after session overrun${noteSuffix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .in('status', ['pending', 'confirmed']);
        if (error) throw error;
        return { appointmentId: row.id, action, status: 'success' };
      }
      case 'mark_no_show': {
        const { error } = await supabase
          .from('appointments')
          .update({
            status: 'no_show',
            session_overrun_at: null,
            notes: `Marked no-show after session overrun${noteSuffix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .in('status', ['pending', 'confirmed']);
        if (error) throw error;
        return { appointmentId: row.id, action, status: 'success' };
      }
      default: {
        const _exhaustive: never = action;
        return {
          appointmentId: row.id,
          action: _exhaustive,
          status: 'error',
          message: 'Unknown action',
        };
      }
    }
  } catch (err) {
    return {
      appointmentId: row.id,
      action,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Type guard for HTTP body validation. */
export function isOverrunAction(v: unknown): v is OverrunAction {
  return (
    typeof v === 'string' &&
    [
      'reschedule_all',
      'reschedule_per_patient',
      'mark_completed',
      'cancel_refund',
      'mark_no_show',
    ].includes(v)
  );
}

/**
 * List overrun rows for a doctor session day (tray API · pdm-10).
 */
export async function listSessionOverrunRows(
  supabase: SupabaseClient,
  doctorId: string,
  date: string
): Promise<{ date: string; count: number; rows: unknown[] }> {
  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const { start, end } = localDayUtcRange(date, timezone);

  const { data: rows, error } = await supabase
    .from('appointments')
    .select(
      `
      id,
      status,
      appointment_date,
      opd_event_type,
      consultation_type,
      patient_name,
      patient_phone,
      catalog_service_key,
      patient:patients(id, phone, date_of_birth)
    `
    )
    .eq('doctor_id', doctorId)
    .gte('appointment_date', start)
    .lt('appointment_date', end)
    .in('status', ['pending', 'confirmed'])
    .not('session_overrun_at', 'is', null)
    .order('appointment_date', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return { date, count: rows?.length ?? 0, rows: rows ?? [] };
}
