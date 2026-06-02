/**
 * Patients v2 API client (pr-04 / DL-4, DL-5, DL-6, DL-9).
 *
 * Typed fetch wrappers for the patients list, overview aggregator, KPI strip,
 * and saved list views. Consumers import from this module directly:
 *
 *   import { getPatientsList, getPatientOverview } from "@/lib/api/patients";
 *
 * @see frontend/lib/api/patient-chart.ts (resource-family precedent)
 * @see frontend/types/patient.ts (response / filter shapes from pr-01)
 */

import type { ApiError, ApiSuccess } from "@/lib/api";
import { requireApiBaseUrl } from "@/lib/api-base";
import type {
  DuplicateGroupPatient,
  PatientListFilters,
  PatientsListPagedData,
  PatientOverviewData,
  PatientsKpis,
  PatientSavedView,
  PossibleDuplicatesData,
} from "@/types/patient";

const COCKPIT_PRESETS_PATH = "/api/v1/settings/doctor/cockpit-presets";

const PATIENTS_LIST_VIEW_KIND = "patients_list_view" as const;

// ---------------------------------------------------------------------------
// Shared fetch helpers
// ---------------------------------------------------------------------------

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

function authHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

function throwFromResponse(
  res: Response,
  json: unknown,
  fallbackMessage: string,
): never {
  const message = isApiError(json) ? json.error.message : fallbackMessage;
  const err = new Error(message) as Error & { status?: number; code?: string };
  err.status = res.status;
  if (isApiError(json)) err.code = json.error.code;
  throw err;
}

async function parseApiEnvelope<T>(res: Response, fallbackMessage: string): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok) throwFromResponse(res, json, fallbackMessage);
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & {
      status?: number;
      code?: string;
    };
    err.status = json.error.statusCode ?? 500;
    err.code = json.error.code;
    throw err;
  }
  return (json as ApiSuccess<T>).data;
}

// ---------------------------------------------------------------------------
// List / overview / KPIs
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/patients — paginated, filterable list (pr-02 / DL-4).
 */
export async function getPatientsList(
  token: string,
  filters: PatientListFilters = {},
): Promise<PatientsListPagedData> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.segment) params.set("segment", filters.segment);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.pageSize !== undefined) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/patients${qs ? `?${qs}` : ""}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  return parseApiEnvelope<PatientsListPagedData>(res, "Failed to load patients");
}

/**
 * PATCH /api/v1/patients/bulk-tag — set patient_tag on multiple patients (pr-07).
 */
export async function bulkTagPatients(
  token: string,
  ids: string[],
  tag: string | null,
): Promise<{ updated: number }> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/patients/bulk-tag`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ ids, tag }),
    cache: "no-store",
  });
  return parseApiEnvelope<{ updated: number }>(res, "Failed to apply tag");
}

/**
 * GET /api/v1/patients/:id/overview — composed chart context (pr-03 / DL-5).
 *
 * Optional `windowDays` is forwarded for longer vitals windows (pr-12); the
 * server ignores unknown query params until that task lands.
 */
export async function getPatientOverview(
  token: string,
  patientId: string,
  options: { windowDays?: number } = {},
): Promise<PatientOverviewData> {
  const params = new URLSearchParams();
  if (options.windowDays !== undefined) {
    params.set("windowDays", String(options.windowDays));
  }
  const qs = params.toString();
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/patients/${encodeURIComponent(patientId)}/overview${qs ? `?${qs}` : ""}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  return parseApiEnvelope<PatientOverviewData>(res, "Failed to load patient overview");
}

/**
 * GET /api/v1/patients/kpis — KPI tile counts (pr-03 / DL-6).
 *
 * Omits `cache: 'no-store'` so the browser can honour `Cache-Control: max-age=60`.
 */
export async function getPatientsKpis(token: string): Promise<PatientsKpis> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/patients/kpis`, {
    headers: authHeaders(token),
  });
  return parseApiEnvelope<PatientsKpis>(res, "Failed to load patient KPIs");
}

/**
 * GET /api/v1/patients/possible-duplicates — duplicate groups for merge chip (pr-08).
 */
export async function getPossibleDuplicates(
  token: string,
): Promise<DuplicateGroupPatient[][]> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/patients/possible-duplicates`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  const data = await parseApiEnvelope<PossibleDuplicatesData>(
    res,
    "Failed to load possible duplicates",
  );
  return data.groups;
}

// ---------------------------------------------------------------------------
// Saved views (DL-9) — stored in doctor_settings.cockpit_layout_presets
// ---------------------------------------------------------------------------

/** Wire layout blob for a patients-list saved view (discriminator in JSONB). */
interface PatientsListViewWireLayout {
  kind: typeof PATIENTS_LIST_VIEW_KIND;
  filters: PatientListFilters;
  columns?: string[];
  is_default: boolean;
}

interface CockpitPresetWireRow {
  id: string;
  name: string;
  created_at: string;
  layout: unknown;
}

function isPatientsListViewLayout(layout: unknown): layout is PatientsListViewWireLayout {
  return (
    typeof layout === "object" &&
    layout !== null &&
    (layout as PatientsListViewWireLayout).kind === PATIENTS_LIST_VIEW_KIND
  );
}

function wireRowToSavedView(row: CockpitPresetWireRow): PatientSavedView | null {
  if (!isPatientsListViewLayout(row.layout)) return null;
  return {
    id: row.id,
    name: row.name,
    is_default: row.layout.is_default,
    filters: row.layout.filters ?? {},
    columns: row.layout.columns,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function savedViewToWireRow(view: PatientSavedView): CockpitPresetWireRow {
  const createdAt = view.created_at || new Date().toISOString();
  return {
    id: view.id,
    name: view.name,
    created_at: createdAt,
    layout: {
      kind: PATIENTS_LIST_VIEW_KIND,
      filters: view.filters ?? {},
      columns: view.columns,
      is_default: view.is_default,
    },
  };
}

async function fetchCockpitPresetRows(token: string): Promise<CockpitPresetWireRow[]> {
  const res = await fetch(
    `${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}?kind=${PATIENTS_LIST_VIEW_KIND}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  const json = (await res.json().catch(() => ({}))) as
    | { presets?: CockpitPresetWireRow[] }
    | ApiError;
  if (!res.ok) throwFromResponse(res, json, "Failed to load saved views");
  return (json as { presets?: CockpitPresetWireRow[] }).presets ?? [];
}

async function putCockpitPresetRows(
  token: string,
  presets: CockpitPresetWireRow[],
): Promise<CockpitPresetWireRow[]> {
  const res = await fetch(`${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ presets }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | { presets?: CockpitPresetWireRow[] }
    | ApiError;
  if (!res.ok) throwFromResponse(res, json, "Failed to save views");
  return (json as { presets?: CockpitPresetWireRow[] }).presets ?? [];
}

/**
 * GET /api/v1/settings/doctor/cockpit-presets?kind=patients_list_view
 */
export async function getPatientSavedViews(token: string): Promise<PatientSavedView[]> {
  const rows = await fetchCockpitPresetRows(token);
  return rows
    .map(wireRowToSavedView)
    .filter((v): v is PatientSavedView => v !== null);
}

/**
 * Upsert a patients-list saved view (read-modify-write on the presets array).
 *
 * When `view.is_default` is true, clears the default flag on sibling list views.
 */
export async function upsertPatientSavedView(
  token: string,
  view: PatientSavedView,
): Promise<PatientSavedView> {
  const allRows = await fetchAllCockpitPresetRows(token);
  const cockpitRows = allRows.filter((r) => !isPatientsListViewLayout(r.layout));
  let listRows = allRows
    .filter((r) => isPatientsListViewLayout(r.layout))
    .map((r) => wireRowToSavedView(r))
    .filter((v): v is PatientSavedView => v !== null);

  const nextWire = savedViewToWireRow(view);
  const idx = listRows.findIndex((v) => v.id === view.id);
  if (idx >= 0) {
    listRows = [...listRows.slice(0, idx), view, ...listRows.slice(idx + 1)];
  } else {
    listRows = [...listRows, view];
  }

  if (view.is_default) {
    listRows = listRows.map((v) => ({ ...v, is_default: v.id === view.id }));
  }

  const merged = [
    ...cockpitRows,
    ...listRows.map(savedViewToWireRow),
  ];
  const saved = await putCockpitPresetRows(token, merged);
  const persisted = saved
    .map(wireRowToSavedView)
    .find((v) => v?.id === view.id);
  if (!persisted) {
    throw new Error("Saved view was not returned after upsert");
  }
  return persisted;
}

/**
 * DELETE /api/v1/settings/doctor/cockpit-presets/:id
 */
export async function deletePatientSavedView(token: string, id: string): Promise<void> {
  const res = await fetch(
    `${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError;
    throwFromResponse(res, json, "Failed to delete saved view");
  }
}

/** Fetch every preset row (unfiltered) for read-modify-write merges. */
async function fetchAllCockpitPresetRows(token: string): Promise<CockpitPresetWireRow[]> {
  const res = await fetch(`${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | { presets?: CockpitPresetWireRow[] }
    | ApiError;
  if (!res.ok) throwFromResponse(res, json, "Failed to load presets");
  return (json as { presets?: CockpitPresetWireRow[] }).presets ?? [];
}
