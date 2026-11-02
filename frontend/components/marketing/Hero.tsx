import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import {
  CLINICS_HREF,
  DEMO_HREF,
  haloPrimaryButton,
  SIGNUP_HREF,
} from "./constants";
import { HeroFlow } from "./hero/HeroFlow";

/**
 * Landing hero. On a wide screen the copy is centred above the arc, and the
 * five cards span the page. Get started and Book a demo sit under the
 * cards, then the clinics side door. Below md the steps stack under the
 * copy. No patient names.
 */

function ClinicsLink() {
  return (
    <Link
      href={CLINICS_HREF}
      className="inline-flex flex-col items-center gap-1 text-sm leading-5"
    >
      <span className="text-[hsl(var(--halo-ink))]/75">
        Not on social media yet?
      </span>
      <span className="font-medium text-[hsl(var(--halo-blue))] underline underline-offset-4">
        Discover Halo Aid for clinics
      </span>
    </Link>
  );
}

export function Hero() {
  return (
    <section className="relative flex flex-1 flex-col overflow-x-clip bg-white">
      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 xl:justify-start xl:pb-8 xl:pt-2">
        <div className="min-w-0 xl:flex xl:w-full xl:flex-col xl:items-center xl:text-center">
          <h1
            className="halo-hero-rise text-[1.15rem] font-bold leading-[1.12] tracking-tight text-[hsl(var(--halo-navy))] min-[380px]:text-[1.35rem] sm:text-[1.85rem] md:text-[2.15rem] lg:text-[2.45rem] xl:text-[3.25rem] xl:leading-[1.08]"
            style={{ animationDelay: "120ms" }}
          >
            <span className="block whitespace-nowrap">
              Doc, we&apos;re with you on your
            </span>
            <span className="mt-1 block whitespace-nowrap text-[hsl(var(--halo-blue))]">
              social media journey.
            </span>
          </h1>
          <p
            className="halo-hero-rise mt-5 max-w-[23.5rem] text-base leading-6 text-[hsl(var(--halo-ink))]/75 xl:mt-6 xl:max-w-3xl xl:text-lg xl:leading-7"
            style={{ animationDelay: "220ms" }}
          >
            <span className="block">
              Helping you with the content, the booking, the consult, the
              record, and the analysis.
            </span>
            <span className="mt-2 block font-semibold text-[hsl(var(--halo-navy))]">
              The complete flow in one place.
            </span>
          </p>
        </div>

        <div className="halo-hero-stage relative mt-12 md:mx-auto md:mt-14 md:w-full md:max-w-[56rem] xl:mx-0 xl:max-w-none">
          <HeroFlow />
        </div>
        <div
          className="halo-hero-rise mt-3 flex flex-col items-center gap-3"
          style={{ animationDelay: "900ms" }}
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-[hsl(var(--halo-blue))]/25 bg-white text-[hsl(var(--halo-navy))] shadow-sm hover:bg-[hsl(var(--halo-mist))] hover:text-[hsl(var(--halo-navy))]"
            >
              <Link href={DEMO_HREF}>Book a demo</Link>
            </Button>
            <Button asChild size="lg" className={haloPrimaryButton}>
              <Link href={SIGNUP_HREF}>
                Get started
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <ClinicsLink />
        </div>
      </div>
    </section>
  );
}
