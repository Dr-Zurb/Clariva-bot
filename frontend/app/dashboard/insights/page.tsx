/**
 * Insights — placeholder page (sidebar-restructure batch, sr-01 / DL-3).
 *
 * Deliberately empty. The URL is staked so the sidebar entry has a
 * destination; widgets / KPIs / source mix land in a separate plan once
 * a doctor asks for them (see Product plans/plan-sidebar-restructure.md
 * § S4.1).
 *
 * @see docs/Work/Product plans/plan-sidebar-restructure.md § DL-3
 */
export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-foreground">Insights</h1>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  );
}
