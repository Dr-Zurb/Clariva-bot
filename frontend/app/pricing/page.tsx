import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FinalCtaBand } from "@/components/marketing/FinalCtaBand";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { DEMO_HREF, SIGNUP_HREF, haloPrimaryButton } from "@/components/marketing/constants";

const TITLE = "Halo Aid pricing — ₹999 a month, ₹49 a consult, never more than ₹12,499";
const DESCRIPTION =
  "₹999 a month includes your first 20 completed consults. ₹49 after that. The bill can never exceed ₹12,499. You only pay when the patient shows up.";

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

const NEVER_BILLED = [
  "No-shows and cancellations — a consult bills only when it happened",
  "Everything the bot handles alone — timings, fees, directions, booking links",
  "Documentation — prescriptions, notes, records",
  "Reconnects — one consult, not two",
] as const;

const EXAMPLES = [
  { month: "20 consults", bill: "₹999", paid: "₹1,179" },
  { month: "60 consults", bill: "₹2,959", paid: "₹3,492" },
  { month: "100 consults", bill: "₹4,919", paid: "₹5,804" },
  { month: "200 consults", bill: "₹9,819", paid: "₹11,586" },
  { month: "255+ consults", bill: "₹12,499", paid: "₹14,749" },
] as const;

export default function PricingPage() {
  return (
    <div className="halo flex min-h-screen flex-col bg-white text-[hsl(var(--halo-ink))]">
      <MarketingNav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--halo-mist))] to-white"
          />
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="text-sm font-medium text-[hsl(var(--halo-blue))]">
              Simple, usage-based, capped
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-[hsl(var(--halo-navy))] sm:text-5xl">
              A receptionist costs ₹15,000 a month and sleeps at night. This doesn&apos;t.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-[hsl(var(--halo-ink))]/70">
              ₹999 a month includes your first 20 completed consults. ₹49 after that.
              Patient doesn&apos;t show — you pay nothing. Whatever happens, your bill
              can never cross ₹12,499.
            </p>
            <p className="mt-3 max-w-2xl text-sm text-[hsl(var(--halo-ink))]/55">
              Medical services are GST-exempt, so you cannot claim input credit. The
              numbers you actually pay: ₹1,179 · ₹58 per consult · ₹14,749 maximum.
              Invoices stay standard — ex-GST plus an 18% GST line.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className={haloPrimaryButton}>
                <Link href={DEMO_HREF}>Book a demo</Link>
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

        <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="border-b border-black/5 px-6 py-4">
              <h2 className="text-lg font-semibold text-[hsl(var(--halo-navy))]">
                What a month looks like
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--halo-ink))]/60">
                One plan. All channels. No lock-in.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[hsl(var(--halo-mist))]/60 text-[hsl(var(--halo-ink))]/70">
                  <tr>
                    <th className="px-6 py-3 font-medium">Your month</th>
                    <th className="px-6 py-3 font-medium">Invoice (ex-GST)</th>
                    <th className="px-6 py-3 font-medium">You pay (incl. GST)</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLES.map((row) => (
                    <tr key={row.month} className="border-t border-black/5">
                      <td className="px-6 py-3 font-medium text-[hsl(var(--halo-navy))]">
                        {row.month}
                      </td>
                      <td className="px-6 py-3">{row.bill}</td>
                      <td className="px-6 py-3">{row.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-black/5 px-6 py-4">
              <p className="text-sm leading-relaxed text-[hsl(var(--halo-ink))]/60">
                <span className="font-medium text-[hsl(var(--halo-navy))]">
                  Follow-up visits count as consults.
                </span>{" "}
                Many doctors see a patient again at no charge, and that is good
                care — we would rather not put a price on that judgement, so we
                never look at what you charge. Every visit runs the same booking,
                reminder, consult and notes. The 20 included each month and the
                ₹12,499 ceiling are what leave room for it.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-lg font-semibold text-[hsl(var(--halo-navy))]">
              Never billed
            </h2>
            <ul className="mt-4 space-y-3">
              {NEVER_BILLED.map((item) => (
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
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="text-lg font-semibold text-[hsl(var(--halo-navy))]">
              Founding ten
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--halo-ink))]/75">
              The first ten doctors get the ₹999 base waived for three months —
              you pay only ₹49 per completed consult, and the cap still applies.
              That price is locked for twelve months. In exchange: a case study
              and two warm introductions. After ten, the offer is gone.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--halo-ink))]/75">
              Above 500 consults a month we quote a committed-volume plan — same
              shape, billed separately. We reach out first. Nothing shuts off.
            </p>
          </div>
        </section>

        <FinalCtaBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
