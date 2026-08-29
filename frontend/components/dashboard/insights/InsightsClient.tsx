"use client";

/**
 * Insights shell: Practice health | Posts tabs (pca-02).
 */

import { useState } from "react";
import { PracticeHealthOverview } from "./PracticeHealthOverview";
import { PostsFunnel } from "./PostsFunnel";
import {
  InsightsRangeControl,
  InsightsRangeProvider,
} from "./InsightsRangeControl";
import { cn } from "@/lib/utils";

type InsightsTab = "practice" | "posts";

export function InsightsClient({ token }: { token: string }): JSX.Element {
  const [tab, setTab] = useState<InsightsTab>("practice");

  return (
    <InsightsRangeProvider>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Practice health and which posts convert to appointments.
            </p>
          </div>
          <InsightsRangeControl />
        </div>

        <div
          role="tablist"
          aria-label="Insights sections"
          className="flex flex-wrap gap-2 border-b border-border pb-2"
        >
          {(
            [
              ["practice", "Practice"],
              ["posts", "Posts"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "practice" ? (
          <PracticeHealthOverview token={token} embedded />
        ) : (
          <PostsFunnel token={token} />
        )}
      </div>
    </InsightsRangeProvider>
  );
}
