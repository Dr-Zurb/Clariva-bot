import Link from "next/link";
import {
  clinicDisplayName,
  PublicClinicFrame,
} from "@/components/public-clinic/PublicClinicFrame";

interface ChatContinueMenuProps {
  practiceName: string;
  slug: string;
  code: string;
  clinicAddress?: string | null;
  specialty?: string | null;
}

function pageHref(slug: string, code: string, purpose: "visit" | "times" | "change"): string {
  const params = new URLSearchParams({ for: purpose });
  if (code.trim()) params.set("c", code);
  return `/d/${slug}?${params.toString()}`;
}

/**
 * First screen of /d/:slug. A chat code is optional. `for` opens a step.
 */
export function ChatContinueMenu({
  practiceName,
  slug,
  code,
  clinicAddress,
  specialty,
}: ChatContinueMenuProps) {
  const clinic = clinicDisplayName(practiceName);
  const address = clinicAddress?.trim() ?? "";
  const specialtyLine = specialty?.trim() ?? "";
  const links = [
    { href: pageHref(slug, code, "visit"), label: "New visit / revisit / follow-up" },
    { href: pageHref(slug, code, "times"), label: "Check availability" },
    { href: pageHref(slug, code, "change"), label: "Change or cancel a visit" },
  ];

  return (
    <PublicClinicFrame>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {clinic ?? "Book a visit"}
      </h1>
      {specialtyLine ? (
        <p className="mt-1 text-sm text-muted-foreground">{specialtyLine}</p>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Book a visit, check times, or change a visit you already have.
      </p>
      <ul className="mt-5 space-y-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex w-full items-center justify-center rounded-lg border border-black/10 bg-white px-4 py-3 text-center text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {address ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Clinic address
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">{address}</p>
        </div>
      ) : null}
      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        This page does not give medical advice.
      </p>
    </PublicClinicFrame>
  );
}
