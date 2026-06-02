/**
 * Cockpit layout preset API client — tree shape (clpm-02 / R-LAYOUT-UX).
 *
 * GET    /api/v1/settings/doctor/cockpit-presets
 * PUT    /api/v1/settings/doctor/cockpit-presets
 * DELETE /api/v1/settings/doctor/cockpit-presets/:id
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { ApiError } from "@/lib/api";
import type { LayoutNode, LegacyFlatLayout } from "@/lib/patient-profile/types";

const COCKPIT_PRESETS_PATH = "/api/v1/settings/doctor/cockpit-presets";
const MAX_PRESETS = 5;
const PATIENTS_LIST_VIEW_KIND = "patients_list_view";

export interface CockpitLayoutPresetTree {
  id: string;
  name: string;
  createdAt: string;
  sourceTemplateId?: string;
  layoutTree?: LayoutNode;
  layout?: LegacyFlatLayout;
}

interface CockpitPresetWireRow {
  id: string;
  name: string;
  created_at: string;
  sourceTemplateId?: string;
  layout_tree?: LayoutNode;
  layout?: unknown;
}

function isApiError(json: unknown): json is ApiError {
  return (
    typeof json === "object" &&
    json !== null &&
    "success" in (json as Record<string, unknown>) &&
    (json as { success?: boolean }).success === false
  );
}

function throwFromResponse(res: Response, json: unknown, fallback: string): never {
  const message = isApiError(json) ? json.error.message : fallback;
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  throw err;
}

function isPatientsListViewRow(row: CockpitPresetWireRow): boolean {
  return (
    typeof row.layout === "object" &&
    row.layout !== null &&
    (row.layout as { kind?: string }).kind === PATIENTS_LIST_VIEW_KIND
  );
}

function isLayoutTreeRow(row: CockpitPresetWireRow): boolean {
  return row.layout_tree != null;
}

function wireRowToPreset(row: CockpitPresetWireRow): CockpitLayoutPresetTree | null {
  if (isPatientsListViewRow(row)) return null;
  if (!isLayoutTreeRow(row) && row.layout == null) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    sourceTemplateId: row.sourceTemplateId,
    layoutTree: row.layout_tree,
    layout:
      row.layout != null &&
      typeof row.layout === "object" &&
      "slots" in (row.layout as object)
        ? (row.layout as LegacyFlatLayout)
        : undefined,
  };
}

function presetToWireRow(preset: CockpitLayoutPresetTree): CockpitPresetWireRow {
  return {
    id: preset.id,
    name: preset.name,
    created_at: preset.createdAt,
    sourceTemplateId: preset.sourceTemplateId,
    layout_tree: preset.layoutTree,
    layout: preset.layout,
  };
}

async function fetchAllWireRows(token: string): Promise<CockpitPresetWireRow[]> {
  const res = await fetch(`${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | { presets?: CockpitPresetWireRow[] }
    | ApiError;
  if (!res.ok) throwFromResponse(res, json, "Failed to load cockpit presets");
  return (json as { presets?: CockpitPresetWireRow[] }).presets ?? [];
}

async function putWireRows(
  token: string,
  rows: CockpitPresetWireRow[],
): Promise<CockpitPresetWireRow[]> {
  const res = await fetch(`${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ presets: rows }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as
    | { presets?: CockpitPresetWireRow[] }
    | ApiError;
  if (!res.ok) throwFromResponse(res, json, "Failed to save cockpit presets");
  return (json as { presets?: CockpitPresetWireRow[] }).presets ?? [];
}

/**
 * List custom tree-shaped cockpit layout presets (excludes patients-list views).
 */
export async function listPresetsTree(token: string): Promise<CockpitLayoutPresetTree[]> {
  const rows = await fetchAllWireRows(token);
  return rows.map(wireRowToPreset).filter((p): p is CockpitLayoutPresetTree => p !== null);
}

/**
 * Append a tree preset (read-modify-write). Enforces the 5-preset cap on the server.
 */
export async function savePresetTree(
  token: string,
  payload: { name: string; sourceTemplateId?: string; layoutTree: LayoutNode },
): Promise<CockpitLayoutPresetTree> {
  const allRows = await fetchAllWireRows(token);

  if (allRows.length >= MAX_PRESETS) {
    const err = new Error("Maximum 5 cockpit layout presets allowed") as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }

  const created: CockpitLayoutPresetTree = {
    id: crypto.randomUUID(),
    name: payload.name.trim(),
    createdAt: new Date().toISOString(),
    sourceTemplateId: payload.sourceTemplateId,
    layoutTree: payload.layoutTree,
  };

  const merged = [...allRows, presetToWireRow(created)];
  const saved = await putWireRows(token, merged);
  const persisted = saved.map(wireRowToPreset).find((p) => p?.id === created.id);
  if (!persisted) {
    throw new Error("Saved preset was not returned after upsert");
  }
  return persisted;
}

/**
 * DELETE /api/v1/settings/doctor/cockpit-presets/:id
 */
export async function deletePreset(token: string, id: string): Promise<void> {
  const res = await fetch(
    `${requireApiBaseUrl()}${COCKPIT_PRESETS_PATH}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as ApiError;
    throwFromResponse(res, json, "Failed to delete cockpit preset");
  }
}

/**
 * Rename a custom preset (read-modify-write through the full-array PUT).
 * There is no PATCH endpoint; the server replaces the whole array (P3-DL-4).
 * Trims + length-caps the name like savePresetTree.
 */
export async function renamePreset(
  token: string,
  id: string,
  name: string,
): Promise<CockpitLayoutPresetTree> {
  const trimmed = name.trim();
  if (!trimmed) {
    const err = new Error("Preset name cannot be empty") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const allRows = await fetchAllWireRows(token);
  const idx = allRows.findIndex((r) => r.id === id);
  if (idx < 0) {
    const err = new Error("Preset not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const next = allRows.map((r, i) =>
    i === idx ? { ...r, name: trimmed.slice(0, 60) } : r,
  );
  const saved = await putWireRows(token, next);
  const persisted = saved.map(wireRowToPreset).find((p) => p?.id === id);
  if (!persisted) throw new Error("Renamed preset was not returned after upsert");
  return persisted;
}
