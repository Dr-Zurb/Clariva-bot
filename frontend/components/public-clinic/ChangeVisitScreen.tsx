import Link from "next/link";
import { formatDate, formatTime } from "@/lib/format-date";
import {
  clinicDisplayName,
  PublicClinicFrame,
} from "@/components/public-clinic/PublicClinicFrame";

export interface ChatVisitLine {
  at: string;
  token: number | null;
}

interface ChangeVisitScreenProps {
  practiceName: string;
  newVisitHref: string;
  timezone: string;
  visits: ChatVisitLine[];
}

function visitLine(visit: ChatVisitLine, timezone: string): string {
  const day = formatDate(visit.at, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
  if (visit.token != null) return `${day}, token ${visit.token}`;
  const clock = formatTime(visit.at, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}, ${clock}`;
}

/**
 * First screen for an Instagram change, cancel, or view link.
 * Lists visits booked from this chat. No name, and no change or cancel action.
 */
export function ChangeVisitScreen({
  practiceName,
  newVisitHref,
  timezone,
  visits,
}: ChangeVisitScreenProps) {
  const clinic = clinicDisplayName(practiceName);

  return (
    <PublicClinicFrame>
      {clinic ? (
        <p className="text-sm font-medium text-[hsl(var(--halo-navy))]">{clinic}</p>
      ) : null}
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        Change or cancel a visit
      </h1>
      {visits.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {visits.map((visit, index) => (
            <li
              key={`${visit.at}-${index}`}
              className="rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground"
            >
              {visitLine(visit, timezone)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
            No upcoming visits from this chat.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A visit made from this chat can be changed or cancelled here.
          </p>
        </>
      )}
      <Link
        href={newVisitHref}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        New visit
      </Link>
    </PublicClinicFrame>
  );
}
