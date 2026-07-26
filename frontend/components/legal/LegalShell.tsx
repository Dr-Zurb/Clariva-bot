import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data Deletion" },
] as const;

interface LegalShellProps {
  children: ReactNode;
  /** Current path for nav highlight, e.g. `/privacy`. */
  activeHref?: string;
}

/**
 * Shared chrome for public legal pages (halo-aid-legal batch).
 * Mist wash + Halo mark + legal nav; document content in a wide column.
 */
export function LegalShell({ children, activeHref }: LegalShellProps) {
  return (
    <div className="halo relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] via-white to-white"
      />

      <header className="border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="Halo Aid home" className="flex items-center">
            <Image
              src="/brand/halo-logo.svg"
              alt="Halo Aid"
              width={128}
              height={29}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  activeHref === link.href
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={activeHref === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-black/5">
        <p className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          © 2026 Halo Aid.{" "}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </footer>
    </div>
  );
}
