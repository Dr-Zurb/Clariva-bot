"use client";

/**
 * Post conversion leaderboard (pca-02) — aggregate-only Insights surface.
 */

import { useEffect, useState } from "react";
import {
  getPostFunnelOverview,
  type PostFunnelOverview,
  type PostFunnelRow,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInsightsRange } from "./InsightsRangeControl";

function shortMediaId(id: string): string {
  if (id.length <= 12) return id;
  return `…${id.slice(-10)}`;
}

function pct(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

function channelBadge(platform: PostFunnelRow["platform"]): string {
  return platform === "facebook" ? "FB" : "IG";
}

export function PostsFunnel({ token }: { token: string }): JSX.Element {
  const { range } = useInsightsRange();
  const [data, setData] = useState<PostFunnelOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<"all" | "instagram" | "facebook">(
    "all"
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getPostFunnelOverview(token, {
      from: range.from,
      to: range.to,
      platform: platform === "all" ? undefined : platform,
    })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Unable to load post funnel."
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, range.from, range.to, platform]);

  return (
    <div className="space-y-4" data-testid="posts-funnel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Channel
        </span>
        {(
          [
            ["all", "All"],
            ["instagram", "IG"],
            ["facebook", "FB"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPlatform(id)}
            className={
              platform === id
                ? "rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                : "rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && data && (
        <>
          <section
            aria-label="Appointment sources"
            className="grid gap-3 sm:grid-cols-2"
          >
            <div className="rounded-md border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From comments
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {data.sourceSplit.commentAttributed}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.sourceSplit.paidCommentAttributed} paid
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Direct DMs
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {data.sourceSplit.directDm}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.sourceSplit.paidDirectDm} paid
              </p>
            </div>
          </section>

          <section aria-label="Posts leaderboard">
            <h2 className="text-sm font-semibold text-foreground">
              Posts that convert
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ranked by appointments in this window. Post titles arrive in a later
              update — IDs identify the media for now.
            </p>

            {data.posts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No comment leads with a linked post in this range.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Post</th>
                      <th className="px-3 py-2 font-medium text-right">Leads</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Interested
                      </th>
                      <th className="px-3 py-2 font-medium text-right">DMs</th>
                      <th className="px-3 py-2 font-medium text-right">Appts</th>
                      <th className="px-3 py-2 font-medium text-right">Paid</th>
                      <th className="px-3 py-2 font-medium text-right">Conv%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.posts.map((row) => (
                      <tr key={`${row.platform}-${row.mediaId}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {channelBadge(row.platform)}
                            </Badge>
                            <span
                              className="font-mono text-xs text-foreground"
                              title={row.mediaId}
                            >
                              {shortMediaId(row.mediaId)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.leads}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.interested}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.dms}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {row.appointments}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.paid}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {pct(row.conversionRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
