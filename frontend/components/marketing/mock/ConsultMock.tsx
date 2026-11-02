import { Mic, PhoneOff, User, Video } from "lucide-react";

/** A video consult with the chart beside it. No face and no name. */
export function ConsultMock() {
  return (
    <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[hsl(var(--halo-navy))]">
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Video consult
        </span>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white">
          <User className="h-7 w-7" aria-hidden />
        </span>
        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
            <Mic className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
            <Video className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
            <PhoneOff className="h-3.5 w-3.5" aria-hidden />
          </span>
        </span>
      </div>
      <div className="rounded-xl border border-[hsl(var(--halo-navy))]/10 p-3">
        <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
          Chart
        </p>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
          Reason for visit
        </p>
        <div className="mt-1.5 h-2 w-4/5 rounded-full bg-[hsl(var(--halo-ink))]/10" />
        <div className="mt-1.5 h-2 w-3/5 rounded-full bg-[hsl(var(--halo-ink))]/10" />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
          Vitals
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {["BP", "Pulse", "SpO₂"].map((label) => (
            <div
              key={label}
              className="rounded-lg bg-[hsl(var(--halo-mist))] px-1.5 py-1.5"
            >
              <p className="text-[10px] font-semibold text-[hsl(var(--halo-ink))]/55">
                {label}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[hsl(var(--halo-ink))]/10" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--halo-ink))]/45">
          History
        </p>
        <div className="mt-1.5 h-2 w-full rounded-full bg-[hsl(var(--halo-ink))]/10" />
        <div className="mt-1.5 h-2 w-2/3 rounded-full bg-[hsl(var(--halo-ink))]/10" />
      </div>
    </div>
  );
}
