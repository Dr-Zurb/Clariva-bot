import { HowItWorksTabs } from "./HowItWorksTabs";

/** Close-up of the five hero steps. The tabs are the only client piece. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--halo-blue))]">
          How it works
        </p>
        <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
          From the post to the follow-up.
        </h2>
        <HowItWorksTabs />
      </div>
    </section>
  );
}
