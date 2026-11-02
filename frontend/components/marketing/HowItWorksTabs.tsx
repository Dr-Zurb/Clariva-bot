"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BarChart3,
  CalendarCheck,
  Clapperboard,
  FileText,
  Video,
} from "lucide-react";

import { AnalysisMock } from "./mock/AnalysisMock";
import { BoardMock } from "./mock/BoardMock";
import { BookingPageMock } from "./mock/BookingPageMock";
import { BrowserFrame } from "./mock/BrowserFrame";
import { ConsultMock } from "./mock/ConsultMock";
import { HOW_STEP_EVENT } from "./howStep";
import { RecordMock } from "./mock/RecordMock";

const STEPS: readonly {
  title: string;
  body: string;
  label: string;
  icon: typeof Clapperboard;
  picture: ReactNode;
}[] = [
  {
    title: "Content",
    body: "Plan it on the board — Ideas, Chosen, Making, Ready — then put it on the schedule.",
    label:
      "Halo Aid post board. Acne reel is ready and has 1 booking for Thursday, 4:30 PM.",
    icon: Clapperboard,
    picture: <BoardMock />,
  },
  {
    title: "Booking",
    body: "They pick a time on your page. It joins the day's list with your walk-ins.",
    label:
      "Booking page opened from Acne reel, with Thursday at 4:30 PM selected.",
    icon: CalendarCheck,
    picture: <BookingPageMock />,
  },
  {
    title: "Consult",
    body: "The desk adds vitals and history before they sit down. See them in the clinic, or by video, voice, or text.",
    label: "Video consult beside a chart with vitals. No name and no face.",
    icon: Video,
    picture: <ConsultMock />,
  },
  {
    title: "Record",
    body: "Chart the visit and write the prescription on your letterhead. The PDF goes to the patient.",
    label:
      "Prescription on clinic letterhead, with a follow-up in 2 weeks, sent to the patient.",
    icon: FileText,
    picture: <RecordMock />,
  },
  {
    title: "Analysis",
    body: "See which posts led to a booking, and how many people opened your page.",
    label:
      "Acne reel led to 1 booking. Two other posts led to none. Page opens have no number.",
    icon: BarChart3,
    picture: <AnalysisMock />,
  },
];

const ADVANCE_MS = 6000;

/** Tabs on the left, the matching product screen on the right. */
export function HowItWorksTabs() {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [motion, setMotion] = useState<"unknown" | "reduce" | "ok">("unknown");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotion(media.matches ? "reduce" : "ok");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onStep = (event: Event) => {
      const index = (event as CustomEvent<number>).detail;
      if (!Number.isInteger(index) || index < 0 || index >= STEPS.length) {
        return;
      }
      setActive(index);
      setLocked(true);
    };
    window.addEventListener(HOW_STEP_EVENT, onStep);
    return () => window.removeEventListener(HOW_STEP_EVENT, onStep);
  }, []);

  useEffect(() => {
    if (motion !== "ok" || paused || locked || !inView) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % STEPS.length);
    }, ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [motion, paused, locked, inView]);

  function choose(index: number) {
    setActive(index);
    setLocked(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = STEPS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = Math.min(active + 1, last);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = Math.max(active - 1, 0);
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    }
    if (next === null || next === active) return;
    event.preventDefault();
    choose(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="mt-12 grid items-start gap-10 lg:mt-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setPaused(false);
        }
      }}
    >
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="How Halo Aid works"
        className="flex flex-col"
        onKeyDown={onKeyDown}
      >
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const selected = index === active;
          return (
            <div key={step.title} className="relative">
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute left-[23px] top-6 h-full w-0.5 ${
                    index < active
                      ? "bg-[hsl(var(--halo-blue))]"
                      : "bg-[hsl(var(--halo-blue))]/25"
                  }`}
                />
              ) : null}
              <button
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${index}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(index)}
                className={`relative flex w-full items-start gap-4 rounded-2xl px-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--halo-blue))] focus-visible:ring-offset-2 ${
                  selected ? "bg-[hsl(var(--halo-mist))]" : ""
                }`}
              >
                <span
                  className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                    index <= active
                      ? "bg-[hsl(var(--halo-blue))] text-white"
                      : "border border-[hsl(var(--halo-blue))]/25 bg-white text-[hsl(var(--halo-blue))]"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 pt-1">
                  <span
                    className={`block text-base ${
                      selected
                        ? "font-semibold text-[hsl(var(--halo-navy))]"
                        : "font-medium text-[hsl(var(--halo-ink))]/70"
                    }`}
                  >
                    {step.title}
                  </span>
                  {selected ? (
                    <span className="mt-1 block text-sm leading-6 text-[hsl(var(--halo-ink))]/70">
                      {step.body}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <div
          aria-hidden
          className="absolute left-4 top-8 -z-10 h-[calc(100%-1.5rem)] w-[calc(100%-0.75rem)] rounded-[2rem] bg-[hsl(var(--halo-wash))]"
        />
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={`${baseId}-tab-${active}`}
          className="relative h-[420px]"
        >
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              aria-hidden={index !== active}
              className={`absolute inset-0 ${
                index === active
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              } ${motion === "reduce" ? "" : "transition-opacity duration-200"}`}
            >
              <BrowserFrame label={step.label} className="h-full">
                {step.picture}
              </BrowserFrame>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
