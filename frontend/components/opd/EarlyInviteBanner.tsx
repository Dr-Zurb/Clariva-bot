"use client";

interface EarlyInviteBannerProps {
  expiresAt: string | null | undefined;
  busy: boolean;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}

/**
 * Early join offer (slot mode) — accept / decline (e-task-opd-05).
 */
export default function EarlyInviteBanner({
  expiresAt,
  busy,
  onAccept,
  onDecline,
}: EarlyInviteBannerProps) {
  return (
    <div
      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950"
      role="region"
      aria-label="Early join offer"
    >
      <p className="text-sm font-medium">Doctor is ready — join early?</p>
      <p className="mt-1 text-sm text-blue-900">
        You can join now without changing your official appointment time on file.
        {expiresAt ? (
          <span className="block mt-1 text-xs text-blue-800">
            Offer valid until {new Date(expiresAt).toLocaleString()}.
          </span>
        ) : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAccept()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Join early
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDecline()}
          className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          Keep my time
        </button>
      </div>
    </div>
  );
}
