import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  Columns3,
  FileText,
  Link2,
  RefreshCw,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";

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

const VIGNETTES = [GetPatientsPicture, SeePatientsPicture, KeepPatientsPicture];

/** Social, the visit, and the record — grouped as get, see, keep. */
export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            The post, the visit, and the record
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            One product. Nothing stitched together from five apps.
          </p>
        </div>
        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group, index) => {
            const Picture = VIGNETTES[index];
            return (
              <article
                key={group.label}
                className="flex flex-col rounded-3xl border border-[hsl(var(--halo-navy))]/10 bg-white p-6 sm:p-8"
              >
                <Picture />
                <h3 className="mt-5 text-xl font-semibold text-[hsl(var(--halo-navy))]">
                  {group.label}
                </h3>
                <ul className="mt-4 space-y-4">
                  {group.features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <li key={feature.title} className="flex gap-3">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--halo-blue))]/10 text-[hsl(var(--halo-blue))]"
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[hsl(var(--halo-navy))]">
                            {feature.title}
                          </span>
                          <span className="mt-0.5 block text-sm leading-5 text-[hsl(var(--halo-ink))]/65">
                            {feature.body}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function GetPatientsPicture() {
  return (
    <div
      role="img"
      aria-label="Ready column. Acne reel has 1 booking."
      className="flex h-44 flex-col rounded-2xl bg-[hsl(var(--halo-mist))] p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/50">
          Ready
        </p>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--halo-ink))]/50">
          1
        </span>
      </div>
      <div className="mt-3 rounded-lg border-2 border-[hsl(var(--halo-blue))]/30 bg-white p-2.5">
        <p className="text-[12px] font-semibold text-[hsl(var(--halo-navy))]">
          Acne reel
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
          Reel
        </p>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--halo-blue))] px-2 py-0.5 text-[10px] font-semibold text-white">
          <CalendarCheck className="h-3 w-3" aria-hidden />1 booking
        </p>
      </div>
    </div>
  );
}

function SeePatientsPicture() {
  const rows = [
    ["10:00 AM", "Walk-in", "Checked in"],
    ["11:30 AM", "Booked", "In clinic"],
    ["4:30 PM", "Booked", "Video"],
  ] as const;
  return (
    <div
      role="img"
      aria-label="Today's list. A walk-in, a clinic visit, and a video visit. No names."
      className="flex h-44 flex-col rounded-2xl bg-[hsl(var(--halo-mist))] p-4"
    >
      <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
        Today
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row[0]}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px]"
          >
            <span className="font-semibold text-[hsl(var(--halo-navy))]">
              {row[0]}
            </span>
            <span className="text-[hsl(var(--halo-ink))]/55">{row[1]}</span>
            <span className="font-medium text-[hsl(var(--halo-blue))]">
              {row[2]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeepPatientsPicture() {
  const visits = ["12 Oct", "28 Sep", "02 Sep"] as const;
  return (
    <div
      role="img"
      aria-label="Follow-up in 2 weeks, and three earlier visits with no names."
      className="flex h-44 flex-col rounded-2xl bg-[hsl(var(--halo-mist))] p-4"
    >
      <p className="w-fit rounded-full border border-[hsl(var(--halo-blue))]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--halo-blue))]">
        Follow-up: in 2 weeks
      </p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/50">
        Visit history
      </p>
      <ul className="mt-2 space-y-1.5">
        {visits.map((date) => (
          <li key={date} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] font-semibold text-[hsl(var(--halo-navy))]">
              {date}
            </span>
            <span className="h-2 flex-1 rounded-full bg-white" />
          </li>
        ))}
      </ul>
    </div>
  );
}
