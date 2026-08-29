/**
 * Interactions Inbox (ibi-16) — funnel rail + filterable feed.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  emptyInteractionStageCounts,
  getDoctorSettings,
  getInteractions,
  getServiceStaffReviews,
} from "@/lib/api";
import { InboxClient } from "@/components/inbox/InboxClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requireDashboardAuth } from "@/lib/auth/server-user";
import { inboxDateBounds } from "@/lib/inbox/date-window";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inbox" };
export const maxDuration = 60;

type SearchParams = Promise<{ filter?: string }> | { filter?: string };

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const { token } = await requireDashboardAuth();
  const sp = searchParams ? await Promise.resolve(searchParams) : {};
  const rawFilter = typeof sp.filter === "string" ? sp.filter : "";
  const initialNeedsReviewOpen = rawFilter === "needs_review";

  const bounds = inboxDateBounds("30d");

  let errorMessage: string | null = null;
  let interactions: Awaited<
    ReturnType<typeof getInteractions>
  >["data"]["interactions"] = [];
  let counts = emptyInteractionStageCounts();
  let nextCursor: string | null = null;
  let reviews: Awaited<
    ReturnType<typeof getServiceStaffReviews>
  >["data"]["reviews"] = [];
  let settings: Awaited<
    ReturnType<typeof getDoctorSettings>
  >["data"]["settings"] | null = null;

  try {
    const [interactionsRes, reviewsRes, settingsRes] = await Promise.all([
      getInteractions(token, {
        scope: "signal",
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        limit: 50,
      }),
      getServiceStaffReviews(token, "pending"),
      getDoctorSettings(token),
    ]);
    interactions = interactionsRes.data.interactions;
    counts = interactionsRes.data.counts ?? emptyInteractionStageCounts();
    nextCursor = interactionsRes.data.nextCursor ?? null;
    reviews = reviewsRes.data.reviews;
    settings = settingsRes.data.settings;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status: number }).status
        : 500;
    if (status === 401) redirect("/login");
    errorMessage =
      err instanceof Error ? err.message : "Unable to load inbox. Please try again.";
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertTitle>Couldn&apos;t load inbox</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{errorMessage}</span>
          <Link
            href="/dashboard/inbox"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "self-start sm:self-center"
            )}
          >
            Try again
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[28rem] flex-col gap-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Leads and chats from comment to booking — read-only. The AI receptionist
          stays in control.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <InboxClient
          token={token}
          initialNeedsReviewOpen={initialNeedsReviewOpen}
          initialInteractions={interactions}
          initialCounts={counts}
          initialNextCursor={nextCursor}
          initialReviews={reviews}
          settings={settings}
        />
      </div>
    </div>
  );
}
