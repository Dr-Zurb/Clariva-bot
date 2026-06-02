"use client";

/**
 * Queue mode: highlight when snapshot hints include your_turn_soon (OPD-09).
 */
export default function TurnSoonBanner() {
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      role="status"
      aria-live="polite"
    >
      You&apos;re almost up — stay nearby; the doctor may call you soon.
    </div>
  );
}
