import {
  Bell,
  CalendarDays,
  ClipboardList,
  Inbox,
  MessageSquare,
  Users,
  Video,
} from "lucide-react";

import { Card } from "@/components/ui/card";

const FEATURE_GROUPS = [
  {
    label: "They arrive",
    features: [
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
    ],
  },
  {
    label: "You see them",
    features: [
      {
        icon: Video,
        title: "Teleconsult",
        body: "See patients over video, voice, or text — built in, no extra tools.",
      },
      {
        icon: CalendarDays,
        title: "Appointments & OPD",
        body: "Run the day, the queue, and walk-ins in-clinic.",
      },
      {
        icon: ClipboardList,
        title: "Clinical cockpit & Rx",
        body: "Chart the visit and send a prescription in the same flow.",
      },
    ],
  },
  {
    label: "They come back",
    features: [
      {
        icon: Users,
        title: "Patient records",
        body: "A clean history for every patient, ready before they arrive.",
      },
      {
        icon: Bell,
        title: "Alerts",
        body: "Get nudged about no-shows and requests before they slip.",
      },
    ],
  },
] as const;

/** Feature grid — capabilities grouped as arrive → see → return. */
export function FeatureGrid() {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-[hsl(var(--halo-mist))]/40 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            Everything you need to run your practice
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            From the first DM to the follow-up visit — one product, nothing
            stitched together.
          </p>
        </div>
        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--halo-blue))]">
                {group.label}
              </p>
              <div className="mt-4 space-y-4">
                {group.features.map((feature) => {
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
          ))}
        </div>
      </div>
    </section>
  );
}
