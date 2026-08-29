import { Card } from "@/components/ui/card";

/**
 * Social proof for `/`. Intentionally empty until we have real doctor quotes
 * + consent — placeholder names must not ship on the marketing homepage.
 *
 * When ready: fill `QUOTES`, then remount `<Testimonials />` in `app/page.tsx`
 * (removed 2026-07-24). Capture: docs/Work/capture/inbox.md.
 */
const QUOTES = [] as const;

type Quote = {
  quote: string;
  name: string;
  role: string;
};

/** Social proof — hidden while `QUOTES` is empty. */
export function Testimonials() {
  const quotes = QUOTES as readonly Quote[];
  if (quotes.length === 0) {
    return null;
  }

  return (
    <section className="bg-[hsl(var(--halo-mist))]/40 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--halo-navy))] sm:text-4xl">
            Doctors love the calm inbox
          </h2>
          <p className="mt-4 text-lg text-[hsl(var(--halo-ink))]/70">
            Less chasing messages. More time with patients.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {quotes.map((item) => (
            <Card key={item.name} className="flex flex-col border-black/5 p-6 shadow-sm">
              <p className="flex-1 text-[hsl(var(--halo-ink))]/80">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--halo-blue))]/10 text-sm font-semibold text-[hsl(var(--halo-blue))]"
                >
                  {item.name
                    .split(" ")
                    .slice(-1)[0]
                    ?.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
                    {item.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--halo-ink))]/60">{item.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
