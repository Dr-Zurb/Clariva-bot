import {
  BarChart3,
  Bell,
  CalendarDays,
  Columns3,
  FileText,
  Link2,
  RefreshCw,
  Stethoscope,
  Users,
  Video,
  Wallet,
} from "lucide-react";

import { Card } from "@/components/ui/card";

const FEATURE_GROUPS = [
  {
    label: "Get patients",
    features: [
      {
        icon: Columns3,
        title: "Board",
        body: "Ideas, Chosen, Making, and Ready. One board, instead of notes everywhere.",
      },
      {
        icon: CalendarDays,
        title: "Schedule",
        body: "See what goes out, and when. You put each post on it.",
      },
      {
        icon: BarChart3,
        title: "Analytics",
        body: "Which posts led to a booking, and how many people opened your page.",
      },
      {
        icon: Link2,
        title: "Booking page",
        body: "A page behind every post, so a visit can be booked from it.",
      },
    ],
  },
  {
    label: "See patients",
    features: [
      {
        icon: Users,
        title: "Front desk",
        body: "Staff logins, walk-ins, and check-in — vitals, history, labs, and papers.",
      },
      {
        icon: CalendarDays,
        title: "OPD queue",
        body: "Booked slots and walk-ins on one list for the day.",
      },
      {
        icon: Stethoscope,
        title: "Patient chart",
        body: "History, allergies, and vitals, ready before they sit down.",
      },
      {
        icon: FileText,
        title: "Prescriptions",
        body: "Templates, your letterhead, and the PDF emailed to the patient.",
      },
      {
        icon: Video,
        title: "Teleconsult",
        body: "Video, voice, or text, with the chart in the same visit.",
      },
    ],
  },
  {
    label: "Keep patients",
    features: [
      {
        icon: FileText,
        title: "Visit history",
        body: "The last visit is waiting when they come back.",
      },
      {
        icon: RefreshCw,
        title: "Follow-ups",
        body: "A follow-up date on the prescription, so the next visit is already named.",
      },
      {
        icon: BarChart3,
        title: "Insights",
        body: "Practice health for the period you pick.",
      },
      {
        icon: Bell,
        title: "Alerts",
        body: "A nudge when a no-show or a request needs you.",
      },
    ],
  },
] as const;

/** Social, the visit, and the record — grouped as get, see, keep. */
export function FeatureGrid() {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-[hsl(var(--halo-mist))]/40 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            The post, the visit, and the record
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            One product. Nothing stitched together from five apps.
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
        <p className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-2 text-center text-sm text-[hsl(var(--halo-ink))]/70">
          <Wallet className="h-4 w-4 shrink-0 text-[hsl(var(--halo-blue))]" aria-hidden />
          Patients pay into your own account. Halo Aid never takes a cut.
        </p>
      </div>
    </section>
  );
}
