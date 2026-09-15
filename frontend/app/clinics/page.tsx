import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  List,
  RefreshCw,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { TrustBand } from "@/components/marketing/TrustBand";
import {
  CLINIC_NAV_LINKS,
  DEMO_HREF,
  SIGNUP_HREF,
  haloPrimaryButton,
} from "@/components/marketing/constants";

const TITLE = "Halo Aid for clinics — patients, visits, and prescriptions";
const DESCRIPTION =
  "Appointments, history, notes, and a prescription in the same flow. Teleconsult is there when you want it. Instagram is not required.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Halo Aid",
    images: [{ url: "/brand/halo-og.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/halo-og.svg"],
  },
};

const STEPS = [
  {
    icon: List,
    title: "They are on the list",
    body: "A booked slot or a walk-in — one patient list.",
  },
  {
    icon: Stethoscope,
    title: "You see them",
    body: "Their history is already on the chart.",
  },
  {
    icon: ClipboardList,
    title: "The visit is written",
    body: "Notes and a prescription in the same flow.",
  },
  {
    icon: RefreshCw,
    title: "They come back",
    body: "The last visit is waiting.",
  },
] as const;

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Appointments & OPD",
    body: "Booked slots and walk-ins on one patient list.",
  },
  {
    icon: Users,
    title: "Patient records",
    body: "A clean history for every patient, ready before they sit down.",
  },
  {
    icon: ClipboardList,
    title: "Notes & prescriptions",
    body: "Chart the visit and write a prescription in the same flow.",
  },
  {
    icon: Video,
    title: "Teleconsult, if you want it",
    body: "Video, voice, or text — built in. There when you want it.",
  },
] as const;

export default function ClinicsPage() {
  return (
    <div className="halo flex min-h-screen flex-col bg-white text-[hsl(var(--halo-ink))]">
      <MarketingNav links={CLINIC_NAV_LINKS} />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] to-white"
          />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <p className="text-sm font-medium text-[hsl(var(--halo-blue))]">
              For clinics
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-[hsl(var(--halo-navy))] sm:text-5xl">
              Patients, visits, and prescriptions — in one place.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-[hsl(var(--halo-ink))]/70">
              Appointments, history, notes, and a prescription in the same
              flow. Teleconsult is there when you want it. Instagram is not
              required.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className={haloPrimaryButton}>
                <Link href={DEMO_HREF}>
                  Book a demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[hsl(var(--halo-blue))]/30 text-[hsl(var(--halo-navy))] hover:bg-[hsl(var(--halo-mist))] hover:text-[hsl(var(--halo-navy))]"
              >
                <Link href={SIGNUP_HREF}>Get started</Link>
              </Button>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-20 bg-white py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
                How a visit is kept
              </h2>
              <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
                From the list to the next visit — four steps.
              </p>
            </div>
            <ol className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title}
                    className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span
                        aria-hidden
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--halo-mist))] text-[hsl(var(--halo-blue))]"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-tabular text-sm font-semibold text-[hsl(var(--halo-blue))]/40">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-[hsl(var(--halo-navy))]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm text-[hsl(var(--halo-ink))]/65">
                      {step.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-20 bg-[hsl(var(--halo-mist))]/40 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
                One record for the practice.
              </h2>
              <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
                Instagram is there if patients message you. It is not
                required.
              </p>
            </div>
            <div className="mt-14 grid gap-4 sm:grid-cols-2">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={feature.title}
                    className="border-black/5 p-6 shadow-sm"
                  >
                    <span
                      aria-hidden
                      className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-base font-semibold text-[hsl(var(--halo-navy))]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-[hsl(var(--halo-ink))]/65">
                      {feature.body}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <TrustBand />

        <section className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="halo-gradient mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 text-center shadow-xl sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Keep every visit in one record.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/90">
              When they come back, the last visit is waiting.
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
      </main>
      <MarketingFooter />
    </div>
  );
}
