import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { SIGNUP_HREF, haloPrimaryButton } from "@/components/marketing/constants";

const TITLE = "Book a Halo Aid demo";
const DESCRIPTION =
  "Schedule a 20-minute live walkthrough of Halo Aid — how Instagram DMs become booked consultations.";

export const metadata: Metadata = {
  title: TITLE,
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

const BULLETS = [
  "See how Instagram DMs and comments become booked visits",
  "Walk through the doctor dashboard and consult flow",
  "Ask anything — no commitment, 20 minutes",
] as const;

export default function DemoPage() {
  return (
    <div className="halo flex min-h-screen flex-col bg-white text-[hsl(var(--halo-ink))]">
      <MarketingNav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] to-white"
          />
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
                Book a 20-minute Halo Aid demo
              </h1>
              <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
                Live walkthrough of how Halo Aid turns Instagram DMs into booked
                consultations. Email us and we will send a time.
              </p>
              <ul className="mx-auto mt-8 max-w-md space-y-3 text-left">
                {BULLETS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-[hsl(var(--halo-ink))]/80"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <Button asChild className={haloPrimaryButton}>
                  <a href="mailto:founder@haloaid.com?subject=Halo%20Aid%20demo">
                    Email founder@haloaid.com
                  </a>
                </Button>
              </div>
            </div>

            <p className="mt-8 text-center text-sm text-[hsl(var(--halo-ink))]/60">
              Prefer to explore on your own?{" "}
              <Link
                href={SIGNUP_HREF}
                className="font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
