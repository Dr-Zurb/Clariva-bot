import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEMO_HREF,
  LOGIN_HREF,
  NAV_LINKS,
  SIGNUP_HREF,
  haloPrimaryButton,
} from "./constants";

/**
 * Public marketing top bar. Sticky + translucent, with the Halo Aid logo,
 * in-page anchor links, and Sign in / Get started CTAs. The mobile menu is a
 * JS-free `<details>` disclosure so the whole nav stays a Server Component.
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[hsl(var(--halo-blue))]/10 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link href="/" aria-label="Halo Aid home" className="flex items-center">
          <Image
            src="/brand/halo-logo.svg"
            alt="Halo Aid"
            width={141}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </Link>

        {/* Desktop anchor links */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[hsl(var(--halo-ink))]/70 transition-colors hover:text-[hsl(var(--halo-navy))]"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href={DEMO_HREF}>Book a demo</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={LOGIN_HREF}>Sign in</Link>
          </Button>
          <Button asChild size="sm" className={haloPrimaryButton}>
            <Link href={SIGNUP_HREF}>Get started</Link>
          </Button>
        </div>

        {/* Mobile disclosure menu (no JS) */}
        <details className="relative md:hidden">
          <summary
            aria-label="Open menu"
            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-[hsl(var(--halo-navy))] hover:bg-[hsl(var(--halo-mist))] [&::-webkit-details-marker]:hidden"
          >
            <Menu className="h-5 w-5" />
          </summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-black/5 bg-white p-2 shadow-lg">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--halo-ink))]/80 hover:bg-[hsl(var(--halo-mist))]"
              >
                {link.label}
              </a>
            ))}
            <div className="my-1 h-px bg-black/5" />
            <Link
              href={DEMO_HREF}
              className="block rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--halo-ink))]/80 hover:bg-[hsl(var(--halo-mist))]"
            >
              Book a demo
            </Link>
            <Link
              href={LOGIN_HREF}
              className="block rounded-md px-3 py-2 text-sm font-medium text-[hsl(var(--halo-ink))]/80 hover:bg-[hsl(var(--halo-mist))]"
            >
              Sign in
            </Link>
            <Link
              href={SIGNUP_HREF}
              className="mt-1 block rounded-md bg-[hsl(var(--halo-blue))] px-3 py-2 text-center text-sm font-medium text-white hover:bg-[hsl(var(--halo-blue))]/90"
            >
              Get started
            </Link>
          </div>
        </details>
      </nav>
    </header>
  );
}
