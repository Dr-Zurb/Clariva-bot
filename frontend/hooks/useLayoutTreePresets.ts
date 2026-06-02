"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listPresetsTree,
  savePresetTree,
  deletePreset as deletePresetApi,
  renamePreset as renamePresetApi,
  type CockpitLayoutPresetTree,
} from "@/lib/api/cockpit-layout-presets-tree";
import type { LayoutNode } from "@/lib/patient-profile/types";

const MAX_PRESETS = 5;

async function getToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return session.access_token;
}

export interface UseLayoutTreePresetsResult {
  presets: CockpitLayoutPresetTree[];
  loading: boolean;
  error: boolean;
  atCap: boolean;
  refresh: () => Promise<void>;
  savePreset: (
    name: string,
    layoutTree: LayoutNode,
    sourceTemplateId?: string,
  ) => Promise<CockpitLayoutPresetTree>;
  deletePreset: (id: string) => Promise<void>;
  renamePreset: (id: string, name: string) => Promise<CockpitLayoutPresetTree>;
}

export function useLayoutTreePresets(): UseLayoutTreePresetsResult {
  const [presets, setPresets] = useState<CockpitLayoutPresetTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const token = await getToken();
      const rows = await listPresetsTree(token);
      setPresets(rows);
    } catch (err) {
      console.error("[useLayoutTreePresets] fetch failed:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const savePreset = useCallback(
    async (
      name: string,
      layoutTree: LayoutNode,
      sourceTemplateId?: string,
    ): Promise<CockpitLayoutPresetTree> => {
      const token = await getToken();
      const created = await savePresetTree(token, {
        name,
        layoutTree,
        sourceTemplateId,
      });
      await refresh();
      return created;
    },
    [refresh],
  );

  const deletePreset = useCallback(
    async (id: string): Promise<void> => {
      const token = await getToken();
      await deletePresetApi(token, id);
      await refresh();
    },
    [refresh],
  );

  const renamePreset = useCallback(
    async (id: string, name: string): Promise<CockpitLayoutPresetTree> => {
      const token = await getToken();
      const updated = await renamePresetApi(token, id, name);
      await refresh();
      return updated;
    },
    [refresh],
  );

  return {
    presets,
    loading,
    error,
    atCap: presets.length >= MAX_PRESETS,
    refresh,
    savePreset,
    deletePreset,
    renamePreset,
  };
}
