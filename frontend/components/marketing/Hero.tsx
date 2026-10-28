import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, Clapperboard, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CLINICS_HREF,
  DEMO_HREF,
  SIGNUP_HREF,
  haloPrimaryButton,
} from "./constants";

/**
 * Landing hero — headline, sub, dual CTA, and a post → booking → visit mock.
 * No patient names. Column-free so the cards stay readable on a phone.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] to-white"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--halo-blue))]/20 bg-white px-3 py-1 text-xs font-medium text-[hsl(var(--halo-navy))]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--halo-sky))]"
                aria-hidden
              />
              Built for doctors on social media
            </span>
            <Link
              href={CLINICS_HREF}
              className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
            >
              Not yet on social media? Halo Aid for clinics
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-[hsl(var(--halo-navy))] sm:text-5xl">
            Social media assistance{" "}
            <span className="text-[hsl(var(--halo-blue))]">for doctors</span>.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-6 text-[hsl(var(--halo-ink))]/75">
            Plan your posts, book the visit, and keep the record — in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className={haloPrimaryButton}>
              <Link href={SIGNUP_HREF}>
                Get started
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-[hsl(var(--halo-blue))]/30 text-[hsl(var(--halo-navy))] hover:bg-[hsl(var(--halo-mist))] hover:text-[hsl(var(--halo-navy))]"
            >
              <Link href={DEMO_HREF}>Book a demo</Link>
            </Button>
          </div>
        </div>

        <figure className="relative mx-auto w-full max-w-md">
          <div
            aria-hidden
            className="halo-gradient absolute -inset-4 -z-10 rounded-[2rem] opacity-10 blur-2xl"
          />
          <div className="space-y-3 rounded-2xl border border-black/5 bg-white p-5 shadow-xl">
            <figcaption className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
              From the post
            </figcaption>
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--halo-blue))]/15 bg-white p-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
              >
                <Clapperboard className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
                  Knee pain reel
                </p>
                <p className="text-xs text-[hsl(var(--halo-ink))]/60">Ready · on the board</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--halo-blue))]/15 bg-white p-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
              >
                <CalendarCheck className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
                  Booked from this post
                </p>
                <p className="text-xs text-[hsl(var(--halo-ink))]/60">Thursday · 4:30 PM</p>
              </div>
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--halo-blue))]/15 bg-white p-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
              >
                <FileText className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
                  Visit done
                </p>
                <p className="text-xs text-[hsl(var(--halo-ink))]/60">Prescription sent</p>
              </div>
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
