"use client";

import type { DoctorNoteFavorite } from "@/lib/api/note-favorites";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NoteFavoritesChipStripProps {
  favorites: DoctorNoteFavorite[];
  disabled?: boolean;
  canSaveCurrent?: boolean;
  onApply: (value: string) => void;
  onSaveCurrent?: () => void;
  /** Shown when no doctor favourites exist yet. */
  fallbackChips?: string[];
  onApplyFallback?: (value: string) => void;
  ariaLabel?: string;
}

export function NoteFavoritesChipStrip({
  favorites,
  disabled = false,
  canSaveCurrent = false,
  onApply,
  onSaveCurrent,
  fallbackChips = [],
  onApplyFallback,
  ariaLabel = "Favourite phrases",
}: NoteFavoritesChipStripProps) {
  const showFavorites = favorites.length > 0;
  const showFallback = !showFavorites && fallbackChips.length > 0;

  if (!showFavorites && !showFallback && !canSaveCurrent) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={ariaLabel}
      data-testid="note-favorites-chip-strip"
    >
      {showFavorites
        ? favorites.map((fav) => (
            <button
              key={fav.id}
              type="button"
              disabled={disabled}
              onClick={() => onApply(fav.value)}
              className={cn(
                "min-h-9 rounded-full border border-border bg-background px-3 text-xs",
                "font-medium text-foreground hover:bg-muted disabled:opacity-50",
              )}
              aria-label={`Insert favourite ${fav.value}`}
            >
              {fav.value}
            </button>
          ))
        : null}

      {showFallback
        ? fallbackChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              aria-label={`Insert ${chip}`}
              onClick={() => onApplyFallback?.(chip)}
              className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
            >
              {chip}
            </button>
          ))
        : null}

      {canSaveCurrent && onSaveCurrent ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-xs"
          disabled={disabled}
          onClick={onSaveCurrent}
          data-testid="note-favorites-save-current"
        >
          + Save
        </Button>
      ) : null}
    </div>
  );
}
