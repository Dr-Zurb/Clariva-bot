"use client";

import { useEffect } from "react";
import type { DoctorDrugFavorite } from "@/lib/api/doctor-drug-favorites";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackCockpitV2RRxPolishFavoritesLanded } from "@/lib/patient-profile/telemetry";

const COLD_START_HINT =
  "⭐ Save medicines you prescribe often as one-tap chips.";

export interface FavoritesChipStripProps {
  favorites: DoctorDrugFavorite[];
  canSaveCurrent?: boolean;
  onApply: (fav: DoctorDrugFavorite) => void;
  onSaveCurrentRow: () => void;
  onManage: () => void;
}

export function FavoritesChipStrip({
  favorites,
  canSaveCurrent = false,
  onApply,
  onSaveCurrentRow,
  onManage,
}: FavoritesChipStripProps) {
  const isColdStart = favorites.length === 0;

  useEffect(() => {
    trackCockpitV2RRxPolishFavoritesLanded({ favoritesCount: favorites.length });
  }, [favorites.length]);

  return (
    <div
      className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5"
      data-testid="favorites-chip-strip"
    >
      <span className="shrink-0 text-sm" aria-hidden>
        ⭐
      </span>

      {isColdStart ? (
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {COLD_START_HINT}
        </p>
      ) : (
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {favorites.map((fav) => (
            <button
              key={fav.id}
              type="button"
              onClick={() => onApply(fav)}
              className={cn(
                "shrink-0 rounded-full border border-border bg-background px-3 py-1",
                "text-xs font-medium text-foreground hover:bg-muted",
              )}
              aria-label={`Apply favorite ${fav.name}`}
            >
              {fav.name}
            </button>
          ))}
        </div>
      )}

      {canSaveCurrent ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 h-7 text-xs"
          onClick={onSaveCurrentRow}
          data-testid="favorites-save-current"
        >
          + Save current row
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 h-7 text-xs"
        onClick={onManage}
        data-testid="favorites-manage"
      >
        Manage
      </Button>
    </div>
  );
}
