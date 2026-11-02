import type { ReactNode } from "react";
import {
  Calendar,
  Check,
  Link2,
  Mic,
  PhoneOff,
  Play,
  User,
  Video,
} from "lucide-react";

/** Picture box and bottom row for one hero step. Decorative. */

export type FlowPiece = {
  tile: ReactNode;
  /** Fits the 72px picture on the phone stack. */
  compact: ReactNode;
  footer: ReactNode;
};

const STAGE =
  "inline-flex h-[18px] items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-none";

const SLOT =
  "flex h-[22px] items-center justify-center gap-1 rounded-md border text-[11px] font-semibold leading-none";

export const contentPiece: FlowPiece = {
  tile: (
    <div className="flex h-full flex-col bg-white">
      <div className="halo-gradient relative min-h-0 flex-1">
        <span className="absolute left-1.5 top-1.5 rounded bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
          Reel
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
            <Play
              className="h-4 w-4 fill-[hsl(var(--halo-navy))] text-[hsl(var(--halo-navy))]"
              aria-hidden
            />
          </span>
        </span>
      </div>
      <span className="shrink-0 truncate px-1.5 py-1 text-left text-[11px] font-semibold leading-none text-[hsl(var(--halo-navy))]">
        Acne reel
      </span>
    </div>
  ),
  compact: (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-1">
      <span className="halo-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white">
        <Play className="h-3 w-3 fill-white" aria-hidden />
      </span>
      <span className="text-center text-[10px] font-semibold leading-3 text-[hsl(var(--halo-navy))]">
        Acne reel
      </span>
    </div>
  ),
  footer: (
    <span className="grid w-full grid-cols-2 gap-1">
      {["Idea", "Choose", "Make"].map((label) => (
        <span
          key={label}
          className={`${STAGE} border-[hsl(var(--halo-blue))]/25 text-[hsl(var(--halo-blue))]`}
        >
          {label}
        </span>
      ))}
      <span
        className={`${STAGE} border-transparent bg-[hsl(var(--halo-blue))] text-white`}
      >
        Ready
      </span>
    </span>
  ),
};

export const bookingPiece: FlowPiece = {
  tile: (
    <div className="flex h-full flex-col bg-white px-1.5 py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-semibold leading-none text-[hsl(var(--halo-navy))]">
        <Calendar
          className="h-3 w-3 shrink-0 text-[hsl(var(--halo-blue))]"
          aria-hidden
        />
        Thursday
      </span>
      <span className="mt-1 flex min-h-0 flex-1 flex-col justify-center gap-1">
        <span
          className={`${SLOT} border-[hsl(var(--halo-ink))]/15 text-[hsl(var(--halo-ink))]/45`}
        >
          4:00 PM
        </span>
        <span
          className={`${SLOT} border-transparent bg-[hsl(var(--halo-blue))] text-white`}
        >
          4:30 PM
          <Check className="h-3 w-3" aria-hidden />
        </span>
        <span
          className={`${SLOT} border-[hsl(var(--halo-ink))]/15 text-[hsl(var(--halo-ink))]/45`}
        >
          5:00 PM
        </span>
      </span>
    </div>
  ),
  compact: (
    <div className="flex h-full flex-col items-center justify-center gap-0.5 px-1">
      <span className="w-8 overflow-hidden rounded-md border border-[hsl(var(--halo-navy))]/10 bg-white">
        <span className="block bg-[hsl(var(--halo-blue))] py-0.5 text-center text-[10px] font-semibold leading-none text-white">
          THU
        </span>
        <span className="flex h-4 items-center justify-center text-[hsl(var(--halo-blue))]">
          <Check className="h-3 w-3" aria-hidden />
        </span>
      </span>
      <span className="text-center text-[10px] font-semibold leading-3 text-[hsl(var(--halo-navy))]">
        4:30 PM
      </span>
    </div>
  ),
  footer: (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-[hsl(var(--halo-blue))]">
      <Link2 className="h-3 w-3 shrink-0" aria-hidden />
      From Acne reel
    </span>
  ),
};

const VISIT =
  "inline-flex h-[18px] w-full items-center justify-center whitespace-nowrap rounded-full border border-[hsl(var(--halo-blue))]/25 px-0.5 text-[10px] font-semibold leading-none text-[hsl(var(--halo-blue))]";

export const consultPiece: FlowPiece = {
  tile: (
    <div className="relative flex h-full flex-col bg-[hsl(var(--halo-navy))] text-white">
      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium leading-none">
        <Video className="h-2.5 w-2.5" aria-hidden />
        Video
      </span>
      <span
        aria-hidden
        className="absolute right-1.5 top-1.5 h-5 w-7 rounded border border-white/30 bg-white/10"
      />
      <span className="flex min-h-0 flex-1 items-center justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <User className="h-5 w-5" aria-hidden />
        </span>
      </span>
      <span className="flex items-center justify-center gap-1.5 pb-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <Mic className="h-3 w-3" aria-hidden />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <Video className="h-3 w-3" aria-hidden />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
          <PhoneOff className="h-3 w-3" aria-hidden />
        </span>
      </span>
    </div>
  ),
  compact: (
    <div className="relative flex h-full items-center justify-center bg-[hsl(var(--halo-navy))] text-white">
      <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-1 py-0.5 text-[9px] font-medium leading-none">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Video
      </span>
      <span className="mt-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
        <User className="h-3.5 w-3.5" aria-hidden />
      </span>
    </div>
  ),
  footer: (
    <span className="flex w-full flex-col gap-1">
      <span className="grid grid-cols-3 gap-0.5">
        {["Text", "Voice", "Video"].map((label) => (
          <span
            key={label}
            className={VISIT}
          >
            {label}
          </span>
        ))}
      </span>
      <span
        className={VISIT}
      >
        In-clinic visits
      </span>
    </span>
  ),
};

export const recordPiece: FlowPiece = {
  tile: (
    <div className="flex h-full flex-col justify-between bg-white px-2 py-1.5">
      <span className="flex items-center gap-1.5">
        <span className="font-serif text-sm italic leading-none text-[hsl(var(--halo-blue))]">
          Rx
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block h-1 rounded-full bg-[hsl(var(--halo-ink))]/10" />
          <span className="block h-1 w-2/3 rounded-full bg-[hsl(var(--halo-ink))]/10" />
        </span>
      </span>
      <span className="block h-px bg-[hsl(var(--halo-ink))]/10" />
      <span className="space-y-1">
        {["1-0-1", "0-0-1"].map((dose) => (
          <span key={dose} className="flex items-center gap-1.5">
            <span className="h-1.5 min-w-0 flex-1 rounded-full bg-[hsl(var(--halo-ink))]/10" />
            <span className="rounded-full bg-[hsl(var(--halo-mist))] px-1.5 text-[10px] font-medium leading-none text-[hsl(var(--halo-navy))]">
              {dose}
            </span>
          </span>
        ))}
      </span>
      <span className="space-y-1">
        <span className="block h-1 rounded-full bg-[hsl(var(--halo-ink))]/10" />
        <span className="block h-1 w-3/4 rounded-full bg-[hsl(var(--halo-ink))]/10" />
      </span>
    </div>
  ),
  compact: (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-white px-1">
      <span className="font-serif text-base italic leading-none text-[hsl(var(--halo-blue))]">
        Rx
      </span>
      <span className="text-[10px] font-medium leading-3 text-[hsl(var(--halo-navy))]">
        1-0-1
        <br />
        0-0-1
      </span>
    </div>
  ),
  footer: (
    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-[hsl(var(--halo-blue))]/30 px-2 text-[10px] font-medium leading-none text-[hsl(var(--halo-blue))]">
      Follow-up: 2 weeks
    </span>
  ),
};

export const analysisPiece: FlowPiece = {
  tile: (
    <div className="flex h-full flex-col justify-between bg-white px-1.5 py-1.5">
      <span>
        <span className="block text-[10px] leading-none text-[hsl(var(--halo-ink))]/55">
          Page opens
        </span>
        <span className="mt-1 block h-1.5 w-full rounded-full bg-[hsl(var(--halo-ink))]/10" />
      </span>
      <span>
        <span className="block text-[10px] leading-none text-[hsl(var(--halo-ink))]/55">
          Bookings
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1/3 rounded-full bg-[hsl(var(--halo-blue))]" />
          <span className="text-[11px] font-semibold leading-none text-[hsl(var(--halo-navy))]">
            1
          </span>
        </span>
      </span>
      <span className="block h-px bg-[hsl(var(--halo-ink))]/10" />
      <span>
        <span className="block text-[10px] leading-none text-[hsl(var(--halo-ink))]/55">
          Booked
        </span>
        <span className="mt-1 block whitespace-nowrap text-[10px] font-semibold leading-none text-[hsl(var(--halo-navy))]">
          Thursday, 4:30 PM
        </span>
      </span>
    </div>
  ),
  compact: (
    <div className="flex h-full flex-col justify-center gap-1 px-1.5">
      <span>
        <span className="block text-[9px] leading-none text-[hsl(var(--halo-ink))]/55">
          Page opens
        </span>
        <span className="mt-0.5 block h-1 w-full rounded-full bg-[hsl(var(--halo-ink))]/10" />
      </span>
      <span>
        <span className="block text-[9px] leading-none text-[hsl(var(--halo-ink))]/55">
          Bookings
        </span>
        <span className="mt-0.5 flex items-center gap-1">
          <span className="h-1 w-5 rounded-full bg-[hsl(var(--halo-blue))]" />
          <span className="text-[10px] font-semibold leading-none text-[hsl(var(--halo-navy))]">
            1
          </span>
        </span>
      </span>
    </div>
  ),
  footer: (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-[hsl(var(--halo-navy))]">
      <Play className="h-3 w-3 fill-[hsl(var(--halo-navy))]" aria-hidden />
      Acne reel
    </span>
  ),
};
