import Link from "next/link";
import {
  clinicDisplayName,
  PublicClinicFrame,
} from "@/components/public-clinic/PublicClinicFrame";

interface ChangeVisitScreenProps {
  practiceName: string;
  newVisitHref: string;
}

/**
 * First screen for an Instagram change, cancel, or view link.
 * The clinic name is the header. Halo Aid is the mark above the card.
 */
export function ChangeVisitScreen({ practiceName, newVisitHref }: ChangeVisitScreenProps) {
  const clinic = clinicDisplayName(practiceName);

  return (
    <PublicClinicFrame>
      {clinic ? (
        <p className="text-sm font-medium text-[hsl(var(--halo-navy))]">{clinic}</p>
      ) : null}
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        Change or cancel a visit
      </h1>
      <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
        No upcoming visits from this chat.
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        A visit made from this chat can be changed or cancelled here.
      </p>
      <Link
        href={newVisitHref}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        New visit
      </Link>
    </PublicClinicFrame>
  );
}
