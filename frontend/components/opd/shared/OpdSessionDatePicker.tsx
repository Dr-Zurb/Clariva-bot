"use client";

/**
 * OPD session date control — larger trigger + custom month popover with Today.
 * Replaces the tiny native <input type="date"> in queue/slot toolbars.
 */

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addLocalIsoDays,
  formatLocalIsoDate,
  formatOpdSessionDateLabel,
  parseLocalIsoDate,
  todayLocalIso,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export interface OpdSessionDatePickerProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

function buildMonthCells(month: Date): Array<{ iso: string; inMonth: boolean }> {
  const first = startOfMonth(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const cells: Array<{ iso: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    cells.push({
      iso: formatLocalIsoDate(day),
      inMonth: day.getMonth() === month.getMonth(),
    });
  }
  return cells;
}

export function OpdSessionDatePicker({
  value,
  onChange,
  className,
}: OpdSessionDatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = parseLocalIsoDate(value) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected));

  useEffect(() => {
    if (!open) return;
    const next = parseLocalIsoDate(value);
    if (next) setVisibleMonth(startOfMonth(next));
  }, [open, value]);

  const today = todayLocalIso();
  const label = formatOpdSessionDateLabel(value);
  const cells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const monthTitle = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const selectDate = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const goToday = () => {
    const iso = todayLocalIso();
    setVisibleMonth(startOfMonth(new Date()));
    selectDate(iso);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label="Previous day"
        onClick={() => onChange(addLocalIsoDays(value, -1))}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 min-w-[10.5rem] justify-start gap-2 px-3 text-sm font-medium"
            aria-label={`Session date, ${label}`}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[16.5rem] space-y-2 p-2.5">
          <div className="flex items-center justify-between gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() - 1,
                    1,
                    12,
                    0,
                    0,
                    0,
                  ),
                )
              }
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <p className="text-xs font-semibold tabular-nums">{monthTitle}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() + 1,
                    1,
                    12,
                    0,
                    0,
                    0,
                  ),
                )
              }
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ iso, inMonth }) => {
              const isSelected = iso === value;
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDate(iso)}
                  aria-label={iso}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    !inMonth && "text-muted-foreground/50",
                    isSelected &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    !isSelected && isToday && "border border-primary/40 font-semibold",
                  )}
                >
                  {parseLocalIsoDate(iso)?.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-[11px] text-muted-foreground tabular-nums">{value}</p>
            <Button
              type="button"
              variant={value === today ? "secondary" : "default"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={goToday}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label="Next day"
        onClick={() => onChange(addLocalIsoDays(value, 1))}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
