const STEPS = [
  "Plan the post",
  "Book the visit",
  "Prescribe",
  "Keep the record",
  "Follow up",
  "See what worked",
] as const;

/** Problem strip: the practice already does these. They do not sit together. */
export function ThesisBand() {
  return (
    <section className="bg-[hsl(var(--halo-navy))] py-14 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          They already happen. Not in one place.
        </h2>
        <ol className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-white/80 sm:text-base">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span>{step}</span>
              {index < STEPS.length - 1 ? (
                <span aria-hidden className="text-white/40">
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
