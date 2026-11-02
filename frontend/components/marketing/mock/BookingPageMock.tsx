import { Link2 } from "lucide-react";

const TIMES = [
  { label: "10:00 AM", state: "open" },
  { label: "11:30 AM", state: "open" },
  { label: "4:30 PM", state: "picked" },
  { label: "5:00 PM", state: "open" },
  { label: "6:30 PM", state: "gone" },
] as const;

/** The public booking page, opened from Acne reel. */
export function BookingPageMock() {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--halo-blue))]">
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        Opened from Acne reel
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span
          aria-hidden
          className="h-8 w-8 rounded-full bg-[hsl(var(--halo-blue))]"
        />
        <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
          Your clinic
        </p>
      </div>
      <p className="mt-4 text-[15px] font-semibold text-[hsl(var(--halo-navy))]">
        Pick a time
      </p>
      <div className="mt-3 flex gap-2">
        {["Wed", "Thu", "Fri"].map((day) => (
          <span
            key={day}
            className={
              day === "Thu"
                ? "rounded-full bg-[hsl(var(--halo-blue))] px-3 py-1 text-[12px] font-semibold text-white"
                : "rounded-full border border-[hsl(var(--halo-blue))]/20 px-3 py-1 text-[12px] font-semibold text-[hsl(var(--halo-blue))]"
            }
          >
            {day}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {TIMES.map((time) => (
          <span
            key={time.label}
            className={
              time.state === "picked"
                ? "rounded-lg bg-[hsl(var(--halo-blue))] px-2 py-2 text-center text-[12px] font-semibold text-white"
                : time.state === "gone"
                  ? "rounded-lg bg-[hsl(var(--halo-mist))] px-2 py-2 text-center text-[12px] font-medium text-[hsl(var(--halo-ink))]/35 line-through"
                  : "rounded-lg border border-[hsl(var(--halo-navy))]/10 px-2 py-2 text-center text-[12px] font-semibold text-[hsl(var(--halo-navy))]"
            }
          >
            {time.label}
          </span>
        ))}
      </div>
      <p className="mt-4 rounded-lg bg-[hsl(var(--halo-blue))] py-2.5 text-center text-[13px] font-semibold text-white">
        Book Thursday, 4:30 PM
      </p>
    </div>
  );
}
