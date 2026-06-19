"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createNoteFavorite,
  listNoteFavorites,
  recordNoteFavoriteUse,
  type DoctorNoteFavorite,
  type NoteFavoriteFieldKey,
} from "@/lib/api/note-favorites";

export const MAX_NOTE_FAVORITES_PER_FIELD = 30;

export function useNoteFavorites(token: string | undefined, fieldKey: NoteFavoriteFieldKey) {
  const [favorites, setFavorites] = useState<DoctorNoteFavorite[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!token) {
      setFavorites([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listNoteFavorites(token, fieldKey);
      setFavorites(rows);
    } catch {
      // Silent — static chips remain as fallback
    } finally {
      setLoading(false);
    }
  }, [token, fieldKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyFavorite = useCallback(
    async (value: string) => {
      if (!token) return;
      try {
        await recordNoteFavoriteUse(token, { fieldKey, value });
        void reload();
      } catch {
        // Non-blocking
      }
    },
    [token, fieldKey, reload],
  );

  const saveFavorite = useCallback(
    async (value: string) => {
      if (!token) return false;
      const trimmed = value.trim();
      if (!trimmed) return false;
      if (favorites.length >= MAX_NOTE_FAVORITES_PER_FIELD) return false;
      try {
        await createNoteFavorite(token, { fieldKey, value: trimmed });
        void reload();
        return true;
      } catch {
        return false;
      }
    },
    [token, fieldKey, favorites.length, reload],
  );

  return {
    favorites,
    loading,
    reload,
    applyFavorite,
    saveFavorite,
    canSaveMore: favorites.length < MAX_NOTE_FAVORITES_PER_FIELD,
  };
}
