import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Inbox,
  MessageSquare,
  Users,
  Video,
} from "lucide-react";

import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Smart capture",
    body: "Pull patient intent from Instagram DMs and comments automatically.",
  },
  {
    icon: Inbox,
    title: "Booking review queue",
    body: "Every request lands in one place for a quick confirm or reschedule.",
  },
  {
    icon: CalendarDays,
    title: "Appointments & OPD",
    body: "Manage your day, your OPD queue, and walk-ins without the chaos.",
  },
  {
    icon: Video,
    title: "Teleconsult",
    body: "Consult over text, voice, or video — built in, no extra tools.",
  },
  {
    icon: ClipboardList,
    title: "Clinical cockpit & Rx",
    body: "Chart the visit and send a prescription in the same flow.",
  },
  {
    icon: Users,
    title: "Patient records",
    body: "A clean history for every patient, ready before they arrive.",
  },
  {
    icon: BarChart3,
    title: "Practice insights",
    body: "See what's converting, what's booked, and what needs attention.",
  },
  {
    icon: Bell,
    title: "Alerts",
    body: "Get nudged about no-shows and requests before they slip.",
  },
] as const;

/** Feature grid — capabilities that map to shipped product surfaces. */
export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 bg-[hsl(var(--halo-mist))]/40 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            Everything you need to run your practice
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            From the first DM to the finished consultation — Halo Aid handles it all.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-black/5 p-6 shadow-sm">
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
  );
}
