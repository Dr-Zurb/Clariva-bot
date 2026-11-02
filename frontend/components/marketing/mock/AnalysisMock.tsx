import { Clapperboard } from "lucide-react";

const ROWS = [
  { title: "Acne reel", bookings: 1, opens: "100%" },
  { title: "Clinic tour", bookings: 0, opens: "70%" },
  { title: "Fees and timings", bookings: 0, opens: "46%" },
] as const;

/** Which posts led to a booking. Page opens have a bar and no number. */
export function AnalysisMock() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
          Posts that led to bookings
        </p>
        <span className="rounded-full bg-[hsl(var(--halo-mist))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--halo-navy))]">
          This month
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {ROWS.map((row) => (
          <div key={row.title} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--halo-blue))] to-[hsl(var(--halo-sky))] text-white">
              <Clapperboard className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[hsl(var(--halo-navy))]">
                {row.title}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] text-[hsl(var(--halo-ink))]/55">
                  Page opens
                </span>
                <span className="h-1.5 flex-1 rounded-full bg-[hsl(var(--halo-mist))]">
                  <span
                    className="block h-1.5 rounded-full bg-[hsl(var(--halo-ink))]/15"
                    style={{ width: row.opens }}
                  />
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] text-[hsl(var(--halo-ink))]/55">
                  Bookings
                </span>
                <span className="h-1.5 flex-1 rounded-full bg-[hsl(var(--halo-mist))]">
                  <span
                    className="block h-1.5 rounded-full bg-[hsl(var(--halo-blue))]"
                    style={{ width: row.bookings === 1 ? "28%" : "8%" }}
                  />
                </span>
                <span className="w-3 text-right text-[11px] font-semibold text-[hsl(var(--halo-navy))]">
                  {row.bookings}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
