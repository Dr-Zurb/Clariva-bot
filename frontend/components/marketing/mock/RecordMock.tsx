import Image from "next/image";
import { Check } from "lucide-react";

const ROWS = [
  { dose: "1-0-1", duration: "5 days" },
  { dose: "0-0-1", duration: "10 days" },
  { dose: "1-1-1", duration: "3 days" },
] as const;

/** A letterhead prescription. Medicine names are grey bars, not words. */
export function RecordMock() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[hsl(var(--halo-navy))]/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <Image
          src="/brand/halo-logomark.svg"
          alt=""
          aria-hidden
          width={24}
          height={24}
          className="h-6 w-6"
        />
        <p className="text-[13px] font-semibold text-[hsl(var(--halo-navy))]">
          Your clinic
        </p>
      </div>
      <div className="mt-2 h-px bg-[hsl(var(--halo-navy))]/10" />
      <p className="mt-2 font-serif text-2xl italic text-[hsl(var(--halo-blue))]">
        Rx
      </p>
      <div className="mt-2 space-y-2">
        {ROWS.map((row) => (
          <div key={row.dose} className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-[hsl(var(--halo-ink))]/10" />
            <span className="rounded-full bg-[hsl(var(--halo-mist))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--halo-navy))]">
              {row.dose}
            </span>
            <span className="w-12 text-[10px] text-[hsl(var(--halo-ink))]/55">
              {row.duration}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-[hsl(var(--halo-blue))]/30 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--halo-blue))]">
          Follow-up: in 2 weeks
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--halo-ink))]/60">
          <Check
            className="h-3.5 w-3.5 text-[hsl(var(--halo-blue))]"
            aria-hidden
          />
          Sent to patient
        </span>
      </div>
    </div>
  );
}
