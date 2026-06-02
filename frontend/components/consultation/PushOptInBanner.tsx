"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

export interface PushOptInBannerProps {
  counterpartyLabel: string;
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

/**
 * First-inbound-message push opt-in banner (task-text-D6b).
 * Shown above the message list on the patient standalone consult host.
 */
export function PushOptInBanner({
  counterpartyLabel,
  onEnable,
  onDismiss,
}: PushOptInBannerProps) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="mx-3 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900"
      data-testid="push-opt-in-banner"
      role="region"
      aria-label="Enable push notifications"
    >
      <span className="flex-1">
        {counterpartyLabel.includes("joins")
          ? `Get notified when ${counterpartyLabel} on this device.`
          : `Get notified when ${counterpartyLabel} replies on this device.`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onEnable().finally(() => setBusy(false));
          }}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          Enable
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
          disabled={busy}
          onClick={onDismiss}
        >
          Not now
        </button>
      </div>
    </div>
  );
}