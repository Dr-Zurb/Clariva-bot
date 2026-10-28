"use client";

/**
 * Insights shell: practice health. The posts funnel stays in the repo
 * and is not shown while review covers posting only.
 */

import { PracticeHealthOverview } from "./PracticeHealthOverview";
import {
  InsightsRangeControl,
  InsightsRangeProvider,
} from "./InsightsRangeControl";

export function InsightsClient({ token }: { token: string }): JSX.Element {
  return (
    <InsightsRangeProvider>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">Practice health.</p>
          </div>
          <InsightsRangeControl />
        </div>

        <PracticeHealthOverview token={token} embedded />
      </div>
    </InsightsRangeProvider>
  );
}
