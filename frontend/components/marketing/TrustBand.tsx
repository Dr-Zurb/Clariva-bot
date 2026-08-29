import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/** Trust / privacy band — links to the existing legal pages. No unverifiable claims. */
export function TrustBand() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
        >
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-3xl">
          Built for doctors on social media
        </h2>
        <p className="mt-4 text-[hsl(var(--halo-ink))]/70">
          Your patients&apos; conversations stay private and secure. Read how we
          handle data in our{" "}
          <Link
            href="/privacy"
            className="font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          ,{" "}
          <Link
            href="/terms"
            className="font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
          >
            Terms
          </Link>
          , and{" "}
          <Link
            href="/data-deletion"
            className="font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
          >
            Data Deletion
          </Link>{" "}
          policy.
        </p>
      </div>
    </section>
  );
}
