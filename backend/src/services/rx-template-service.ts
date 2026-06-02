/**
 * Doctor Rx Template Service (EHR Sub-batch B1 / T2.11).
 *
 * CRUD over `doctor_rx_templates` plus the atomic
 * `record_doctor_rx_template_use` increment. Per Decision T2-D2 every
 * template is strictly per-doctor; the table has owner-only RLS but
 * we ALSO enforce ownership in code so the admin-client call path
 * (which bypasses RLS) can never accidentally serve another doctor's
 * rows.
 *
 * Storage notes:
 *   - `medicines_json` is a JSONB array. We stringify the camelCase
 *     `RxTemplateMedicine` shape directly — no key remapping. The
 *     <TemplatePicker> Apply path on the FE spreads each entry into the
 *     `<PrescriptionForm>` medicine state without remapping either.
 *   - Free-text Rx fields (cc/hopi/etc.) live as their own columns,
 *     mirroring the prescription row shape. PATCH semantics: only the
 *     keys present in the payload are touched (legacy fields stay
 *     intact); `medicines` is treated atomically (full replacement).
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { ForbiddenError, InternalError, NotFoundError } from '../utils/errors';
import {
  CreateRxTemplateInput,
  DoctorRxTemplate,
  RxTemplateMedicine,
  UpdateRxTemplateInput,
} from '../types/rx-template';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Defensive sanitiser: strip unexpected keys + coerce sortOrder to a
 * non-negative int. Trusts the validator at the API boundary already
 * pruned bad shapes; this is a belt-and-braces pass before INSERT.
 */
function normalizeMedicines(input: RxTemplateMedicine[] | undefined): RxTemplateMedicine[] {
  if (!Array.isArray(input)) return [];
  return input.map((m, i) => ({
    drugMasterId: m.drugMasterId ?? null,
    medicineName: typeof m.medicineName === 'string' ? m.medicineName : '',
    dosage: m.dosage ?? null,
    route: m.route ?? null,
    frequency: m.frequency ?? null,
    duration: m.duration ?? null,
    instructions: m.instructions ?? null,
    sortOrder:
      typeof m.sortOrder === 'number' && Number.isFinite(m.sortOrder) && m.sortOrder >= 0
        ? Math.floor(m.sortOrder)
        : i,
    frequencyCode: m.frequencyCode ?? null,
    durationValue: m.durationValue ?? null,
    durationUnit: m.durationUnit ?? null,
    routeCode: m.routeCode ?? null,
  }));
}

// ============================================================================
// List
// ============================================================================

/**
 * List active (non-archived) templates for the calling doctor, sorted
 * by `last_used_at DESC NULLS LAST, name ASC` — most-recently-used
 * surface to the top. Backed by the partial index from migration 091.
 */
export async function listRxTemplates(
  correlationId: string,
  userId: string,
): Promise<DoctorRxTemplate[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('doctor_rx_templates')
    .select('*')
    .eq('doctor_id', userId)
    .is('archived_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);

  await logDataAccess(correlationId, userId, 'rx_template', undefined);

  return (data ?? []) as DoctorRxTemplate[];
}

// ============================================================================
// Create
// ============================================================================

export async function createRxTemplate(
  input: CreateRxTemplateInput,
  correlationId: string,
  userId: string,
): Promise<DoctorRxTemplate> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const row = {
    doctor_id: userId,
    name: input.name.trim(),
    description: input.description ?? null,
    cc: input.cc ?? null,
    hopi: input.hopi ?? null,
    provisional_diagnosis: input.provisionalDiagnosis ?? null,
    investigations: input.investigations ?? null,
    follow_up: input.followUp ?? null,
    patient_education: input.patientEducation ?? null,
    clinical_notes: input.clinicalNotes ?? null,
    medicines_json: normalizeMedicines(input.medicines),
  };

  const { data, error } = await admin
    .from('doctor_rx_templates')
    .insert(row)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new InternalError('Template insert returned no row');

  await logDataModification(correlationId, userId, 'create', 'rx_template', (data as DoctorRxTemplate).id);

  return data as DoctorRxTemplate;
}

// ============================================================================
// Update
// ============================================================================

/**
 * PATCH a template. Only keys present in `input` are touched; missing
 * keys leave the existing column intact. `medicines` (when present) is
 * a wholesale replacement — same semantics as the prescription PATCH.
 */
export async function updateRxTemplate(
  id: string,
  input: UpdateRxTemplateInput,
  correlationId: string,
  userId: string,
): Promise<DoctorRxTemplate> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // Ownership check up front (admin client bypasses RLS).
  const { data: existing, error: existsError } = await admin
    .from('doctor_rx_templates')
    .select('id, doctor_id, archived_at')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Template not found');
  if ((existing as { doctor_id: string }).doctor_id !== userId) {
    throw new ForbiddenError('Template not found');
  }

  // Build the patch column-by-column so we never accidentally null
  // out a column the caller didn't touch.
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.cc !== undefined) patch.cc = input.cc;
  if (input.hopi !== undefined) patch.hopi = input.hopi;
  if (input.provisionalDiagnosis !== undefined) patch.provisional_diagnosis = input.provisionalDiagnosis;
  if (input.investigations !== undefined) patch.investigations = input.investigations;
  if (input.followUp !== undefined) patch.follow_up = input.followUp;
  if (input.patientEducation !== undefined) patch.patient_education = input.patientEducation;
  if (input.clinicalNotes !== undefined) patch.clinical_notes = input.clinicalNotes;
  if (input.medicines !== undefined) patch.medicines_json = normalizeMedicines(input.medicines);

  if (Object.keys(patch).length === 0) {
    // Nothing to change; return the existing row to keep the surface
    // idempotent (the validator catches the empty-payload case earlier
    // but defending here is cheap).
    const { data, error } = await admin
      .from('doctor_rx_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) handleSupabaseError(error, correlationId);
    return data as DoctorRxTemplate;
  }

  const { data, error } = await admin
    .from('doctor_rx_templates')
    .update(patch)
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new InternalError('Template update returned no row');

  await logDataModification(correlationId, userId, 'update', 'rx_template', id);

  return data as DoctorRxTemplate;
}

// ============================================================================
// Archive (soft-delete)
// ============================================================================

/**
 * Soft-delete: set `archived_at = now()`. The list endpoint filters
 * archived rows, but deep-link gets and the audit trail still see them
 * for "what did I prescribe last week" recall.
 */
export async function archiveRxTemplate(
  id: string,
  correlationId: string,
  userId: string,
): Promise<DoctorRxTemplate> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: existing, error: existsError } = await admin
    .from('doctor_rx_templates')
    .select('id, doctor_id')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Template not found');
  if ((existing as { doctor_id: string }).doctor_id !== userId) {
    throw new ForbiddenError('Template not found');
  }

  const { data, error } = await admin
    .from('doctor_rx_templates')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('doctor_id', userId)
    .select('*')
    .single();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new InternalError('Template archive returned no row');

  // Soft-delete is logged as 'delete' to match the audit-logger's
  // closed action vocabulary; the archived_at column makes the soft
  // nature visible in the row itself.
  await logDataModification(correlationId, userId, 'delete', 'rx_template', id);

  return data as DoctorRxTemplate;
}

// ============================================================================
// Record use (atomic counter bump)
// ============================================================================

/**
 * Bump `use_count` + set `last_used_at = now()`.
 *
 * Implementation notes — atomicity tradeoff:
 *   The `record_doctor_rx_template_use` SQL function from migration
 *   091 IS atomic and ownership-safe (single statement, internal
 *   `auth.uid() = doctor_id` check). However, the admin client
 *   (service-role JWT) has no `auth.uid()`, so we cannot call that
 *   function via `.rpc()` without first standing up a per-request
 *   user-scoped Supabase client — material refactor for a counter
 *   bump.
 *
 *   For v1 we read-modify-write the increment from this service. The
 *   only caller is the picker's Apply path, and templates are owned
 *   by a single doctor, so the race window (concurrent Applies of the
 *   same template by the same doctor) is vanishingly small and the
 *   worst-case symptom is a missed +1 in usage telemetry. Acceptable.
 *
 *   If concurrent counter accuracy becomes important later we can wire
 *   the SQL function via a user-scoped client without changing this
 *   service's external contract.
 */
export async function recordRxTemplateUse(
  id: string,
  correlationId: string,
  userId: string,
): Promise<DoctorRxTemplate> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // Step 1: read-and-verify (ownership + not-archived) in a single
  // round-trip. Throws 404 in the same shape regardless of whether the
  // row exists, is owned by another doctor, or is archived — so we
  // never leak existence to the caller.
  const { data: existing, error: existsError } = await admin
    .from('doctor_rx_templates')
    .select('id, doctor_id, archived_at, use_count')
    .eq('id', id)
    .maybeSingle();

  if (existsError) handleSupabaseError(existsError, correlationId);
  if (!existing) throw new NotFoundError('Template not found');

  const existingRow = existing as {
    doctor_id: string;
    archived_at: string | null;
    use_count: number;
  };
  if (existingRow.doctor_id !== userId || existingRow.archived_at) {
    throw new NotFoundError('Template not found');
  }

  // Step 2: write the bumped values + return the fresh row. The
  // `archived_at IS NULL` filter on the UPDATE WHERE prevents bumping
  // a row that just got archived in the gap between step 1 and 2.
  const { data: bumped, error: bumpErr } = await admin
    .from('doctor_rx_templates')
    .update({
      use_count: (existingRow.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('doctor_id', userId)
    .is('archived_at', null)
    .select('*')
    .single();

  if (bumpErr) handleSupabaseError(bumpErr, correlationId);
  if (!bumped) throw new NotFoundError('Template not found');

  await logDataAccess(correlationId, userId, 'rx_template', id);

  return bumped as DoctorRxTemplate;
}
