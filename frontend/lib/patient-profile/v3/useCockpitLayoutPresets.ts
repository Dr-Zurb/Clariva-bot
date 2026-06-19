"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePreset,
  listPresetsV3,
  renamePresetV3,
  savePresetV3,
  type CockpitLayoutPresetV3,
} from "@/lib/api/cockpit-layout-presets-tree";
import {
  deserialiseTree,
  serialiseTree,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

const QUERY_KEY = ["cockpit-layout-presets-v3"] as const;

export const MAX_SAVED_LAYOUTS = 5;

export interface UseCockpitLayoutPresetsResult {
  presets: CockpitLayoutPresetV3[];
  isLoading: boolean;
  canSaveMore: boolean;
  savePreset: (name: string, paneTree: PaneTreeNode, sourceTemplateId?: string) => Promise<void>;
  deletePresetById: (id: string) => Promise<void>;
  renamePresetById: (id: string, name: string) => Promise<void>;
  refetch: () => void;
}

export function clonePaneTree(tree: PaneTreeNode): PaneTreeNode {
  return deserialiseTree(serialiseTree(tree));
}

export function savedLayoutTreesEqual(a: PaneTreeNode, b: PaneTreeNode): boolean {
  return serialiseTree(a) === serialiseTree(b);
}

export function findMatchingSavedPresetId(
  tree: PaneTreeNode,
  presets: readonly CockpitLayoutPresetV3[],
): string | null {
  const live = serialiseTree(tree);
  for (const preset of presets) {
    if (serialiseTree(preset.paneTreeV3) === live) return preset.id;
  }
  return null;
}

export function useCockpitLayoutPresets(
  token: string | undefined,
  enabled = true,
): UseCockpitLayoutPresetsResult {
  const queryClient = useQueryClient();
  const active = Boolean(token) && enabled;

  const query = useQuery({
    queryKey: [...QUERY_KEY, token],
    queryFn: () => listPresetsV3(token!),
    enabled: active,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (vars: {
      name: string;
      paneTree: PaneTreeNode;
      sourceTemplateId?: string;
    }) => savePresetV3(token!, vars),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePreset(token!, id),
    onSuccess: invalidate,
  });

  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      renamePresetV3(token!, vars.id, vars.name),
    onSuccess: invalidate,
  });

  const presets = query.data ?? [];
  const canSaveMore = presets.length < MAX_SAVED_LAYOUTS;

  return {
    presets,
    isLoading: query.isLoading,
    canSaveMore,
    savePreset: async (name, paneTree, sourceTemplateId) => {
      await saveMutation.mutateAsync({
        name,
        paneTree: clonePaneTree(paneTree),
        sourceTemplateId,
      });
    },
    deletePresetById: async (id) => {
      await deleteMutation.mutateAsync(id);
    },
    renamePresetById: async (id, name) => {
      await renameMutation.mutateAsync({ id, name });
    },
    refetch: () => {
      void query.refetch();
    },
  };
}
