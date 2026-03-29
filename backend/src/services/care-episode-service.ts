/**
 * Care episode data access + lifecycle (SFU-02, SFU-04)
 *
 * On appointment **completed**: open index episode + price snapshot, or increment
 * follow-up counter (idempotent via `care_episode_completion_processed_at`).
 *
 * Interims: episode open trigger remains **completed** status only. Optional
 * “payment captured” hook + feature flag can be added later (PLAN §8.2).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment } from '../types/database';
import type { CareEpisodeRow } from '../types/care-episode';
import { getDoctorSettings } from './doctor-settings-service';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';
import { getSupabaseAdminClient } from '../config/database';
import { findServiceOfferingByKey, getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import type { ServiceOfferingV1 } from '../utils/service-catalog-schema';
import { resolveEpisodeFollowUpEligibilitySource } from '../utils/service-catalog-schema';

const SELECT_COLUMNS =
  'id, doctor_id, patient_id, catalog_service_key, catalog_service_id, status, started_at, eligibility_ends_at, ' +
  'followups_used, max_followups, price_snapshot_json, index_appointment_id, created_at, updated_at';

const SNAPSHOT_MODALITIES = ['text', 'voice', 'video'] as const;

/**
 * Pure planner: how to mutate episode state when a visit completes.
 * Exported for unit tests.
 */
export type CareEpisodeCompletionPlan =
  | { kind: 'create_index' }
  | { kind: 'increment'; episodeId: string }
  | { kind: 'noop' };

export function planCareEpisodeOnCompletedVisit(input: {
  appointmentId: string;
  appointmentEpisodeId: string | null | undefined;
  activeEpisode: CareEpisodeRow | null;
}): CareEpisodeCompletionPlan {
  const { appointmentId, appointmentEpisodeId, activeEpisode } = input;
  if (appointmentEpisodeId) {
    return { kind: 'increment', episodeId: appointmentEpisodeId };
  }
  if (!activeEpisode) {
    return { kind: 'create_index' };
  }
  if (activeEpisode.index_appointment_id === appointmentId) {
    return { kind: 'noop' };
  }
  return { kind: 'increment', episodeId: activeEpisode.id };
}

/** Locked JSON for `care_episodes.price_snapshot_json` (SFU-03 / SFU-12). */
export function buildEpisodePriceSnapshotJson(offering: ServiceOfferingV1): Record<string, unknown> {
  const modalities: Record<string, unknown> = {};
  for (const m of SNAPSHOT_MODALITIES) {
    const slot = offering.modalities[m];
    if (slot?.enabled === true) {
      const cell: Record<string, unknown> = { price_minor: slot.price_minor };
      if (slot.followup_policy !== undefined) {
        cell.followup_policy = slot.followup_policy
          ? (JSON.parse(JSON.stringify(slot.followup_policy)) as unknown)
          : null;
      }
      modalities[m] = cell;
    }
  }
  const out: Record<string, unknown> = {
    version: 2,
    modalities,
  };
  const rootPolicy = offering.followup_policy;
  if (rootPolicy) {
    out.followup_policy = JSON.parse(JSON.stringify(rootPolicy)) as unknown;
  }
  return out;
}

function eligibilityEndsAtIso(
  completion: Date,
  policy: ReturnType<typeof resolveEpisodeFollowUpEligibilitySource>
): string | null {
  if (!policy?.enabled || !policy.eligibility_window_days) {
    return null;
  }
  const d = new Date(completion.getTime());
  d.setUTCDate(d.getUTCDate() + policy.eligibility_window_days);
  return d.toISOString();
}

/**
 * Fetch a care episode by primary key. Returns null if missing or DB unavailable.
 */
export async function getCareEpisodeById(episodeId: string): Promise<CareEpisodeRow | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('care_episodes')
    .select(SELECT_COLUMNS)
    .eq('id', episodeId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as unknown as CareEpisodeRow;
}

/**
 * Active episode for doctor + patient + catalog service key (at most one expected).
 */
export async function getActiveEpisodeForPatientDoctorService(
  doctorId: string,
  patientId: string,
  catalogServiceKey: string,
  catalogServiceId?: string | null
): Promise<CareEpisodeRow | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const idTrim = catalogServiceId?.trim();
  if (idTrim) {
    const byId = await admin
      .from('care_episodes')
      .select(SELECT_COLUMNS)
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .eq('catalog_service_id', idTrim)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!byId.error && byId.data) {
      return byId.data as unknown as CareEpisodeRow;
    }
  }

  const key = catalogServiceKey.trim().toLowerCase();
  const { data, error } = await admin
    .from('care_episodes')
    .select(SELECT_COLUMNS)
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .eq('catalog_service_key', key)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as unknown as CareEpisodeRow;
}

function episodeMatchesAppointment(ep: CareEpisodeRow, apt: Appointment, serviceKeyNorm: string): boolean {
  if (
    ep.doctor_id !== apt.doctor_id ||
    ep.patient_id !== apt.patient_id ||
    ep.status !== 'active'
  ) {
    return false;
  }
  const aid = apt.catalog_service_id?.trim();
  const eid = ep.catalog_service_id?.trim();
  if (aid && eid && aid === eid) {
    return true;
  }
  return ep.catalog_service_key === serviceKeyNorm;
}

async function fetchEpisodeRow(admin: SupabaseClient, episodeId: string): Promise<CareEpisodeRow | null> {
  const { data, error } = await admin
    .from('care_episodes')
    .select(SELECT_COLUMNS)
    .eq('id', episodeId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as unknown as CareEpisodeRow;
}

async function fetchActiveEpisodeForTriplet(
  admin: SupabaseClient,
  doctorId: string,
  patientId: string,
  catalogServiceKey: string,
  catalogServiceId?: string | null
): Promise<CareEpisodeRow | null> {
  const idTrim = catalogServiceId?.trim();
  if (idTrim) {
    const byId = await admin
      .from('care_episodes')
      .select(SELECT_COLUMNS)
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .eq('catalog_service_id', idTrim)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!byId.error && byId.data) {
      return byId.data as unknown as CareEpisodeRow;
    }
  }

  const key = catalogServiceKey.trim().toLowerCase();
  const { data, error } = await admin
    .from('care_episodes')
    .select(SELECT_COLUMNS)
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .eq('catalog_service_key', key)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as unknown as CareEpisodeRow;
}

/**
 * @returns true if completion claim should stay set; false if caller should clear
 * `care_episode_completion_processed_at` (skipped work — safe to retry later).
 */
async function executeEpisodePlan(
  admin: SupabaseClient,
  plan: CareEpisodeCompletionPlan,
  appointment: Appointment,
  serviceKeyNorm: string,
  correlationId: string
): Promise<boolean> {
  const completion = new Date();
  const aptId = appointment.id;

  if (plan.kind === 'noop') {
    logger.info(
      {
        correlationId,
        event: 'care_episode_transition',
        action: 'noop_index_already_linked',
        appointment_id: aptId,
      },
      'care_episode_transition'
    );
    return true;
  }

  if (plan.kind === 'create_index') {
    const settings = await getDoctorSettings(appointment.doctor_id);
    const catalog = getActiveServiceCatalog(settings);
    if (!catalog) {
      logger.warn(
        { correlationId, appointment_id: aptId, reason: 'no_catalog' },
        'care_episode_index_skipped'
      );
      return false;
    }

    const offering = findServiceOfferingByKey(catalog, serviceKeyNorm);
    if (!offering) {
      logger.warn(
        { correlationId, appointment_id: aptId, service_key: serviceKeyNorm, reason: 'service_not_in_catalog' },
        'care_episode_index_skipped'
      );
      return false;
    }

    const price_snapshot_json = buildEpisodePriceSnapshotJson(offering);
    const policy = resolveEpisodeFollowUpEligibilitySource(offering);
    const max_followups = policy?.enabled === true ? policy.max_followups : 0;
    const eligibility_ends_at = eligibilityEndsAtIso(completion, policy);

    const insertRow = {
      doctor_id: appointment.doctor_id,
      patient_id: appointment.patient_id!,
      catalog_service_key: serviceKeyNorm,
      catalog_service_id: offering.service_id,
      status: 'active' as const,
      started_at: completion.toISOString(),
      eligibility_ends_at,
      followups_used: 0,
      max_followups,
      price_snapshot_json,
      index_appointment_id: aptId,
    };

    const { data: created, error: insErr } = await admin
      .from('care_episodes')
      .insert(insertRow)
      .select('id')
      .single();

    if (insErr || !created?.id) {
      throw new InternalError(insErr?.message || 'Failed to create care_episode');
    }

    const episodeId = created.id as string;

    const { error: aptErr } = await admin
      .from('appointments')
      .update({ episode_id: episodeId })
      .eq('id', aptId);

    if (aptErr) {
      throw new InternalError(aptErr.message || 'Failed to link appointment to care_episode');
    }

    logger.info(
      {
        correlationId,
        event: 'care_episode_transition',
        action: 'index_open',
        appointment_id: aptId,
        episode_id: episodeId,
      },
      'care_episode_transition'
    );
    return true;
  }

  // increment
  const episode = await fetchEpisodeRow(admin, plan.episodeId);
  if (!episode || !episodeMatchesAppointment(episode, appointment, serviceKeyNorm)) {
    logger.warn(
      {
        correlationId,
        appointment_id: aptId,
        episode_id: plan.episodeId,
        reason: 'episode_missing_or_mismatch',
      },
      'care_episode_increment_skipped'
    );
    return false;
  }

  const nextUsed = episode.followups_used + 1;
  const exhausted = nextUsed >= episode.max_followups;
  const nextStatus = exhausted ? 'exhausted' : episode.status;

  const { error: epErr } = await admin
    .from('care_episodes')
    .update({
      followups_used: nextUsed,
      status: nextStatus,
    })
    .eq('id', episode.id);

  if (epErr) {
    throw new InternalError(epErr.message || 'Failed to update care_episode followups');
  }

  if (!appointment.episode_id) {
    await admin.from('appointments').update({ episode_id: episode.id }).eq('id', aptId);
  }

  logger.info(
    {
      correlationId,
      event: 'care_episode_transition',
      action: 'followup_increment',
      appointment_id: aptId,
      episode_id: episode.id,
      followups_used: nextUsed,
      episode_status: nextStatus,
    },
    'care_episode_transition'
  );
  return true;
}

/**
 * SFU-04: run after appointment row is saved with `status = completed` and was not completed before.
 * Uses atomic claim on `care_episode_completion_processed_at` for idempotency.
 */
export async function syncCareEpisodeLifecycleOnAppointmentCompleted(
  admin: SupabaseClient,
  appointment: Appointment,
  previousStatus: string,
  correlationId: string
): Promise<void> {
  if (previousStatus === 'completed' || appointment.status !== 'completed') {
    return;
  }

  const patientId = appointment.patient_id;
  const rawKey = appointment.catalog_service_key;
  const rawId = appointment.catalog_service_id;
  if (!patientId || !rawKey?.trim()) {
    return;
  }

  const serviceKeyNorm = rawKey.trim().toLowerCase();
  const serviceIdTrim = rawId?.trim() ?? null;
  const nowIso = new Date().toISOString();

  const { data: claimed, error: claimErr } = await admin
    .from('appointments')
    .update({ care_episode_completion_processed_at: nowIso })
    .eq('id', appointment.id)
    .eq('status', 'completed')
    .is('care_episode_completion_processed_at', null)
    .select('id')
    .maybeSingle();

  if (claimErr) {
    logger.warn(
      { correlationId, appointment_id: appointment.id, claimErr: claimErr.message },
      'care_episode_claim_failed'
    );
    return;
  }

  if (!claimed) {
    return;
  }

  try {
    const active = await fetchActiveEpisodeForTriplet(
      admin,
      appointment.doctor_id,
      patientId,
      serviceKeyNorm,
      serviceIdTrim
    );

    const plan = planCareEpisodeOnCompletedVisit({
      appointmentId: appointment.id,
      appointmentEpisodeId: appointment.episode_id,
      activeEpisode: active,
    });

    const retainClaim = await executeEpisodePlan(admin, plan, appointment, serviceKeyNorm, correlationId);
    if (!retainClaim) {
      await admin
        .from('appointments')
        .update({ care_episode_completion_processed_at: null })
        .eq('id', appointment.id);
    }
  } catch (err) {
    await admin
      .from('appointments')
      .update({ care_episode_completion_processed_at: null })
      .eq('id', appointment.id);

    logger.error(
      {
        correlationId,
        appointment_id: appointment.id,
        err: err instanceof Error ? err.message : String(err),
      },
      'care_episode_transition_failed'
    );
  }
}

