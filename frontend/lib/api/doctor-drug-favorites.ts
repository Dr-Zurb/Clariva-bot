/**
 * Doctor drug favorites API client (rx-polish-favorites · rxf-04).
 *
 * GET    /api/v1/doctors/me/drug-favorites
 * POST   /api/v1/doctors/me/drug-favorites
 * PATCH  /api/v1/doctors/me/drug-favorites/:id
 * DELETE /api/v1/doctors/me/drug-favorites/:id
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";

export interface DoctorDrugFavorite {
  id: string;
  name: string;
  template: MedicineRowValue;
  createdAt: string;
  updatedAt: string;
}

interface DoctorDrugFavoriteRow {
  id: string;
  name: string;
  template: MedicineRowValue;
  created_at: string;
  updated_at: string;
}

export interface DoctorDrugFavoritesListData {
  favorites: DoctorDrugFavorite[];
}

export interface DoctorDrugFavoriteData {
  favorite: DoctorDrugFavorite;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

function mapFavorite(row: DoctorDrugFavoriteRow): DoctorDrugFavorite {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function parseJsonResponse<T>(res: Response): Promise<ApiSuccess<T>> {
  const json = (await res.json().catch(() => ({}))) as ApiSuccess<T> | ApiError;
  if (!res.ok) {
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (isApiError(json)) {
    const err = new Error(json.error.message) as Error & { status?: number };
    err.status = json.error.statusCode ?? 500;
    throw err;
  }
  return json as ApiSuccess<T>;
}

export async function listFavorites(token: string): Promise<DoctorDrugFavorite[]> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/drug-favorites`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const json = await parseJsonResponse<{ favorites: DoctorDrugFavoriteRow[] }>(res);
  return (json.data.favorites ?? []).map(mapFavorite);
}

export async function createFavorite(
  token: string,
  payload: { name: string; template: MedicineRowValue },
): Promise<DoctorDrugFavorite> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/drug-favorites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await parseJsonResponse<{ favorite: DoctorDrugFavoriteRow }>(res);
  return mapFavorite(json.data.favorite);
}

export async function updateFavorite(
  token: string,
  id: string,
  patch: Partial<{ name: string; template: MedicineRowValue }>,
): Promise<DoctorDrugFavorite> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/drug-favorites/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  const json = await parseJsonResponse<{ favorite: DoctorDrugFavoriteRow }>(res);
  return mapFavorite(json.data.favorite);
}

export async function deleteFavorite(token: string, id: string): Promise<void> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/drug-favorites/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError;
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}
