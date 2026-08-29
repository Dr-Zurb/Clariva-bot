"use client";

/**
 * Telehealth quality widget (insights-v1 · ins-05).
 *
 * Modality mix, join-success rate, mid-call switches, and video/voice
 * call-quality percentiles. Aggregate-only — never session/sample rows.
 * INS-D6: CSS bars only (no new chart dependency).
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTelehealthQualityQuery } from "@/hooks/queries/useTelehealthQualityQuery";
import type { CallQualitySummary, TelehealthQualityOverview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useInsightsRange } from "./InsightsRangeControl";
import { formatRatePercent } from "./PracticeHealthOverview";

const MODALITY_ORDER = ["video", "voice", "text"] as const;

const MODALITY_LABELS: Record<(typeof MODALITY_ORDER)[number], string> = {
  video: "Video",
  voice: "Voice",
  text: "Text",
};

function formatMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

function formatPacketLoss(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}%`;
}

function QualityBlock({
  title,
  summary,
  isLoading,
}: {
  title: string;
  summary: CallQualitySummary | undefined;
  isLoading: boolean;
}): JSX.Element {
  return (
    <div aria-label={title}>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {isLoading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      ) : (
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">p50 RTT</dt>
            <dd className="tabular-nums font-medium text-foreground">
              {formatMs(summary?.p50Rtt ?? null)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">p95 RTT</dt>
            <dd className="tabular-nums font-medium text-foreground">
              {formatMs(summary?.p95Rtt ?? null)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Avg packet loss</dt>
            <dd className="tabular-nums font-medium text-foreground">
              {formatPacketLoss(summary?.avgPacketLoss ?? null)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function sessionTotal(mix: TelehealthQualityOverview["modalityMix"]): number {
  return mix.text + mix.voice + mix.video;
}

interface TelehealthQualityProps {
  token: string;
}

export function TelehealthQuality({
  token,
}: TelehealthQualityProps): JSX.Element {
  const { range } = useInsightsRange();
  const query = useTelehealthQualityQuery(token, {
    from: range.from,
    to: range.to,
  });

  const data = query.data;
  const isLoading = (query.isLoading || query.isFetching) && !data;

  const isEmpty = Boolean(data && sessionTotal(data.modalityMix) === 0);

  const maxModality = useMemo(() => {
    if (!data) return 0;
    return Math.max(
      data.modalityMix.video,
      data.modalityMix.voice,
      data.modalityMix.text,
    );
  }, [data]);

  return (
    <section className="space-y-3" aria-label="Telehealth quality">
      <div>
        <h2 className="text-base font-medium text-foreground">
          Telehealth quality
        </h2>
        <p className="text-sm text-muted-foreground">
          Modality mix, join success, and call quality over the last{" "}
          {range.days} days
        </p>
      </div>

      {isEmpty ? (
        <p
          className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
          data-testid="telehealth-empty-state"
        >
          No telehealth sessions in range
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">
                Modality mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3 py-1">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-5/6" />
                  <Skeleton className="h-7 w-2/3" />
                </div>
              ) : (
                <ul className="space-y-3" aria-label="Telehealth modality mix">
                  {MODALITY_ORDER.map((key) => {
                    const count = data?.modalityMix[key] ?? 0;
                    const widthPct =
                      maxModality > 0
                        ? Math.max(4, Math.round((count / maxModality) * 100))
                        : 0;
                    return (
                      <li key={key} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {MODALITY_LABELS[key]}
                          </span>
                          <span className="tabular-nums font-semibold text-foreground">
                            {count}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full bg-primary transition-[width]",
                            )}
                            style={{ width: `${widthPct}%` }}
                            data-testid={`telehealth-bar-${key}`}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">
                Join & switches
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3 py-1">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ) : (
                <dl className="space-y-4" aria-label="Join success and switches">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Join success
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">
                      {data
                        ? formatRatePercent(data.joinSuccessRate)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Upgrades
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">
                      {data?.switches.upgrades ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Downgrades
                    </dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">
                      {data?.switches.downgrades ?? "—"}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">
                Call quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <QualityBlock
                  title="Video"
                  summary={data?.quality.video}
                  isLoading={isLoading}
                />
                <QualityBlock
                  title="Voice"
                  summary={data?.quality.voice}
                  isLoading={isLoading}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
