import Link from "next/link";
import { ArrowRight, Check, Lock, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { haloPrimaryButton, SIGNUP_HREF } from "./constants";

const ROWS = [
  {
    icon: ShieldCheck,
    title: "You approve every post.",
    body: "Nothing goes out until you put it on the schedule.",
  },
  {
    icon: Lock,
    title: "Patient records stay out of posts.",
    body: "Your patients' records stay with your practice.",
  },
  {
    icon: Wallet,
    title: "Patients pay into your own account.",
    body: "Halo Aid is never in the middle and never takes a cut of your fee.",
  },
] as const;

const CHECKS = [
  "₹49 per teleconsult after that",
  "A no-show costs you nothing",
  "Desk logins are free",
  "Your bill can never cross ₹12,499",
] as const;

const linkClass =
  "font-medium text-[hsl(var(--halo-blue))] underline-offset-4 hover:underline";

/** Home-only trust rows and the price card. /clinics keeps TrustBand. */
export function TrustAndPrice() {
  return (
    <section className="bg-[hsl(var(--halo-mist))] py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--halo-blue))]">
            Trust
          </p>
          <ul className="mt-6 space-y-6">
            {ROWS.map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-lg font-semibold text-[hsl(var(--halo-navy))]">
                      {row.title}
                    </span>
                    <span className="mt-1 block text-base text-[hsl(var(--halo-ink))]/70">
                      {row.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-8 text-sm text-[hsl(var(--halo-ink))]/70">
            Read how we handle data in our{" "}
            <Link href="/privacy" className={linkClass}>
              Privacy Policy
            </Link>
            ,{" "}
            <Link href="/terms" className={linkClass}>
              Terms
            </Link>
            , and{" "}
            <Link href="/data-deletion" className={linkClass}>
              Data Deletion
            </Link>{" "}
            policy.
          </p>
        </div>

        <div className="rounded-3xl border border-[hsl(var(--halo-navy))]/10 bg-white p-8 shadow-[0_30px_70px_-28px_hsl(var(--halo-navy)_/_0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--halo-blue))]">
            One plan. Clinic included.
          </p>
          <p className="mt-4 flex items-end gap-2">
            <span className="text-5xl font-bold tracking-tight text-[hsl(var(--halo-navy))]">
              ₹999
            </span>
            <span className="mb-1 text-base text-[hsl(var(--halo-ink))]/70">
              / month
            </span>
          </p>
          <p className="mt-3 text-base text-[hsl(var(--halo-ink))]/70">
            Covers every in-clinic visit and your first 20 teleconsults.
          </p>
          <ul className="mt-6 space-y-3">
            {CHECKS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-[hsl(var(--halo-navy))]"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--halo-blue))]"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[hsl(var(--halo-ink))]/55">
            Prices exclude GST.
          </p>
          <Button
            asChild
            size="lg"
            className={`mt-6 w-full ${haloPrimaryButton}`}
          >
            <Link href={SIGNUP_HREF}>
              Get started
              <ArrowRight />
            </Link>
          </Button>
          <p className="mt-3 text-center">
            <Link href="/pricing" className={linkClass}>
              See pricing
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
