import Image from "next/image";
import type { ReactNode } from "react";

interface PublicClinicFrameProps {
  children: ReactNode;
  /** Short screens sit in the middle. The visit form starts under the mark. */
  align?: "center" | "start";
  width?: "sm" | "md";
}

/**
 * Shared chrome for the public clinic pages: mist, Halo Aid mark, one card.
 */
export function PublicClinicFrame({
  children,
  align = "center",
  width = "sm",
}: PublicClinicFrameProps) {
  return (
    <main
      className={`halo relative flex min-h-screen flex-col items-center px-4 py-10 ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
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

      <Image
        src="/brand/halo-logo.svg"
        alt="Halo Aid"
        width={141}
        height={32}
        priority
        className="mb-8 h-8 w-auto"
      />

      <div
        className={`w-full overflow-hidden rounded-2xl border border-black/5 bg-white/90 shadow-lg backdrop-blur-sm ${
          width === "md" ? "max-w-md" : "max-w-sm"
        }`}
      >
        <div aria-hidden className="halo-gradient h-1.5" />
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}

/** Hide the old untitled fallback so the card does not say "Book Appointment". */
export function clinicDisplayName(practiceName: string): string | null {
  const clinic = practiceName.trim();
  if (!clinic || clinic === "Book Appointment") return null;
  return clinic;
}
