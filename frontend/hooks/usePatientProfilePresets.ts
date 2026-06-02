"use client";

/**
 * usePatientProfilePresets — fetch, apply, save, rename, and delete v2 layout
 * presets for the patient-profile shell.
 *
 * Mirrors the v1 `useCockpitPresets` pattern but owns PatientProfileLayout
 * (v2 shape) throughout. Custom presets stored on the backend in the legacy
 * v1 JSONB shape are translated on read via `translateLegacyPreset`; new
 * writes always tag with `version: 2` so subsequent reads skip translation.
 *
 * The same `/v1/settings/doctor/cockpit-presets` endpoint is used — DL-10
 * guarantees no backend changes for ppr-09.
 *
 * `applyPreset(presetId)` looks up built-in or custom preset, validates, and
 * calls the `applyLayout` callback provided by the caller (PatientProfilePage
 * threads `shellRef.current?.applyLayout` in as a stable ref callback).
 * Returns `true` on success, `false` on unknown id or validation failure.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requireApiBaseUrl } from "@/lib/api-base";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";
import { BUILT_IN_PRESETS, type BuiltInPreset } from "@/lib/patient-profile/built-in-presets";
import { translateLegacyPreset } from "@/lib/patient-profile/preset-translation";
import { validateLayout } from "@/lib/patient-profile/useShellLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomPreset {
  id: string;
  name: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  layout: PatientProfileLayout;
}

export interface UsePatientProfilePresetsResult {
  /** Built-in presets (always 3). */
  builtIns: readonly BuiltInPreset[];
  /** Custom user presets (≤ MAX_PRESETS). Loaded from backend on mount. */
  customs: CustomPreset[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /**
   * Apply a preset to the layout state. Returns true on success, false when
   * the preset id is unknown or the layout fails validation.
   */
  applyPreset: (presetId: string) => boolean;
  /** Save the current layout as a new custom preset. Enforces soft-cap of 5. */
  savePreset: (
    name: string,
    currentLayout: PatientProfileLayout,
    opts?: { evictId?: string },
  ) => Promise<void>;
  /** Delete a custom preset by id. */
  deletePreset: (id: string) => Promise<void>;
  /** Rename a custom preset. */
  renamePreset: (id: string, newName: string) => Promise<void>;
  /** Manual refetch. */
  refresh: () => Promise<void>;
  /**
   * Returns the preset that would be evicted if a 6th save happened now.
   * Null when the array is below the cap. Used by `<SavePresetDialog>` to
   * show the eviction confirm copy.
   */
  nextEvictionTarget: () => CustomPreset | null;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UsePatientProfilePresetsOptions {
  /**
   * Callback used by `applyPreset` to push the resolved layout into the shell.
   * Pass `(layout) => shellRef.current?.applyLayout(layout)` from the page.
   */
  applyLayout: (layout: PatientProfileLayout) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PRESETS = 5;
const PRESETS_PATH = "/api/v1/settings/doctor/cockpit-presets";

// ---------------------------------------------------------------------------
// Wire-shape stored in the backend JSONB column
// ---------------------------------------------------------------------------

/** Shape of an individual row as the server persists / returns it. */
interface BackendPresetRow {
  id: string;
  name: string;
  created_at: string;
  /** May be a legacy v1 shape or a v2-tagged shape. */
  layout: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return session.access_token;
}

async function presetsRequest<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getToken();
  const base = requireApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text);
  } catch {
    // empty body is fine for some DELETE responses
  }
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ?? "Request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (json as { data: T }).data;
}

/**
 * Translate a raw backend row into a `CustomPreset`. Returns null when the
 * stored layout shape can't be translated — the caller discards nulls silently
 * (the row is never deleted from the server; only the UI skips it).
 */
function rowToCustomPreset(row: BackendPresetRow): CustomPreset | null {
  const layout = translateLegacyPreset(row.layout);
  if (!layout) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at, layout };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientProfilePresets(
  opts: UsePatientProfilePresetsOptions,
): UsePatientProfilePresetsResult {
  const { applyLayout } = opts;

  const [loading, setLoading] = useState(false);
  const [customs, setCustoms] = useState<CustomPreset[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await presetsRequest<{ presets: BackendPresetRow[] }>(PRESETS_PATH, {
        method: "GET",
      });
      const translated = data.presets
        .map(rowToCustomPreset)
        .filter((p): p is CustomPreset => p !== null);
      setCustoms(translated);
    } catch (err) {
      console.error("[usePatientProfilePresets] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyPreset = useCallback(
    (presetId: string): boolean => {
      // Built-in presets are hard-coded valid — apply directly.
      const builtIn = BUILT_IN_PRESETS.find((p) => p.id === presetId);
      if (builtIn) {
        applyLayout(builtIn.layout);
        return true;
      }

      // Custom presets — validate before applying (defensive against corrupt rows).
      const custom = customs.find((p) => p.id === presetId);
      if (custom) {
        const validated = validateLayout(custom.layout);
        if (!validated) return false;
        applyLayout(validated);
        return true;
      }

      return false;
    },
    [applyLayout, customs],
  );

  const savePreset = useCallback(
    async (
      name: string,
      currentLayout: PatientProfileLayout,
      opts?: { evictId?: string },
    ): Promise<void> => {
      let nextArray = [...customs];

      if (nextArray.length >= MAX_PRESETS) {
        // Evict the target id if supplied (caller confirmed eviction via dialog),
        // otherwise fall back to the oldest by createdAt.
        const evictId =
          opts?.evictId ??
          [...nextArray].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id;
        if (evictId) {
          nextArray = nextArray.filter((p) => p.id !== evictId);
        }
      }

      // Always write with version: 2 so the next read knows not to translate.
      const newPreset: CustomPreset = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        layout: currentLayout,
      };
      nextArray = [...nextArray, newPreset];

      // The backend expects the wire format with `created_at` (snake_case).
      const wireRows: BackendPresetRow[] = nextArray.map((p) => ({
        id: p.id,
        name: p.name,
        created_at: p.createdAt,
        layout: p.layout,
      }));

      const data = await presetsRequest<{ presets: BackendPresetRow[] }>(PRESETS_PATH, {
        method: "PUT",
        body: JSON.stringify({ presets: wireRows }),
      });

      const saved = data.presets
        .map(rowToCustomPreset)
        .filter((p): p is CustomPreset => p !== null);
      setCustoms(saved);
    },
    [customs],
  );

  const deletePreset = useCallback(async (id: string): Promise<void> => {
    const data = await presetsRequest<{ presets: BackendPresetRow[] }>(
      `${PRESETS_PATH}/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const remaining = data.presets
      .map(rowToCustomPreset)
      .filter((p): p is CustomPreset => p !== null);
    setCustoms(remaining);
  }, []);

  const renamePreset = useCallback(
    async (id: string, newName: string): Promise<void> => {
      const wireRows: BackendPresetRow[] = customs.map((p) => ({
        id: p.id,
        name: p.id === id ? newName.trim() : p.name,
        created_at: p.createdAt,
        layout: p.layout,
      }));

      const data = await presetsRequest<{ presets: BackendPresetRow[] }>(PRESETS_PATH, {
        method: "PUT",
        body: JSON.stringify({ presets: wireRows }),
      });

      const renamed = data.presets
        .map(rowToCustomPreset)
        .filter((p): p is CustomPreset => p !== null);
      setCustoms(renamed);
    },
    [customs],
  );

  const nextEvictionTarget = useCallback((): CustomPreset | null => {
    if (customs.length < MAX_PRESETS) return null;
    return [...customs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  }, [customs]);

  return {
    builtIns: BUILT_IN_PRESETS,
    customs,
    loading,
    applyPreset,
    savePreset,
    deletePreset,
    renamePreset,
    refresh,
    nextEvictionTarget,
  };
}
