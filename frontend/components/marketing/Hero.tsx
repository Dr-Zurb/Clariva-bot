import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEMO_HREF, SIGNUP_HREF, haloPrimaryButton } from "./constants";

/**
 * Landing hero — headline, sub, dual CTA, and a DM→booking mock visual built
 * from primitives (no raster asset). Copy lifted from the brand creatives.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] to-white"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        {/* Copy */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--halo-blue))]/20 bg-white px-3 py-1 text-xs font-medium text-[hsl(var(--halo-navy))]">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--halo-sky))]" aria-hidden />
            Built for doctors on social media
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-[hsl(var(--halo-navy))] sm:text-5xl">
            Turn patient DMs and comments into{" "}
            <span className="text-[hsl(var(--halo-blue))]">booked consultations</span>.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-[hsl(var(--halo-ink))]/70">
            Halo Aid captures patient messages from Instagram, replies instantly,
            and books the visit — so you never lose a lead in your inbox again.
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

        {/* Visual: DM → booking */}
        <div className="relative mx-auto w-full max-w-md">
          <div
            aria-hidden
            className="halo-gradient absolute -inset-4 -z-10 rounded-[2rem] opacity-10 blur-2xl"
          />
          <div className="space-y-3 rounded-2xl border border-black/5 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--halo-mist))] text-[hsl(var(--halo-blue))]"
              >
                <MessageCircle className="h-4 w-4" />
              </span>
              <p className="rounded-2xl rounded-tl-sm bg-[hsl(var(--halo-mist))] px-4 py-2 text-sm text-[hsl(var(--halo-ink))]">
                Hi doctor! Do you have any slots this week?
              </p>
            </div>
            <div className="flex justify-end">
              <p className="halo-gradient max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm text-white shadow-sm">
                Yes — I can see you Thursday at 4:30 PM. Tap to confirm.
              </p>
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
                  Consultation booked
                </p>
                <p className="text-xs text-[hsl(var(--halo-ink))]/60">
                  Thursday · 4:30 PM · Video
                </p>
              </div>
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
