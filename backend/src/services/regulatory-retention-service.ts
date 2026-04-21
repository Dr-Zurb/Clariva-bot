/**
 * Regulatory Retention Service (Plan 02 · Task 34 · Decision 4 LOCKED)
 * ---------------------------------------------------------------------
 *
 * Reads `regulatory_retention_policy` (migrations 055 / 058) and answers
 * the one question the archival worker needs:
 *
 *   "For a consultation of (countryCode, specialty) ending on `asOf`,
 *    how many years must we keep the recording, and how many days
 *    before we hide it from patient self-serve?"
 *
 * ## Lookup precedence
 *
 *   1. Exact  (country, specialty)   — e.g. ('IN', 'pediatrics')
 *   2. Country-wide  (country, '*')  — e.g. ('IN', '*')
 *   3. Global fallback ('*', '*')    — the international conservative row
 *
 * Within each precedence tier, the newest `effective_from` that is
 * strictly ≤ `asOf` wins (and whose `effective_until` is NULL or >
 * `asOf`). That shape lets ops version a policy forward without losing
 * the audit trail of what was in force when.
 *
 * If even the global fallback row is missing, we throw
 * `InternalError` — the seed migration (058) is the safety net; a
 * missing fallback means an environment was deployed without running
 * the seed, and the archival worker must not proceed in that state
 * (there would be no defensible reason string for
 * `archival_history.deletion_reason`).
 *
 * ## Pediatric age-based retention
 *
 * Pediatric rows carry a `retention_until_age` override (default 21 for
 * India). The worker does NOT consume that from this service directly —
 * this service returns it and lets the worker combine it with the
 * patient's date-of-birth. That split keeps this service
 * patient-independent (one lookup per policy key, not per patient).
 *
 * ## Case-normalisation
 *
 * Country codes are upper-cased; specialties are lower-cased before
 * lookup. Seed data matches that convention.
 *
 * @see backend/migrations/055_regulatory_retention_policy.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-34-regulatory-retention-policy-and-archival-worker.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';

export interface ResolveRetentionPolicyInput {
  /** ISO 3166-1 alpha-2. Case-insensitive. Falsy → fallback to '*'. */
  countryCode: string | null | undefined;
  /** Specialty key. Case-insensitive. Falsy → fallback to '*'. */
  specialty: string | null | undefined;
  /** Defaults to `new Date()`. Used to pick the policy version active at that date. */
  asOf?: Date;
}

export interface ResolveRetentionPolicyResult {
  /** Hard-delete threshold, in whole years since session end. */
  retentionYears: number;
  /**
   * Optional "retain until patient reaches this age" override. When set
   * AND the caller has the patient DOB, the worker uses
   * max(sessionEnd + retentionYears, dob + retentionUntilAge).
   */
  retentionUntilAge: number | null;
  /** Patient self-serve replay TTL in days (hide-phase threshold). */
  patientSelfServeDays: number;
  /** Human-readable citation. Surfaced in archival_history.deletion_reason. */
  source: string;
  /** ID of the policy row. Stored in archival_history.policy_id at delete time. */
  policyId: string;
  /**
   * The precedence tier that matched. Useful for structured logs so ops
   * can spot "this artifact got the fallback row, suggesting doctor
   * metadata is incomplete".
   */
  matchedTier: 'exact' | 'country' | 'global';
  /** The row's country_code as-stored (may be '*'). */
  matchedCountry: string;
  /** The row's specialty as-stored (may be '*'). */
  matchedSpecialty: string;
}

interface PolicyRow {
  id: string;
  country_code: string;
  specialty: string;
  retention_years: number;
  retention_until_age: number | null;
  patient_self_serve_days: number;
  source: string;
  effective_from: string;
  effective_until: string | null;
}

const POLICY_COLUMNS =
  'id, country_code, specialty, retention_years, retention_until_age, patient_self_serve_days, source, effective_from, effective_until';

const WILDCARD = '*';

/**
 * Normalise a country code input. Uppercases and trims; empty / null →
 * wildcard. Does NOT attempt ISO-code validation — the table accepts
 * arbitrary strings and we treat an unknown country as "fall back".
 */
function normaliseCountry(input: string | null | undefined): string {
  const s = (input ?? '').trim();
  return s.length === 0 ? WILDCARD : s.toUpperCase();
}

/**
 * Normalise a specialty input. Lowercases and trims; empty / null →
 * wildcard. Specialties in `doctor_settings` are free-text so we
 * lowercase to make the seed row match more robustly (e.g. "Pediatrics"
 * vs "pediatrics").
 */
function normaliseSpecialty(input: string | null | undefined): string {
  const s = (input ?? '').trim();
  return s.length === 0 ? WILDCARD : s.toLowerCase();
}

/**
 * Fetch the newest policy row for (country, specialty) that is active
 * at `asOf`. Returns null if no matching row exists. A row is active
 * when `effective_from <= asOf` AND (`effective_until` IS NULL OR
 * `effective_until > asOf`).
 */
async function readActivePolicyRow(
  countryCode: string,
  specialty: string,
  asOf: Date,
): Promise<PolicyRow | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'regulatory-retention-service: Service role client not available',
    );
  }

  // The lookup-by-index matches exactly on (country_code, specialty) and
  // reads by effective_from DESC. We then filter in application code for
  // `effective_from <= asOf` + `effective_until IS NULL OR effective_until > asOf`.
  // Doing that in SQL would require two OR branches on effective_until
  // which does not play nicely with PostgREST chained filters; the
  // result set here is always tiny (policy history for one tier) so
  // application-side filtering is cheap.
  const { data, error } = await admin
    .from('regulatory_retention_policy')
    .select(POLICY_COLUMNS)
    .eq('country_code', countryCode)
    .eq('specialty', specialty)
    .order('effective_from', { ascending: false });

  if (error) {
    throw new InternalError(
      `regulatory-retention-service: lookup failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as PolicyRow[];
  for (const row of rows) {
    const effFrom = new Date(row.effective_from);
    if (Number.isNaN(effFrom.getTime()) || effFrom.getTime() > asOf.getTime()) {
      continue;
    }
    if (row.effective_until) {
      const effUntil = new Date(row.effective_until);
      if (!Number.isNaN(effUntil.getTime()) && effUntil.getTime() <= asOf.getTime()) {
        continue;
      }
    }
    return row;
  }
  return null;
}

/**
 * Resolve the effective retention policy for a (country, specialty,
 * asOf). Precedence: exact → country-wide → global. Throws
 * `InternalError` if even the global fallback is missing (an
 * environment-setup bug).
 */
export async function resolveRetentionPolicy(
  input: ResolveRetentionPolicyInput,
): Promise<ResolveRetentionPolicyResult> {
  const country = normaliseCountry(input.countryCode);
  const specialty = normaliseSpecialty(input.specialty);
  const asOf = input.asOf ?? new Date();

  // Tier 1: exact (country, specialty). Skip when either side is already
  // the wildcard — that falls through to tier 2 / 3 below.
  if (country !== WILDCARD && specialty !== WILDCARD) {
    const exact = await readActivePolicyRow(country, specialty, asOf);
    if (exact) return toResult(exact, 'exact');
  }

  // Tier 2: country-wide (country, '*'). Skip when country itself is wildcard.
  if (country !== WILDCARD) {
    const countryWide = await readActivePolicyRow(country, WILDCARD, asOf);
    if (countryWide) return toResult(countryWide, 'country');
  }

  // Tier 3: global fallback. MUST exist — seeded by migration 058.
  const global = await readActivePolicyRow(WILDCARD, WILDCARD, asOf);
  if (global) {
    // When we had to fall all the way back, log a structured data-quality
    // signal so ops can spot "this doctor is missing country/specialty
    // metadata and every artifact they produce is getting the fallback
    // policy". It is not a worker failure — the fallback is deliberate
    // belt-and-suspenders — but it is actionable.
    if (country === WILDCARD || specialty === WILDCARD) {
      logger.info(
        {
          requested: { country, specialty },
          matched: { country: global.country_code, specialty: global.specialty },
        },
        'retention_policy_fallback_used',
      );
    }
    return toResult(global, country === WILDCARD && specialty === WILDCARD ? 'global' : 'global');
  }

  throw new InternalError(
    'regulatory-retention-service: no policy row matches and the ("*", "*") global fallback is missing. The seed migration (058_regulatory_retention_policy_seed.sql) has not been applied.',
  );
}

function toResult(
  row: PolicyRow,
  matchedTier: 'exact' | 'country' | 'global',
): ResolveRetentionPolicyResult {
  return {
    retentionYears: row.retention_years,
    retentionUntilAge: row.retention_until_age ?? null,
    patientSelfServeDays: row.patient_self_serve_days,
    source: row.source,
    policyId: row.id,
    matchedTier,
    matchedCountry: row.country_code,
    matchedSpecialty: row.specialty,
  };
}
