/**
 * learn-04: Stable-pattern detection, policy suggestions, opt-in autobook policy records.
 * Does not change matcher behavior (learn-05 consumes enabled policies).
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { sendEmail } from '../config/email';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { logAuditEvent } from '../utils/audit-logger';
import { getDoctorEmail } from './notification-service';

export type StablePatternCandidateRow = {
  doctor_id: string;
  pattern_key: string;
  proposed_catalog_service_key: string;
  final_catalog_service_key: string;
  resolution_count: number;
  window_start: string;
  window_end: string;
};

export type PolicySuggestionRow = {
  id: string;
  doctor_id: string;
  pattern_key: string;
  proposed_catalog_service_key: string;
  final_catalog_service_key: string;
  resolution_count: number;
  window_start_at: string;
  window_end_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'snoozed' | 'superseded';
  snoozed_until: string | null;
  notification_title: string;
  notification_body: string;
  created_at: string;
  updated_at: string;
};

export type AutobookPolicyRow = {
  id: string;
  doctor_id: string;
  pattern_key: string;
  proposed_catalog_service_key: string;
  final_catalog_service_key: string;
  enabled: boolean;
  enabled_at: string;
  enabled_by_user_id: string | null;
  scope: Record<string, unknown>;
  disabled_at: string | null;
  suggestion_id: string | null;
  created_at: string;
  updated_at: string;
};

export function buildPolicyNotificationCopy(params: {
  resolutionCount: number;
  windowDays: number;
  proposedCatalogServiceKey: string;
  finalCatalogServiceKey: string;
}): { title: string; body: string } {
  const title = 'Repeated visit-type reassignment detected';
  const body = [
    `Your practice reassigned from "${params.proposedCatalogServiceKey}" to "${params.finalCatalogServiceKey}"`,
    `${params.resolutionCount} time(s) in the last ${params.windowDays} day(s) for the same catalog signal pattern (structured keys only — no patient messages).`,
    'You can approve storing this as an opt-in policy for future automation (next: assist / autobook when product enables it).',
  ].join(' ');
  return { title, body };
}

async function hasActiveAutobookPolicy(params: {
  doctorId: string;
  patternKey: string;
  proposed: string;
  final: string;
  correlationId: string;
}): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  const { data, error } = await admin
    .from('service_match_autobook_policies')
    .select('id')
    .eq('doctor_id', params.doctorId)
    .eq('pattern_key', params.patternKey)
    .eq('proposed_catalog_service_key', params.proposed)
    .eq('final_catalog_service_key', params.final)
    .is('disabled_at', null)
    .eq('enabled', true)
    .maybeSingle();
  if (error) handleSupabaseError(error, params.correlationId);
  return Boolean(data?.id);
}

async function hasBlockingSuggestion(params: {
  doctorId: string;
  patternKey: string;
  proposed: string;
  final: string;
  correlationId: string;
}): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: pending, error: e1 } = await admin
    .from('service_match_learning_policy_suggestions')
    .select('id')
    .eq('doctor_id', params.doctorId)
    .eq('pattern_key', params.patternKey)
    .eq('proposed_catalog_service_key', params.proposed)
    .eq('final_catalog_service_key', params.final)
    .eq('status', 'pending')
    .maybeSingle();
  if (e1) handleSupabaseError(e1, params.correlationId);
  if (pending?.id) return true;

  const now = new Date().toISOString();
  const { data: snoozed, error: e2 } = await admin
    .from('service_match_learning_policy_suggestions')
    .select('id')
    .eq('doctor_id', params.doctorId)
    .eq('pattern_key', params.patternKey)
    .eq('proposed_catalog_service_key', params.proposed)
    .eq('final_catalog_service_key', params.final)
    .eq('status', 'snoozed')
    .gt('snoozed_until', now)
    .maybeSingle();
  if (e2) handleSupabaseError(e2, params.correlationId);
  return Boolean(snoozed?.id);
}

/**
 * Cron / internal: find stable reassignment patterns and insert pending suggestions.
 */
export async function runStablePatternDetectionJob(correlationId: string): Promise<{
  candidates: number;
  inserted: number;
  skipped: number;
}> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const minN = env.LEARNING_POLICY_MIN_RESOLUTIONS;
  const windowDays = env.LEARNING_POLICY_WINDOW_DAYS;

  const { data, error } = await admin.rpc('stable_reassignment_pattern_candidates', {
    p_min_count: minN,
    p_window_days: windowDays,
  });

  if (error) handleSupabaseError(error, correlationId);

  const rows = (data ?? []) as StablePatternCandidateRow[];
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const pk = row.pattern_key?.trim();
    const prop = row.proposed_catalog_service_key?.trim().toLowerCase();
    const fin = row.final_catalog_service_key?.trim().toLowerCase();
    if (!pk || !prop || !fin) {
      skipped += 1;
      continue;
    }

    if (await hasActiveAutobookPolicy({ doctorId: row.doctor_id, patternKey: pk, proposed: prop, final: fin, correlationId })) {
      skipped += 1;
      continue;
    }
    if (await hasBlockingSuggestion({ doctorId: row.doctor_id, patternKey: pk, proposed: prop, final: fin, correlationId })) {
      skipped += 1;
      continue;
    }

    const { title, body } = buildPolicyNotificationCopy({
      resolutionCount: Number(row.resolution_count),
      windowDays,
      proposedCatalogServiceKey: prop,
      finalCatalogServiceKey: fin,
    });

    const { error: insErr } = await admin.from('service_match_learning_policy_suggestions').insert({
      doctor_id: row.doctor_id,
      pattern_key: pk,
      proposed_catalog_service_key: prop,
      final_catalog_service_key: fin,
      resolution_count: Number(row.resolution_count),
      window_start_at: row.window_start,
      window_end_at: row.window_end,
      status: 'pending',
      notification_title: title,
      notification_body: body,
    });

    if (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === '23505') {
        skipped += 1;
        continue;
      }
      handleSupabaseError(insErr, correlationId);
    }

    inserted += 1;

    if (env.LEARNING_POLICY_SUGGESTION_EMAIL_ENABLED) {
      const email = await getDoctorEmail(row.doctor_id, correlationId);
      if (email) {
        await sendEmail(email, title, body, correlationId);
      }
    }
  }

  logger.info(
    { correlationId, candidates: rows.length, inserted, skipped },
    'learning_policy_detection_job_complete'
  );

  return { candidates: rows.length, inserted, skipped };
}

export async function listPolicySuggestionsForDoctor(params: {
  doctorId: string;
  correlationId: string;
  status?: 'pending' | 'declined' | 'accepted' | 'snoozed' | 'superseded' | 'all';
}): Promise<PolicySuggestionRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let q = admin
    .from('service_match_learning_policy_suggestions')
    .select('*')
    .eq('doctor_id', params.doctorId)
    .order('created_at', { ascending: false });

  if (params.status && params.status !== 'all') {
    q = q.eq('status', params.status);
  }

  const { data, error } = await q;
  if (error) handleSupabaseError(error, params.correlationId);
  return (data ?? []) as PolicySuggestionRow[];
}

export async function listAutobookPoliciesForDoctor(params: {
  doctorId: string;
  correlationId: string;
  activeOnly?: boolean;
}): Promise<AutobookPolicyRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let q = admin
    .from('service_match_autobook_policies')
    .select('*')
    .eq('doctor_id', params.doctorId)
    .order('enabled_at', { ascending: false });

  if (params.activeOnly !== false) {
    q = q.is('disabled_at', null).eq('enabled', true);
  }

  const { data, error } = await q;
  if (error) handleSupabaseError(error, params.correlationId);
  return (data ?? []) as AutobookPolicyRow[];
}

async function getSuggestionForDoctorOr404(
  suggestionId: string,
  doctorId: string,
  correlationId: string
): Promise<PolicySuggestionRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('service_match_learning_policy_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Policy suggestion not found');
  return data as PolicySuggestionRow;
}

export async function acceptPolicySuggestion(params: {
  suggestionId: string;
  doctorId: string;
  actorUserId: string;
  correlationId: string;
}): Promise<{ suggestion: PolicySuggestionRow; policy: AutobookPolicyRow }> {
  const row = await getSuggestionForDoctorOr404(params.suggestionId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Suggestion is not pending');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const scope = {
    pattern_key: row.pattern_key,
    proposed_catalog_service_key: row.proposed_catalog_service_key,
    final_catalog_service_key: row.final_catalog_service_key,
  };

  const { data: policy, error: pErr } = await admin
    .from('service_match_autobook_policies')
    .insert({
      doctor_id: params.doctorId,
      pattern_key: row.pattern_key,
      proposed_catalog_service_key: row.proposed_catalog_service_key,
      final_catalog_service_key: row.final_catalog_service_key,
      enabled: true,
      enabled_by_user_id: params.actorUserId,
      scope,
      suggestion_id: row.id,
    })
    .select('*')
    .single();

  if (pErr) {
    const code = (pErr as { code?: string }).code;
    if (code === '23505') {
      throw new ConflictError('An active policy already exists for this pattern');
    }
    handleSupabaseError(pErr, params.correlationId);
  }

  if (!policy) {
    throw new InternalError('Autobook policy insert returned no row');
  }

  const policyId = (policy as { id: string }).id;

  const { data: updated, error: uErr } = await admin
    .from('service_match_learning_policy_suggestions')
    .update({ status: 'accepted' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (uErr) {
    await admin.from('service_match_autobook_policies').delete().eq('id', policyId);
    handleSupabaseError(uErr, params.correlationId);
  }
  if (!updated) {
    await admin.from('service_match_autobook_policies').delete().eq('id', policyId);
    throw new ConflictError('Could not update suggestion');
  }

  await logAuditEvent({
    correlationId: params.correlationId,
    userId: params.actorUserId,
    action: 'learning_policy_suggestion_accepted',
    resourceType: 'service_match_learning_policy_suggestion',
    resourceId: row.id,
    status: 'success',
    metadata: {
      policy_id: policyId,
      pattern_key: row.pattern_key,
    },
  });

  return { suggestion: updated as PolicySuggestionRow, policy: policy as AutobookPolicyRow };
}

export async function declinePolicySuggestion(params: {
  suggestionId: string;
  doctorId: string;
  actorUserId: string;
  correlationId: string;
}): Promise<PolicySuggestionRow> {
  const row = await getSuggestionForDoctorOr404(params.suggestionId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Suggestion is not pending');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: updated, error } = await admin
    .from('service_match_learning_policy_suggestions')
    .update({ status: 'declined' })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Could not update suggestion');

  await logAuditEvent({
    correlationId: params.correlationId,
    userId: params.actorUserId,
    action: 'learning_policy_suggestion_declined',
    resourceType: 'service_match_learning_policy_suggestion',
    resourceId: row.id,
    status: 'success',
    metadata: { pattern_key: row.pattern_key },
  });

  return updated as PolicySuggestionRow;
}

export async function snoozePolicySuggestion(params: {
  suggestionId: string;
  doctorId: string;
  actorUserId: string;
  correlationId: string;
  snoozeDays?: number;
}): Promise<PolicySuggestionRow> {
  const row = await getSuggestionForDoctorOr404(params.suggestionId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Suggestion is not pending');
  }

  const days = params.snoozeDays ?? env.LEARNING_POLICY_SNOOZE_DAYS;
  if (days < 1 || days > 365) {
    throw new ValidationError('snoozeDays must be between 1 and 365');
  }

  const until = new Date(Date.now() + days * 86400000).toISOString();

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: updated, error } = await admin
    .from('service_match_learning_policy_suggestions')
    .update({ status: 'snoozed', snoozed_until: until })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Could not update suggestion');

  await logAuditEvent({
    correlationId: params.correlationId,
    userId: params.actorUserId,
    action: 'learning_policy_suggestion_snoozed',
    resourceType: 'service_match_learning_policy_suggestion',
    resourceId: row.id,
    status: 'success',
    metadata: { pattern_key: row.pattern_key, snoozed_until: until, snooze_days: days },
  });

  return updated as PolicySuggestionRow;
}

export async function disableAutobookPolicy(params: {
  policyId: string;
  doctorId: string;
  actorUserId: string;
  correlationId: string;
}): Promise<AutobookPolicyRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: row, error: selErr } = await admin
    .from('service_match_autobook_policies')
    .select('*')
    .eq('id', params.policyId)
    .eq('doctor_id', params.doctorId)
    .maybeSingle();

  if (selErr) handleSupabaseError(selErr, params.correlationId);
  if (!row) throw new NotFoundError('Autobook policy not found');

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('service_match_autobook_policies')
    .update({
      enabled: false,
      disabled_at: now,
    })
    .eq('id', params.policyId)
    .eq('doctor_id', params.doctorId)
    .is('disabled_at', null)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Policy already disabled or not found');

  await logAuditEvent({
    correlationId: params.correlationId,
    userId: params.actorUserId,
    action: 'learning_autobook_policy_disabled',
    resourceType: 'service_match_autobook_policy',
    resourceId: params.policyId,
    status: 'success',
    metadata: { pattern_key: (row as { pattern_key?: string }).pattern_key },
  });

  return updated as AutobookPolicyRow;
}
