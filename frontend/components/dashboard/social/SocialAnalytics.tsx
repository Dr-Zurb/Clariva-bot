"use client";

/**
 * Analytics. Clinic numbers for the selected period.
 * Instagram's own view counts are a later phase.
 */

import { useLayoutEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  insightsRangeFromDays,
  INSIGHTS_RANGE_PRESETS,
  type InsightsRangeDays,
} from "@/components/dashboard/insights/InsightsRangeControl";
import { loadSocialAnalytics, peekSocialAnalytics } from "./social-analytics-cache";
import {
  createSocialCard,
  reuseSocialCard,
  type SocialAnalyticsPost,
  type SocialAnalyticsReport,
  type SocialCardFormat,
  type SocialCountPair,
} from "./social-cards";

const FORMAT_LABEL: Record<SocialCardFormat, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
};

function bookingLabel(count: number): string {
  return count === 1 ? "1 booking" : `${count} bookings`;
}

function changeLabel(pair: SocialCountPair): string {
  const delta = pair.value - pair.previous;
  if (delta === 0) return "Same as the previous period";
  return delta > 0 ? `Up ${delta}` : `Down ${Math.abs(delta)}`;
}

function shortDate(ymd: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, month, day] = ymd.split("-").map(Number);
  return `${day} ${months[(month ?? 1) - 1]}`;
}

function Tile({
  label,
  pair,
  suffix,
}: {
  label: string;
  pair: SocialCountPair;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium text-foreground">
        {pair.value}
        {suffix ?? ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{changeLabel(pair)}</p>
    </div>
  );
}

function Chart({ days, showViews }: { days: SocialAnalyticsReport["days"]; showViews: boolean }): JSX.Element {
  return (
    <div className="h-56 w-full" aria-label="Posts, enquiries, and bookings">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(label) => shortDate(String(label))}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          <Bar dataKey="posts" name="Posts" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} />
          <Line dataKey="enquiries" name="Enquiries" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
          <Line dataKey="bookings" name="Bookings" stroke="hsl(var(--foreground))" dot={false} strokeWidth={2} />
          {showViews ? (
            <Line dataKey="views" name="Views" stroke="hsl(var(--ring))" dot={false} strokeWidth={2} connectNulls={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function measured(value: number | null | undefined, label: string): string | null {
  if (value == null) return null;
  return `${value} ${label}`;
}

function PostRow({
  post,
  busy,
  showInstagram,
  onReuse,
}: {
  post: SocialAnalyticsPost;
  busy: boolean;
  showInstagram: boolean;
  onReuse: (id: string) => void;
}): JSX.Element {
  return (
    <li className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        {post.thumbUrl ? (
          <img src={post.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">{post.title}</h3>
            {post.format || post.bookings > 0 ? (
              <p className="shrink-0 text-right text-sm text-muted-foreground">
                {post.format ? <span className="block">{FORMAT_LABEL[post.format]}</span> : null}
                {showInstagram ? (
                  <>
                    {measured(post.views, "views") ? <span className="block">{measured(post.views, "views")}</span> : null}
                    {measured(post.likes, "likes") ? <span className="block">{measured(post.likes, "likes")}</span> : null}
                    {measured(post.comments, "comments") ? <span className="block">{measured(post.comments, "comments")}</span> : null}
                    {measured(post.saves, "saves") ? <span className="block">{measured(post.saves, "saves")}</span> : null}
                  </>
                ) : null}
                {post.bookings > 0 ? <span className="block">{bookingLabel(post.bookings)}</span> : null}
              </p>
            ) : null}
          </div>
          {post.topic ? <p className="text-sm text-muted-foreground">{post.topic}</p> : null}
          {post.caption ? <p className="text-sm text-muted-foreground">{post.caption}</p> : null}
          <div className="mt-2 flex items-center justify-between gap-3">
            {post.instagramUrl ? (
              <a
                href={post.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-foreground hover:underline"
              >
                Open on Instagram
              </a>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => onReuse(post.id)}
              disabled={busy}
              className="text-sm text-foreground disabled:opacity-50"
            >
              Use again
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function PeriodSwitch({
  days,
  onDays,
}: {
  days: InsightsRangeDays;
  onDays: (days: InsightsRangeDays) => void;
}): JSX.Element {
  return (
    <div role="group" aria-label="Period" className="inline-flex items-center gap-1 rounded-md border border-input bg-background p-0.5">
      {INSIGHTS_RANGE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={days === preset}
          onClick={() => onDays(preset)}
          className={cn(
            "h-7 min-w-[2.75rem] rounded-[5px] px-2.5 text-xs font-medium",
            days === preset ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          )}
        >
          {preset}d
        </button>
      ))}
    </div>
  );
}

function AnalyticsSkeleton({
  days,
  onDays,
}: {
  days: InsightsRangeDays;
  onDays: (days: InsightsRangeDays) => void;
}): JSX.Element {
  return (
    <div className="space-y-6 px-1 py-2" aria-busy="true">
      <PeriodSwitch days={days} onDays={onDays} />
      <p className="sr-only" role="status">
        Loading analytics.
      </p>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {["Enquiries", "Bookings", "Conversion", "Posts"].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-2 h-8 w-16 motion-safe:animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-24 motion-safe:animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="h-56 motion-safe:animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

export function SocialAnalytics({
  token,
  onUsed,
}: {
  token: string;
  onUsed: (id: string) => void;
}): JSX.Element {
  const [days, setDays] = useState<InsightsRangeDays>(30);
  const range = insightsRangeFromDays(days);
  const [report, setReport] = useState<SocialAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingSentence, setSavingSentence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "bookings" | "views">("newest");

  useLayoutEffect(() => {
    let cancelled = false;
    const known = peekSocialAnalytics(token, range.from, range.to);
    if (known) {
      setReport(known);
      setLoading(false);
    } else {
      setReport(null);
      setLoading(true);
    }
    setError(null);
    loadSocialAnalytics(token, range.from, range.to, { fresh: Boolean(known) })
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, range.from, range.to]);

  async function addThought(title: string): Promise<void> {
    if (busyId || savingSentence) return;
    setSavingSentence(true);
    setError(null);
    try {
      const card = await createSocialCard(token, title, "thoughts");
      onUsed(card.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the idea");
      setSavingSentence(false);
    }
  }

  async function reuse(id: string): Promise<void> {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const card = await reuseSocialCard(token, id);
      onUsed(card.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not copy the card");
      setBusyId(null);
    }
  }

  if (loading && !report) return <AnalyticsSkeleton days={days} onDays={setDays} />;
  if (error && !report) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (!report) return <AnalyticsSkeleton days={days} onDays={setDays} />;

  const showInstagram = Boolean(report.instagram);
  const posts =
    sort === "bookings"
      ? [...report.posts].sort((a, b) => b.bookings - a.bookings || b.date.localeCompare(a.date))
      : sort === "views"
        ? [...report.posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.date.localeCompare(a.date))
        : report.posts;
  const grouped =
    sort === "newest"
      ? posts.reduce<{ date: string; day: string; posts: SocialAnalyticsPost[] }[]>((daysSoFar, post) => {
          const last = daysSoFar[daysSoFar.length - 1];
          if (last && last.date === post.date) last.posts.push(post);
          else daysSoFar.push({ date: post.date, day: post.day, posts: [post] });
          return daysSoFar;
        }, [])
      : [];
  const peak = Math.max(1, ...report.rhythm.weeks.map((week) => week.posts));

  return (
    <div className="space-y-6 px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <PeriodSwitch days={days} onDays={setDays} />
      </div>

      {report.sentence ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground">{report.sentence.text}</p>
          {report.sentence.title ? (
            <button
              type="button"
              onClick={() => {
                const title = report.sentence?.title;
                if (title) void addThought(title);
              }}
              disabled={savingSentence || Boolean(busyId)}
              className="text-sm text-foreground disabled:opacity-50"
            >
              Add to Thoughts
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Enquiries" pair={report.tiles.enquiries} />
        <Tile label="Bookings" pair={report.tiles.bookings} />
        {report.tiles.conversion ? <Tile label="Conversion" pair={report.tiles.conversion} suffix="%" /> : null}
        <Tile label="Posts" pair={report.tiles.posts} />
      </div>

      {report.instagram ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {report.instagram.tiles.views ? <Tile label="Views" pair={report.instagram.tiles.views} /> : null}
          {report.instagram.tiles.reach ? <Tile label="Reach" pair={report.instagram.tiles.reach} /> : null}
          {report.instagram.tiles.interactions ? <Tile label="Interactions" pair={report.instagram.tiles.interactions} /> : null}
          {report.instagram.tiles.followers ? <Tile label="Followers gained" pair={report.instagram.tiles.followers} /> : null}
        </div>
      ) : null}

      {report.days.length > 0 ? <Chart days={report.days} showViews={showInstagram} /> : null}

      {report.best.length > 0 ? (
        <section className="space-y-2" aria-label="Best posts">
          <p className="text-sm font-medium text-foreground">Best posts</p>
          <ul className="grid gap-3 md:grid-cols-3">
            {report.best.map((post) => (
              <li key={post.id} className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-sm font-medium text-foreground">{post.title}</p>
                <p className="text-sm text-muted-foreground">
                  {post.bookings > 0
                    ? bookingLabel(post.bookings)
                    : post.enquiries > 0
                      ? `${post.enquiries} enquiries`
                      : post.views != null
                        ? `${post.views} views`
                        : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.formats.length > 0 ? (
        <section className="space-y-2" aria-label="By format">
          <p className="text-sm font-medium text-foreground">By format</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Format</th>
                <th className="py-1 font-medium">Posts</th>
                <th className="py-1 font-medium">Bookings</th>
                {showInstagram ? <th className="py-1 font-medium">Average views</th> : null}
              </tr>
            </thead>
            <tbody>
              {report.formats.map((row) => (
                <tr key={row.format} className="border-t border-border">
                  <td className="py-1">{FORMAT_LABEL[row.format]}</td>
                  <td className="py-1">{row.posts}</td>
                  <td className="py-1">{row.bookings}</td>
                  {showInstagram ? <td className="py-1">{row.views == null ? "" : row.views}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {report.topics.length > 0 ? (
        <section className="space-y-2" aria-label="By topic">
          <p className="text-sm font-medium text-foreground">By topic</p>
          <table className="w-full text-sm">
            <tbody>
              {report.topics.map((row) => (
                <tr key={row.topic} className="border-t border-border">
                  <td className="py-1">{row.topic}</td>
                  <td className="py-1 text-muted-foreground">
                    {row.posts === 1 ? "1 post" : `${row.posts} posts`}
                  </td>
                  <td className="py-1 text-muted-foreground">
                    {row.bookings > 0 ? bookingLabel(row.bookings) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {report.rhythm.weeks.length > 0 ? (
        <section className="space-y-2" aria-label="Posting rhythm">
          <p className="text-sm font-medium text-foreground">Posting rhythm</p>
          {report.rhythm.usual ? (
            <p className="text-sm text-muted-foreground">
              Usually {report.rhythm.usual.weekday} at {report.rhythm.usual.hour}
            </p>
          ) : null}
          <div className="grid grid-cols-8 gap-2">
            {report.rhythm.weeks.map((week) => (
              <div key={week.label} className="flex flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end">
                  <div
                    className="w-full rounded-sm bg-muted-foreground/40"
                    style={{ height: `${Math.max(4, (week.posts / peak) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{week.label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {posts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          Nothing has been posted.
        </div>
      ) : (
        <section className="space-y-3" aria-label="Posts">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">Posts</p>
            <div role="group" aria-label="Sort posts" className="inline-flex gap-2">
              <button
                type="button"
                aria-pressed={sort === "newest"}
                onClick={() => setSort("newest")}
                className="text-sm text-foreground"
              >
                Newest
              </button>
              <button
                type="button"
                aria-pressed={sort === "bookings"}
                onClick={() => setSort("bookings")}
                className="text-sm text-foreground"
              >
                By bookings
              </button>
              {showInstagram ? (
                <button
                  type="button"
                  aria-pressed={sort === "views"}
                  onClick={() => setSort("views")}
                  className="text-sm text-foreground"
                >
                  By views
                </button>
              ) : null}
            </div>
          </div>
          {sort === "newest" ? (
            grouped.map((day) => (
              <section key={day.date} className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">{day.day}</h2>
                <ul className="space-y-3">
                  {day.posts.map((post) => (
                    <PostRow key={post.id} post={post} busy={busyId === post.id} showInstagram={showInstagram} onReuse={(id) => void reuse(id)} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className="space-y-3">
              {posts.map((post) => (
                <PostRow key={post.id} post={post} busy={busyId === post.id} showInstagram={showInstagram} onReuse={(id) => void reuse(id)} />
              ))}
            </ul>
          )}
        </section>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
