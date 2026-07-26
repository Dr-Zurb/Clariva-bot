import { CalendarCheck, MessageCircle, MonitorPlay, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: MessageCircle,
    title: "Patient DMs & Comments",
    body: "Patients reach out on Instagram — in your DMs and under your posts.",
  },
  {
    icon: Sparkles,
    title: "Smart Capture & Response",
    body: "Halo Aid reads the intent and replies instantly with the right next step.",
  },
  {
    icon: CalendarCheck,
    title: "Booking Confirmed",
    body: "The visit is scheduled and confirmed — no back-and-forth, no missed leads.",
  },
  {
    icon: MonitorPlay,
    title: "Consultation Happens",
    body: "Meet your patient over text, voice, or video, right inside Halo Aid.",
  },
] as const;

/** The 4-step "how it works" flow from the brand infographic. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            How Halo Aid works
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            Turn patient DMs and comments into booked consultations — in four steps.
          </p>
        </div>
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
  );
}
