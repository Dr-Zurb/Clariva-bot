import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

interface AuthShellProps {
  children: ReactNode;
  /** Optional footer below the card (e.g. sign-up / sign-in link). */
  footer?: ReactNode;
}

/**
 * Shared chrome for `/login` and `/signup` (halo-aid-auth batch).
 * Mist wash + Halo Aid mark; content sits in a single centered surface.
 */
export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className="halo relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] via-white to-white"
      />
      <div
        aria-hidden
        className="halo-gradient pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full opacity-[0.12] blur-3xl"
      />
      <div
        aria-hidden
        className="halo-gradient pointer-events-none absolute -right-16 bottom-20 h-56 w-56 rounded-full opacity-[0.10] blur-3xl"
      />

      <Link
        href="/"
        className="mb-8 flex items-center gap-2.5"
        aria-label="Halo Aid home"
      >
        <Image
          src="/brand/halo-logo.svg"
          alt="Halo Aid"
          width={141}
          height={32}
          priority
          className="h-8 w-auto"
        />
      </Link>

      <div className="w-full max-w-sm rounded-2xl border border-black/5 bg-white/90 p-6 shadow-lg backdrop-blur-sm sm:p-8">
        {children}
      </div>

      {footer ? (
        <div className="mt-6 w-full max-w-sm text-center text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
