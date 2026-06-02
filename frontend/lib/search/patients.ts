/**
 * Patients source for the Cmd-K global palette.
 *
 * Sub-batch B / task-ui-B4. Thin client that returns up to 8 patient
 * matches for a query. Honors a caller-supplied `AbortSignal` so the
 * palette can cancel stale fetches on subsequent keystrokes.
 *
 * Backend status (locked at task design time, 2026-05-06)
 * -------------------------------------------------------
 *   - `GET /api/v1/patients?q=...&limit=8` does NOT exist today —
 *     `listPatientsHandler` ignores query params and returns the doctor's
 *     full linked-patient list.
 *   - Per the task spec ("Do not add backend work in this task"), V1 falls
 *     back to a client-side filter of the existing list.
 *   - The full list is small in practice (per-doctor, gated by linked
 *     conversations / appointments), so a single fetch + in-process filter
 *     is fine for V1.
 *   - TODO(V1.x): when the backend grows server-side `q`, swap the body
 *     of `searchPatients()` to a `?q=...&limit=8` round-trip and drop the
 *     module-level cache. The exported signature is the contract; the
 *     palette code does not need to change.
 *
 * Caching
 * -------
 * To keep keystroke latency near-zero, we cache the full list at module
 * scope for `LIST_TTL_MS`. Each `searchPatients()` call:
 *   1. Reuses the cached list if fresh.
 *   2. Otherwise fetches `/api/v1/patients` (with the caller's signal),
 *      stores the result, and filters.
 * Cache is per-tab (module scope), keyed by token, and silently invalidated
 * if the token changes (different doctor in the same browser session).
 *
 * @see frontend/components/layout/GlobalCommandPalette.tsx
 * @see frontend/lib/api.ts (getPatients)
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { PatientsListData, PatientSummary } from "@/types/patient";

/** Result row rendered by the palette. */
export interface PatientSearchHit {
  id: string;
  name: string;
  /** Phone number; null if the row had no phone (defensive — the
   *  PatientSummary type marks it `string`, but treat empty string as
   *  null for consistent palette rendering). */
  phone: string | null;
  /** IG handle — currently always null because `PatientSummary` does
   *  not include it. The field is part of the contract so V1.x can
   *  surface it without a palette refactor. */
  igHandle: string | null;
}

/** Max hits returned per query (keeps the palette list short + fast). */
const MAX_HITS = 8;
/** Cached list TTL. Tuned for the "doctor backspaces and retries" loop. */
const LIST_TTL_MS = 60_000;

interface CachedList {
  token: string;
  patients: PatientSummary[];
  ts: number;
}

let listCache: CachedList | null = null;

/** Force-clear the cache. Exposed for the rare case where a downstream
 *  mutation (e.g. patient merge) wants the next palette open to refetch. */
export function clearPatientsSearchCache(): void {
  listCache = null;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

async function fetchPatientsList(
  token: string,
  signal: AbortSignal | undefined
): Promise<PatientSummary[]> {
  const base = requireApiBaseUrl();
  const res = await fetch(`${base}/api/v1/patients`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`Patient list fetch failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as ApiSuccess<PatientsListData>;
  if (!json || json.success !== true || !Array.isArray(json.data?.patients)) {
    throw new Error("Patient list response was malformed");
  }
  return json.data.patients;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

/**
 * Filter a cached list against the query. Matches on name (substring,
 * case-insensitive) OR phone (substring on the digits-only form so the
 * doctor can paste a partial phone with or without spaces / dashes).
 */
function filterPatients(
  patients: PatientSummary[],
  query: string
): PatientSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return patients.slice(0, MAX_HITS).map(toHit);
  }
  const nameNeedle = normalize(trimmed);
  const digitsNeedle = trimmed.replace(/\D+/g, "");

  const hits: PatientSearchHit[] = [];
  for (const patient of patients) {
    const name = normalize(patient.name ?? "");
    const phoneDigits = (patient.phone ?? "").replace(/\D+/g, "");
    const matchesName = name.includes(nameNeedle);
    const matchesPhone =
      digitsNeedle.length > 0 && phoneDigits.includes(digitsNeedle);
    if (matchesName || matchesPhone) {
      hits.push(toHit(patient));
      if (hits.length >= MAX_HITS) break;
    }
  }
  return hits;
}

function toHit(patient: PatientSummary): PatientSearchHit {
  const phone = patient.phone && patient.phone.length > 0 ? patient.phone : null;
  return {
    id: patient.id,
    name: patient.name,
    phone,
    igHandle: null,
  };
}

/**
 * Search for patients matching `query`. Returns up to 8 hits. Honors
 * `signal` for cancellation of the underlying network fetch (the
 * client-side filter step is synchronous and not abortable, but it's
 * also <1ms for any realistic doctor's patient list).
 *
 * On AbortError, re-throws — the caller (palette orchestrator) is
 * expected to swallow `AbortError` per the standard cancellable-fetch
 * pattern.
 */
export async function searchPatients(
  token: string,
  query: string,
  signal?: AbortSignal
): Promise<PatientSearchHit[]> {
  const now = Date.now();
  const fresh =
    listCache !== null &&
    listCache.token === token &&
    now - listCache.ts < LIST_TTL_MS;

  let patients: PatientSummary[];
  if (fresh && listCache) {
    patients = listCache.patients;
  } else {
    patients = await fetchPatientsList(token, signal);
    listCache = { token, patients, ts: now };
  }

  return filterPatients(patients, query);
}
