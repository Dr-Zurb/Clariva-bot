"use client";

import Link from "next/link";
import {
  CalendarDays,
  CreditCard,
  FileUp,
  MessageCircle,
  Pill,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { PatientActivityKind, PatientActivityRow } from "@/types/patient";
import { OverviewCardFrame } from "./OverviewCardFrame";
import {
  activityDateGroup,
  activityTimeAgo,
  type ActivityDateGroup,
} from "./overview-utils";

interface RecentActivityCardProps {
  activity: PatientActivityRow[] | undefined;
}

const ACTIVITY_ICONS: Record<PatientActivityKind, LucideIcon> = {
  visit: CalendarDays,
  message: MessageCircle,
  prescription: Pill,
  payment: CreditCard,
  no_show: UserX,
  file_upload: FileUp,
};

const GROUP_ORDER: ActivityDateGroup[] = [
  "Today",
  "Yesterday",
  "This week",
  "Earlier",
];

function groupActivities(rows: PatientActivityRow[]): Map<ActivityDateGroup, PatientActivityRow[]> {
  const map = new Map<ActivityDateGroup, PatientActivityRow[]>();
  for (const row of rows.slice(0, 10)) {
    const group = activityDateGroup(row.occurred_at);
    const list = map.get(group) ?? [];
    list.push(row);
    map.set(group, list);
  }
  return map;
}

export function RecentActivityCard({ activity }: RecentActivityCardProps) {
  const rows = activity ?? [];
  const grouped = groupActivities(rows);

  return (
    <OverviewCardFrame title="Recent activity">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent activity.</p>
      ) : (
        <div className="space-y-3">
          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group);
            if (!items?.length) return null;
            return (
              <div key={group}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group}</p>
                <ul className="space-y-2">
                  {items.map((row, i) => {
                    const Icon = ACTIVITY_ICONS[row.kind];
                    const content = (
                      <div className="flex gap-2 text-sm">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug">{row.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {activityTimeAgo(row.occurred_at)}
                          </p>
                        </div>
                      </div>
                    );

                    return (
                      <li key={`${row.kind}-${row.occurred_at}-${i}`}>
                        {row.href ? (
                          <Link
                            href={row.href}
                            className="block rounded-md transition-colors hover:bg-muted/50"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </OverviewCardFrame>
  );
}
