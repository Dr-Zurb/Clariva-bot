"use client";

import { useCallback, useEffect, useState } from "react";
import { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteFavorite,
  listFavorites,
  updateFavorite,
  type DoctorDrugFavorite,
} from "@/lib/api/doctor-drug-favorites";
import { formatFavoritePreview } from "@/lib/cockpit/favorite-preview";

export interface FavoritesSideSheetProps {
  token: string;
}

export function FavoritesSideSheet({ token }: FavoritesSideSheetProps) {
  const { close } = useSideSheet();
  const [favorites, setFavorites] = useState<DoctorDrugFavorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listFavorites(token);
      setFavorites(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSaveName(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusyId(id);
    try {
      await updateFavorite(token, id, { name: trimmed });
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update favorite");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete(id: string) {
    setBusyId(id);
    try {
      await deleteFavorite(token, id);
      setPendingDeleteId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete favorite");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Tap a chip in Plan to apply a favorite to the Rx.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => close()}>
          Close
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}

        {!isLoading && error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {!isLoading && !error && favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No favorites yet. Save one from any complete medicine row.
          </p>
        ) : null}

        {!isLoading && !error && favorites.length > 0 ? (
          <ul className="space-y-3">
            {favorites.map((fav) => (
              <li
                key={fav.id}
                className="rounded-md border border-border px-3 py-2"
                data-testid={`favorite-row-${fav.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {editingId === fav.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 max-w-[12rem] text-sm"
                          aria-label="Favorite name"
                          disabled={busyId === fav.id}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleSaveName(fav.id)}
                          disabled={busyId === fav.id || !editName.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          disabled={busyId === fav.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <p className="truncate text-sm font-medium">{fav.name}</p>
                    )}
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatFavoritePreview(fav.template)}
                    </p>
                  </div>

                  {editingId !== fav.id ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setEditingId(fav.id);
                          setEditName(fav.name);
                        }}
                        disabled={busyId === fav.id}
                      >
                        Edit name
                      </Button>
                      {pendingDeleteId === fav.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => void handleConfirmDelete(fav.id)}
                            disabled={busyId === fav.id}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setPendingDeleteId(null)}
                            disabled={busyId === fav.id}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive"
                          onClick={() => setPendingDeleteId(fav.id)}
                          disabled={busyId === fav.id}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export interface FavoritesSideSheetAnchorProps {
  token: string;
}

/**
 * Registers the rx-favorites side sheet with the shell anchor registry (rxf-04).
 * Mount once inside the cockpit Rx zone (e.g. `<RxWorkspace>`).
 */
export function FavoritesSideSheetAnchor({ token }: FavoritesSideSheetAnchorProps) {
  const sideSheet = useSideSheet();

  useEffect(() => {
    const unregister = sideSheet.register({
      id: "rx-favorites",
      title: "Medicine favorites",
      widthPct: 35,
      render: () => <FavoritesSideSheet token={token} />,
    });
    return unregister;
  }, [sideSheet, token]);

  return null;
}
