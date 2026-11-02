import { Clapperboard, Play } from "lucide-react";

/** Acne reel: views have no number, one visit is booked. */
export function PostStatsCard() {
  return (
    <div
      role="img"
      aria-label="Acne reel. Views are not counted. 1 visit booked for Thursday, 4:30 PM."
      className="rounded-3xl border border-[hsl(var(--halo-navy))]/10 bg-white p-6 shadow-[0_30px_70px_-28px_hsl(var(--halo-navy)_/_0.45)]"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--halo-blue))] to-[hsl(var(--halo-sky))] text-white">
          <Clapperboard className="h-6 w-6" aria-hidden />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[hsl(var(--halo-blue))] shadow-sm">
            <Play className="h-3 w-3 fill-current" aria-hidden />
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-[hsl(var(--halo-navy))]">
            Acne reel
          </p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
            Reel
          </p>
        </div>
      </div>
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
            Views
          </p>
          <p className="text-xs text-[hsl(var(--halo-ink))]/55">On Instagram</p>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-[hsl(var(--halo-ink))]/10" />
      </div>
      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-semibold text-[hsl(var(--halo-navy))]">
            Visits booked
          </p>
          <p className="text-3xl font-bold leading-none text-[hsl(var(--halo-navy))]">
            1
          </p>
        </div>
        <div className="mt-2 h-2.5 w-2/5 rounded-full bg-[hsl(var(--halo-blue))]" />
        <p className="mt-2 text-xs text-[hsl(var(--halo-ink))]/55">
          Thursday, 4:30 PM
        </p>
      </div>
    </div>
  );
}
