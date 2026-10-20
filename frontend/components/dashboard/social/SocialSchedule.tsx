"use client";

/**
 * Schedule (soc-23). Ready cards that have a time, by day, week, or month.
 * A blank day stays blank. Nothing here publishes.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadSocialBoard, peekSocialCards } from "./social-board-cache";
import {
  getSocialCardFileUrl,
  type SocialCard,
  type SocialCardFormat,
} from "./social-cards";

type ScheduleView = "calendar" | "list" | "gallery";
type CalendarSpan = "day" | "week" | "month";

const FORMAT_LABEL: Record<SocialCardFormat, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pickedCursor(value: string, span: CalendarSpan, cursor: Date): Date | null {
  if (span === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    const last = new Date(year, month, 0).getDate();
    return new Date(year, month - 1, Math.min(cursor.getDate(), last));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = new Date(year, month - 1, day);
  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) return null;
  return next;
}

function dayKeyFromIso(iso: string): string {
  return dayKey(new Date(iso));
}

function noonIso(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
}

function addMonths(date: Date, count: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), last));
  return next;
}

function weekTitle(start: Date): string {
  const end = addDays(start, 6);
  const month = (date: Date): string => date.toLocaleDateString(undefined, { month: "short" });
  const year = end.getFullYear();
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${month(start)} ${year}`;
  }
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)} ${year}`;
}

function spanTitle(cursor: Date, span: CalendarSpan): string {
  if (span === "week") return weekTitle(startOfWeek(cursor));
  if (span === "month") {
    return `${cursor.toLocaleDateString(undefined, { month: "long" })} ${cursor.getFullYear()}`;
  }
  const month = cursor.toLocaleDateString(undefined, { month: "short" });
  return `${WEEKDAYS[cursor.getDay()].slice(0, 3)} ${cursor.getDate()} ${month} ${cursor.getFullYear()}`;
}

function shiftCursor(cursor: Date, span: CalendarSpan, direction: -1 | 1): Date {
  if (span === "day") return addDays(cursor, direction);
  if (span === "week") return addDays(cursor, direction * 7);
  return addMonths(cursor, direction);
}

function monthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  for (let day = start; day.getTime() <= end.getTime(); day = addDays(day, 1)) days.push(day);
  return days;
}

function looksLikeVideo(url: string): boolean {
  try {
    return /\.(mp4|mov)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function SendNote({ card }: { card: SocialCard }): JSX.Element | null {
  if (card.stage === "posted") {
    return <span className="block text-xs text-muted-foreground">Posted</span>;
  }
  if (card.publishError === "not_connected") {
    return <span className="block text-xs text-destructive">Instagram is not connected.</span>;
  }
  if (card.publishError) {
    return <span className="block text-xs text-destructive">Could not post.</span>;
  }
  return null;
}

function TimedChip({
  card,
  onOpen,
}: {
  card: SocialCard;
  onOpen: (id: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-left hover:border-primary/40"
    >
      <span className="block text-xs text-muted-foreground">
        {timeLabel(card.scheduledAt as string)}
        {card.format ? ` · ${FORMAT_LABEL[card.format]}` : ""}
      </span>
      <span className="block truncate text-sm text-foreground">{card.title}</span>
      <SendNote card={card} />
    </button>
  );
}

function isReady(card: SocialCard): boolean {
  return card.stage === "ready" && card.hasFile;
}

function timedCards(cards: readonly SocialCard[]): SocialCard[] {
  return cards
    .filter(
      (card): card is SocialCard & { scheduledAt: string } =>
        Boolean(card.scheduledAt) && (isReady(card) || card.stage === "posted")
    )
    .slice()
    .sort((a, b) => (a.scheduledAt as string).localeCompare(b.scheduledAt as string));
}

function readyCards(cards: readonly SocialCard[]): SocialCard[] {
  return cards
    .filter(isReady)
    .slice()
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function SocialSchedule({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (id: string) => void;
}): JSX.Element {
  const [cards, setCards] = useState<SocialCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [span, setSpan] = useState<CalendarSpan>("week");
  const [view, setView] = useState<ScheduleView>("calendar");
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    let cancelled = false;
    const known = peekSocialCards(token);
    if (known) {
      setCards(known);
      setLoading(false);
    }
    loadSocialBoard(token)
      .then((next) => {
        if (!cancelled) setCards(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the schedule");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (view !== "gallery") return;
    let cancelled = false;
    for (const card of cards) {
      if (!isReady(card)) continue;
      void Promise.resolve()
        .then(() => getSocialCardFileUrl(token, card.id))
        .then((url) => {
          if (!cancelled && url) setPreviews((current) => ({ ...current, [card.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [view, token, cards]);

  if (error && cards.length === 0) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  const timed = timedCards(cards);
  const ready = readyCards(cards);
  const untimed = ready.filter((card) => !card.scheduledAt);
  const todayKey = dayKey(new Date());
  const visibleDays =
    span === "day" ? [cursor] : span === "week" ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)) : monthDays(cursor);
  const cardsOn = (day: Date): SocialCard[] =>
    timed.filter((card) => dayKeyFromIso(card.scheduledAt as string) === dayKey(day));
  const previousLabel = span === "day" ? "Previous day" : span === "week" ? "Previous week" : "Previous month";
  const nextLabel = span === "day" ? "Next day" : span === "week" ? "Next week" : "Next month";

  const byDay: { key: string; label: string; cards: SocialCard[] }[] = [];
  for (const card of timed) {
    const key = dayKeyFromIso(card.scheduledAt as string);
    const current = byDay[byDay.length - 1];
    if (!current || current.key !== key) {
      byDay.push({ key, label: dayLabel(card.scheduledAt as string), cards: [card] });
    } else {
      current.cards.push(card);
    }
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-3">
      {loading && cards.length === 0 ? (
        <p className="sr-only" role="status">
          Loading cards.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {view === "calendar" ? (
          <>
            <button
              type="button"
              aria-label={previousLabel}
              onClick={() => setCursor((current) => shiftCursor(current, span, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={nextLabel}
              onClick={() => setCursor((current) => shiftCursor(current, span, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <h2 className="px-2 text-sm font-medium text-foreground">{spanTitle(cursor, span)}</h2>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
              }}
              className="h-8 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted"
            >
              Today
            </button>
            <input
              type={span === "month" ? "month" : "date"}
              aria-label={span === "month" ? "Jump to a month" : "Jump to a date"}
              value={span === "month" ? dayKey(cursor).slice(0, 7) : dayKey(cursor)}
              onChange={(event) => {
                const next = pickedCursor(event.target.value, span, cursor);
                if (next) setCursor(next);
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            />
            <div className="ml-2 flex rounded-md border border-border p-0.5" role="group" aria-label="Calendar span">
              {(["day", "week", "month"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={span === item}
                  onClick={() => setSpan(item)}
                  className={cn(
                    "h-7 rounded px-2.5 text-sm capitalize",
                    span === item ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item === "day" ? "Day" : item === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <h2 className="px-2 text-sm font-medium text-foreground">Scheduled</h2>
        )}
        <div className="ml-auto flex rounded-md border border-border p-0.5" role="group" aria-label="Schedule view">
          {(["calendar", "list", "gallery"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
              className={cn(
                "h-7 rounded px-2.5 text-sm capitalize",
                view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item === "calendar" ? "Calendar" : item === "list" ? "List" : "Gallery"}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" && !loading && timed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is timed.</p>
      ) : null}
      {view !== "calendar" && loading && cards.length === 0 ? (
        <div aria-hidden="true" className="space-y-2">
          <div className="h-14 motion-safe:animate-pulse rounded-lg bg-muted" />
          <div className="h-14 w-4/5 motion-safe:animate-pulse rounded-lg bg-muted/70" />
        </div>
      ) : null}
      {view !== "calendar" && !loading && ready.length === 0 && timed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is ready.</p>
      ) : null}

      {view === "list" && (timed.length > 0 || untimed.length > 0) ? (
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
          {byDay.map((day) => (
            <section key={day.key} aria-label={day.label} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{day.label}</h3>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {day.cards.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(card.id)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-muted"
                    >
                      <span>
                        <span className="block text-sm text-foreground">{card.title}</span>
                        <SendNote card={card} />
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {card.format ? `${FORMAT_LABEL[card.format]} · ` : ""}
                        {timeLabel(card.scheduledAt as string)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {untimed.length > 0 ? (
            <section aria-label="No time" className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">No time</h3>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {untimed.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(card.id)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left hover:bg-muted"
                    >
                      <span>
                        <span className="block text-sm text-foreground">{card.title}</span>
                        <SendNote card={card} />
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {card.format ? FORMAT_LABEL[card.format] : "No format"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {view === "gallery" && ready.length > 0 ? (
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {ready.map((card) => {
            const preview = previews[card.id];
            const video = preview ? looksLikeVideo(preview) : false;
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onOpen(card.id)}
                  className="w-full overflow-hidden rounded-lg border border-border bg-card text-left hover:border-primary/40"
                >
                  <span className="block aspect-square bg-muted">
                    {preview && !video ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {preview && video ? (
                      <video src={preview} muted playsInline className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="block px-3 py-2">
                    <span className="block text-xs text-muted-foreground">
                      {card.scheduledAt ? timeLabel(card.scheduledAt) : "No time"}
                      {card.format ? ` · ${FORMAT_LABEL[card.format]}` : ""}
                    </span>
                    <span className="block truncate text-sm text-foreground">{card.title}</span>
                    <SendNote card={card} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {view === "calendar" && span !== "month" ? (
        <div className={cn("min-h-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card", span === "week" && "min-w-0")}>
          <div className={cn("grid h-full min-h-[24rem]", span === "week" ? "min-w-[48rem] grid-cols-7" : "grid-cols-1")}>
            {visibleDays.map((day) => {
              const key = dayKey(day);
              const isToday = key === todayKey;
              return (
                <section
                  key={key}
                  aria-label={dayLabel(noonIso(day))}
                  className="flex min-h-[24rem] flex-col border-l border-border first:border-l-0"
                >
                  <h3 className="flex flex-col items-center gap-1 px-1 py-2 text-xs text-muted-foreground">
                    {WEEKDAYS[day.getDay()].slice(0, 3)}
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
                        isToday ? "bg-primary font-medium text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </h3>
                  <ul className="flex flex-1 flex-col gap-1 px-1 pb-2">
                    {loading && cards.length === 0 ? (
                      <li aria-hidden="true" className="mx-0.5 h-8 motion-safe:animate-pulse rounded-md bg-muted" />
                    ) : null}
                    {cardsOn(day).map((card) => (
                      <li key={card.id}>
                        <TimedChip card={card} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "calendar" && span === "month" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
          <div className="grid min-w-[48rem] grid-cols-7 border-b border-border">
            {WEEKDAYS.map((name) => (
              <div key={name} className="px-1 py-2 text-center text-xs text-muted-foreground">
                {name.slice(0, 3)}
              </div>
            ))}
          </div>
          <div className="grid min-w-[48rem] grid-cols-7">
            {visibleDays.map((day) => {
              const key = dayKey(day);
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              return (
                <section
                  key={key}
                  aria-label={dayLabel(noonIso(day))}
                  className={cn(
                    "flex min-h-[6.5rem] flex-col border-b border-l border-border",
                    !inMonth && "bg-muted/40"
                  )}
                >
                  <h3 className="px-1 pt-1 text-center">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday
                          ? "bg-primary font-medium text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </h3>
                  <ul className="flex flex-col gap-1 px-1 pb-1">
                    {cardsOn(day).map((card) => (
                      <li key={card.id}>
                        <TimedChip card={card} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
