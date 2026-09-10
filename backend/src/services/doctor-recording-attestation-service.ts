/**
 * Doctor recording attestation (recording-governance-v2 · rec-11).
 *
 * Read: has this doctor accepted the currently-active policy version?
 * Write: append-only insert for (doctor_id, active version). Re-accept of
 * the same version is idempotent and never rewrites `accepted_at`
 * (REC2-D2 — no ON CONFLICT DO UPDATE).
 *
 * Version comes from `RECORDING_ATTESTATION_POLICY_VERSION`, never from
 * the client. Service-role only (REC2-D4).
 *
 * @see backend/migrations/210_doctor_recording_attestation.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  RECORDING_ATTESTATION_CLAUSES,
  RECORDING_ATTESTATION_POLICY_VERSION,
} from '../constants/recording-attestation';
import type { DoctorRecordingAttestationRow } from '../types/doctor-recording-attestation';
import {
  DoctorRecordingAttestationRequiredError,
  InternalError,
} from '../utils/errors';

const PG_UNIQUE_VIOLATION = '23505';

function requireAdmin(): SupabaseClient {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

function mapRow(row: DoctorRecordingAttestationRow): {
  accepted: true;
  policyVersion: string;
  acceptedAt: string;
} {
  return {
    accepted: true,
    policyVersion: row.policy_version,
    acceptedAt: row.accepted_at,
  };
}

export function getActiveRecordingAttestationVersion(): string {
  return RECORDING_ATTESTATION_POLICY_VERSION;
}

export function getRecordingAttestationClauses(): readonly string[] {
  return RECORDING_ATTESTATION_CLAUSES;
}

export async function getDoctorRecordingAttestationStatus(doctorId: string): Promise<{
  accepted: boolean;
  policyVersion: string;
  acceptedAt: string | null;
  clauses: readonly string[];
}> {
  const admin = requireAdmin();
  const policyVersion = RECORDING_ATTESTATION_POLICY_VERSION;
  const { data, error } = await admin
    .from('doctor_recording_attestation')
    .select('id, doctor_id, policy_version, accepted_at, created_at, updated_at')
    .eq('doctor_id', doctorId)
    .eq('policy_version', policyVersion)
    .maybeSingle();

  if (error) {
    logger.error(
      { doctorId, error: error.message },
      'doctor_recording_attestation_status_lookup_failed'
    );
    throw new InternalError('Could not load recording attestation status');
  }

  if (!data) {
    return {
      accepted: false,
      policyVersion,
      acceptedAt: null,
      clauses: RECORDING_ATTESTATION_CLAUSES,
    };
  }

  const mapped = mapRow(data as DoctorRecordingAttestationRow);
  return {
    ...mapped,
    clauses: RECORDING_ATTESTATION_CLAUSES,
  };
}

export async function acceptDoctorRecordingAttestation(doctorId: string): Promise<{
  accepted: true;
  policyVersion: string;
  acceptedAt: string;
  clauses: readonly string[];
}> {
  const admin = requireAdmin();
  const policyVersion = RECORDING_ATTESTATION_POLICY_VERSION;

  const { data, error } = await admin
    .from('doctor_recording_attestation')
    .insert({
      doctor_id: doctorId,
      policy_version: policyVersion,
    })
    .select('id, doctor_id, policy_version, accepted_at, created_at, updated_at')
    .maybeSingle();

  if (error && error.code === PG_UNIQUE_VIOLATION) {
    const existing = await getDoctorRecordingAttestationStatus(doctorId);
    if (!existing.accepted || !existing.acceptedAt) {
      throw new InternalError('Recording attestation row missing after conflict');
    }
    return {
      accepted: true,
      policyVersion: existing.policyVersion,
      acceptedAt: existing.acceptedAt,
      clauses: RECORDING_ATTESTATION_CLAUSES,
    };
  }

  if (error || !data) {
    logger.error(
      { doctorId, error: error?.message },
      'doctor_recording_attestation_accept_failed'
    );
    throw new InternalError('Could not record recording attestation');
  }

  const mapped = mapRow(data as DoctorRecordingAttestationRow);
  return {
    ...mapped,
    clauses: RECORDING_ATTESTATION_CLAUSES,
  };
}

/** Gate for consult start (voice + video). Call on every start. */
export async function assertDoctorRecordingAttestation(doctorId: string): Promise<void> {
  const status = await getDoctorRecordingAttestationStatus(doctorId);
  if (!status.accepted) {
    throw new DoctorRecordingAttestationRequiredError();
  }
}
