import {
  CalendarCheck,
  ClipboardList,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Post",
    body: "Plan it on the board — Ideas, Chosen, Making, Ready — then put it on the schedule.",
  },
  {
    icon: CalendarCheck,
    title: "Book",
    body: "They pick a time on your page. The booking lands on the post that sent them.",
  },
  {
    icon: Users,
    title: "Check in",
    body: "The desk adds walk-ins, vitals, and history before they sit down.",
  },
  {
    icon: Stethoscope,
    title: "See",
    body: "Chart the visit, write the prescription, or see them by video, voice, or text.",
  },
  {
    icon: RefreshCw,
    title: "Come back",
    body: "The record is waiting, and the post that brought them is counted.",
  },
] as const;

/** Five steps from a post to the next visit. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            How Halo Aid works
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            From the post to the follow-up.
          </p>
        </div>
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
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
