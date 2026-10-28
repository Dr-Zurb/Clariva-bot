import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Short price line on the homepage. The full table lives on /pricing. */
export function PricingTeaser() {
  return (
    <section className="bg-white px-4 pb-4 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-3xl">
          ₹999 a month covers the clinic and 20 teleconsults.
        </h2>
        <p className="mt-3 text-[hsl(var(--halo-ink))]/70">
          Never more than ₹12,499.
        </p>
        <Link
          href="/pricing"
          className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
        >
          See pricing
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
