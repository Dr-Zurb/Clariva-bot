import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface InboxColumnProps {
  token: string;
}

/**
 * Inbox column — C4 fills the body (DoctorDashboardEventFeed moves here).
 *
 * C1 ships a labelled skeleton. The `id="notifications"` attribute is
 * preserved for legacy deep links to `/dashboard#notifications` (e.g. old
 * bookmarks). The header bell now links to `/dashboard/alerts`.
 */
export function InboxColumn({ token: _token }: InboxColumnProps) {
  return (
    <Card id="notifications" className="scroll-mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase text-muted-foreground tracking-wide">
          Inbox
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-48 w-full" aria-label="Inbox column — coming in C4" />
      </CardContent>
    </Card>
  );
}
