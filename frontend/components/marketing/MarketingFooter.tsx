import Image from "next/image";
import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data Deletion" },
] as const;

/** Public marketing footer — brand blurb + legal links + copyright. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/halo-logomark.svg"
            alt=""
            width={28}
            height={28}
            aria-hidden
            className="h-7 w-7"
          />
          <p className="text-sm text-[hsl(var(--halo-ink))]/60">
            Built for doctors on social media.
          </p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[hsl(var(--halo-ink))]/60 transition-colors hover:text-[hsl(var(--halo-navy))]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-black/5">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-[hsl(var(--halo-ink))]/50 sm:px-6">
          © 2026 Halo Aid. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
