/**
 * Doctor note favorites API client (subjective-tab · subj-06)
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiSuccess, ApiError } from "@/lib/api";

export const NOTE_FAVORITE_FIELD_KEYS = [
  "complaint_name",
  "family_history",
  "social_history",
  "past_surgical_history",
  "complaint_associated",
] as const;

export type NoteFavoriteFieldKey = (typeof NOTE_FAVORITE_FIELD_KEYS)[number];

export interface DoctorNoteFavorite {
  id: string;
  fieldKey: NoteFavoriteFieldKey;
  value: string;
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface DoctorNoteFavoriteRow {
  id: string;
  field_key: NoteFavoriteFieldKey;
  value: string;
  use_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: unknown }).success === false
  );
}

function mapFavorite(row: DoctorNoteFavoriteRow): DoctorNoteFavorite {
  return {
    id: row.id,
    fieldKey: row.field_key,
    value: row.value,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
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

export async function listNoteFavorites(
  token: string,
  fieldKey?: NoteFavoriteFieldKey,
): Promise<DoctorNoteFavorite[]> {
  const params = new URLSearchParams();
  if (fieldKey) params.set("fieldKey", fieldKey);

  const qs = params.toString();
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/note-favorites${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const json = await parseJsonResponse<{ favorites: DoctorNoteFavoriteRow[] }>(res);
  return (json.data.favorites ?? []).map(mapFavorite);
}

export async function createNoteFavorite(
  token: string,
  payload: { fieldKey: NoteFavoriteFieldKey; value: string },
): Promise<DoctorNoteFavorite> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/note-favorites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await parseJsonResponse<{ favorite: DoctorNoteFavoriteRow }>(res);
  return mapFavorite(json.data.favorite);
}

export async function deleteNoteFavorite(token: string, id: string): Promise<void> {
  const res = await fetch(`${requireApiBaseUrl()}/api/v1/doctors/me/note-favorites/${id}`, {
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

export async function recordNoteFavoriteUse(
  token: string,
  payload: { fieldKey: NoteFavoriteFieldKey; value: string },
): Promise<void> {
  const res = await fetch(
    `${requireApiBaseUrl()}/api/v1/doctors/me/note-favorites/record-use`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError;
    const message = isApiError(json) ? json.error.message : "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/** Map RxForm history keys to API field_key values. */
export function historyFieldKeyToNoteFavorite(
  key: "familyHistory" | "socialHistory" | "pastSurgicalHistory",
): NoteFavoriteFieldKey {
  switch (key) {
    case "familyHistory":
      return "family_history";
    case "socialHistory":
      return "social_history";
    case "pastSurgicalHistory":
      return "past_surgical_history";
  }
}
