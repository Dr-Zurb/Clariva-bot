"use client";

import {
  BarChart3,
  CalendarCheck,
  Clapperboard,
  FileText,
  Video,
  type LucideIcon,
} from "lucide-react";

import { openHowStep } from "../howStep";
import {
  analysisPiece,
  bookingPiece,
  consultPiece,
  contentPiece,
  recordPiece,
  type FlowPiece,
} from "./FlowMinis";

/**
 * Five steps in a row under one curve. Consult is the high point.
 * The step name sits above its icon. The line stays on the card.
 * Drops are padding, not transform:
 * the rise animation owns transform.
 * Below md the same steps stack, because the row does not fit.
 *
 * Path M10 104 Q50 -56 90 104 in a 112px-tall viewBox. At t = 0, 0.25, 0.5
 * the line sits on circle centres 104, 44, 24.
 */

const DELAYS = ["250ms", "400ms", "550ms", "700ms", "850ms"] as const;
const DROPS = [80, 20, 0, 20, 80] as const;
const ARCH = "M10 104 Q50 -56 90 104";

const STEPS: readonly {
  label: string;
  line: string;
  icon: LucideIcon;
  drop: (typeof DROPS)[number];
  piece: FlowPiece;
}[] = [
  {
    label: "Content",
    line: "Plan and schedule",
    icon: Clapperboard,
    drop: DROPS[0],
    piece: contentPiece,
  },
  {
    label: "Booking",
    line: "Patients book from the post",
    icon: CalendarCheck,
    drop: DROPS[1],
    piece: bookingPiece,
  },
  {
    label: "Consult",
    line: "See them in clinic or online",
    icon: Video,
    drop: DROPS[2],
    piece: consultPiece,
  },
  {
    label: "Record",
    line: "Chart, prescribe, follow up",
    icon: FileText,
    drop: DROPS[3],
    piece: recordPiece,
  },
  {
    label: "Analysis",
    line: "See which post brought them",
    icon: BarChart3,
    drop: DROPS[4],
    piece: analysisPiece,
  },
];

export function HeroFlow() {
  return (
    <div>
      <div className="relative hidden md:block">
        <Arch />
      </div>
      <div className="relative md:hidden">
        <div
          aria-hidden
          className="absolute -inset-x-2 -inset-y-3 rounded-3xl bg-[hsl(var(--halo-wash))]"
        />
        <Stack />
      </div>
    </div>
  );
}

function Arch() {
  return (
    <div className="halo-arch relative isolate -mx-1">
      <div aria-hidden className="halo-arch-glow" />
      <svg
        aria-hidden
        viewBox="0 0 100 112"
        preserveAspectRatio="none"
        className="halo-arch-reveal pointer-events-none absolute inset-x-0 top-0 h-[112px] w-full overflow-visible"
      >
        <path
          d={ARCH}
          fill="none"
          stroke="hsl(var(--halo-blue))"
          strokeOpacity="0.12"
          strokeWidth="8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          data-arch-path=""
          d={ARCH}
          fill="none"
          stroke="hsl(var(--halo-blue))"
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <ol
        data-hero-arch=""
        aria-label="The complete flow in one place"
        className="relative grid grid-cols-5"
      >
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.label}
              data-step={step.label}
              className="halo-hero-rise group relative flex flex-col items-center px-1 hover:z-20 focus-within:z-20"
              style={{
                paddingTop: step.drop,
                animationDelay: DELAYS[index],
              }}
            >
              <a
                href="#how-it-works"
                aria-label={`${step.label}. ${step.line}`}
                onClick={(event) => {
                  event.preventDefault();
                  openHowStep(index);
                }}
                className="halo-step-pop flex w-full flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--halo-blue))] focus-visible:ring-offset-2"
              >
                <span className="relative z-10 flex w-full flex-col items-center">
                  <span className="absolute bottom-full mb-2 block w-full px-0.5 text-center text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[hsl(var(--halo-blue))]">
                    {step.label}
                  </span>
                  <span
                    data-dot=""
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--halo-blue))] text-white shadow-[0_8px_18px_-8px_hsl(var(--halo-blue))] ring-4 ring-white"
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                </span>
                <span
                  aria-hidden
                  className="h-3 w-0.5 bg-[hsl(var(--halo-blue))]/35"
                />
                <ArchCard step={step} />
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ArchCard({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div
      data-card=""
      className="halo-arch-card flex h-[220px] w-full flex-col rounded-xl border border-[hsl(var(--halo-blue))]/10 bg-white px-1.5 py-2.5 text-center group-hover:border-[hsl(var(--halo-blue))]/40 xl:h-[204px]"
    >
      <p className="line-clamp-2 h-8 text-[12px] font-semibold leading-4 text-[hsl(var(--halo-navy))] xl:line-clamp-1 xl:h-4">
        {step.line}
      </p>
      <div
        data-tile=""
        className={
          step.label === "Content" || step.label === "Consult"
            ? "halo-arch-tile-stages mt-1 w-full overflow-hidden rounded-lg border border-[hsl(var(--halo-blue))]/10 bg-[hsl(var(--halo-mist))]"
            : "halo-arch-tile mt-1 h-[132px] w-full overflow-hidden rounded-lg border border-[hsl(var(--halo-blue))]/10 bg-[hsl(var(--halo-mist))]"
        }
      >
        {step.piece.tile}
      </div>
      <div
        className={
          step.label === "Content" || step.label === "Consult"
            ? "mt-2 flex h-10 items-center justify-center"
            : "mt-2 flex h-[22px] items-center justify-center"
        }
      >
        {step.piece.footer}
      </div>
    </div>
  );
}

function Stack() {
  return (
    <ol
      aria-label="The complete flow in one place"
      className="relative flex flex-col gap-2.5"
    >
      <div
        aria-hidden
        className="absolute bottom-[22px] left-[22px] top-[22px] w-0.5 -translate-x-1/2"
      >
        <div className="absolute inset-0 bg-[hsl(var(--halo-blue))]/20" />
        <div className="halo-flow-fill absolute inset-0 origin-top bg-[hsl(var(--halo-blue))]" />
      </div>
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li
            key={step.label}
            className="halo-hero-rise group relative z-10 hover:z-20 focus-within:z-20"
            style={{ animationDelay: DELAYS[index] }}
          >
            <a
              href="#how-it-works"
              aria-label={`${step.label}. ${step.line}`}
              onClick={(event) => {
                event.preventDefault();
                openHowStep(index);
              }}
              className="halo-step-pop flex items-start gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--halo-blue))] focus-visible:ring-offset-2"
            >
              <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--halo-blue))] text-white ring-4 ring-white">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="halo-stack-card grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-[hsl(var(--halo-navy)/0.08)] bg-white p-3 shadow-[0_18px_40px_-24px_hsl(var(--halo-navy)_/_0.45)] transition-[transform,box-shadow,border-color] duration-200 group-hover:border-[hsl(var(--halo-blue))]/30 group-hover:shadow-[0_24px_40px_-16px_hsl(var(--halo-navy)_/_0.5)]">
                <div className="h-16 w-[4.5rem] overflow-hidden rounded-lg border border-[hsl(var(--halo-navy)/0.08)] bg-[hsl(var(--halo-mist))]">
                  {step.piece.compact}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--halo-blue))]">
                    {step.label}
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold leading-4 text-[hsl(var(--halo-navy))]">
                    {step.line}
                  </p>
                  <div className="mt-1.5">{step.piece.footer}</div>
                </div>
              </div>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
