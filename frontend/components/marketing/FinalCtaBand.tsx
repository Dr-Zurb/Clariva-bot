import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEMO_HREF, SIGNUP_HREF } from "./constants";

/** Closing call-to-action on the brand gradient. */
export function FinalCtaBand() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="halo-gradient mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 text-center shadow-xl sm:py-16">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Stop losing patients in your inbox.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/90">
          Turn every DM and comment into a booked consultation with Halo Aid.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="bg-white text-[hsl(var(--halo-blue))] shadow hover:bg-white/90 focus-visible:ring-white"
          >
            <Link href={SIGNUP_HREF}>
              Get started
              <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white focus-visible:ring-white"
          >
            <Link href={DEMO_HREF}>Book a demo</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
