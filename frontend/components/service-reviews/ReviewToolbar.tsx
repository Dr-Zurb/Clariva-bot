"use client";

import { Rows3, Search } from "lucide-react";
import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type {
  ConfidenceFilter,
  ReviewDensity,
  SortMode,
} from "@/lib/service-reviews/filter-sort";
import { cn } from "@/lib/utils";

export interface ReviewToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  confidence: ConfidenceFilter;
  onConfidenceChange: (value: ConfidenceFilter) => void;
  sortMode: SortMode;
  onSortModeChange: (value: SortMode) => void;
  density: ReviewDensity;
  onDensityChange: (value: ReviewDensity) => void;
  /** Sort applies to pending rows; hide on resolved tabs if desired. */
  showSort?: boolean;
  searchInputRef?: RefObject<HTMLInputElement>;
}

export function ReviewToolbar({
  query,
  onQueryChange,
  confidence,
  onConfidenceChange,
  sortMode,
  onSortModeChange,
  density,
  onDensityChange,
  showSort = true,
  searchInputRef,
}: ReviewToolbarProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end"
      role="search"
      aria-label="Filter and sort reviews"
    >
      <div className="min-w-[12rem] flex-1 space-y-1.5">
        <Label htmlFor="review-search" className="text-xs text-muted-foreground">
          Search
        </Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            id="review-search"
            type="search"
            placeholder="Patient or service…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-confidence" className="text-xs text-muted-foreground">
          Confidence
        </Label>
        <Select
          value={confidence}
          onValueChange={(v) => onConfidenceChange(v as ConfidenceFilter)}
        >
          <SelectTrigger id="review-confidence" className="w-[9.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="high">High only</SelectItem>
            <SelectItem value="medium">Medium only</SelectItem>
            <SelectItem value="low">Low only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showSort && (
        <div className="space-y-1.5">
          <Label htmlFor="review-sort" className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select value={sortMode} onValueChange={(v) => onSortModeChange(v as SortMode)}>
            <SelectTrigger id="review-sort" className="w-[10.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">Most urgent</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="confidence">Confidence</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="block text-xs text-muted-foreground">Density</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9 gap-1.5", density === "compact" && "bg-accent")}
          aria-pressed={density === "compact"}
          onClick={() =>
            onDensityChange(density === "comfortable" ? "compact" : "comfortable")
          }
        >
          <Rows3 aria-hidden="true" />
          {density === "compact" ? "Compact" : "Comfortable"}
        </Button>
      </div>
    </div>
  );
}
