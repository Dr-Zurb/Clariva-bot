import Link from "next/link";
import {
  clinicDisplayName,
  PublicClinicFrame,
} from "@/components/public-clinic/PublicClinicFrame";

interface ChatContinueMenuProps {
  practiceName: string;
  slug: string;
  code: string;
}

function pageHref(slug: string, code: string, purpose: "visit" | "times" | "change"): string {
  const params = new URLSearchParams({ c: code, for: purpose });
  return `/d/${slug}?${params.toString()}`;
}

/**
 * First screen of a chat link. The Instagram reply only shares this page.
 */
export function ChatContinueMenu({ practiceName, slug, code }: ChatContinueMenuProps) {
  const clinic = clinicDisplayName(practiceName);
  const links = [
    { href: pageHref(slug, code, "visit"), label: "New visit / revisit / follow-up" },
    { href: pageHref(slug, code, "times"), label: "Check availability" },
    { href: pageHref(slug, code, "change"), label: "Change or cancel a visit" },
  ];

  return (
    <PublicClinicFrame>
      {clinic ? (
        <p className="text-sm font-medium text-[hsl(var(--halo-navy))]">{clinic}</p>
      ) : null}
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Continue</h1>
      <ul className="mt-4 space-y-2">
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
      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        This page does not give medical advice.
      </p>
    </PublicClinicFrame>
  );
}
