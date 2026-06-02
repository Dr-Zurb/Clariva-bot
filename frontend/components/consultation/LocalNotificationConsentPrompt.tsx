"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { requestLocalNotificationPermission } from "@/lib/push/local-notifications";

export interface LocalNotificationConsentPromptProps {
  sessionId: string;
  onEnabled: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

/**
 * First-inbound-message local notification consent (task-text-D7).
 * Patient-only; mounted above the message list in TextConsultRoom.
 */
export function LocalNotificationConsentPrompt({
  sessionId,
  onEnabled,
  onSnooze,
  onDismiss,
}: LocalNotificationConsentPromptProps) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="mx-3 mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      data-testid="local-notif-consent-prompt"
      role="region"
      aria-label="Enable local notifications"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Get notified about new messages?</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            We&apos;ll show a notification when you&apos;re on another tab. No data leaves your
            device.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Dismiss notification prompt"
          disabled={busy}
          onClick={onDismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void requestLocalNotificationPermission()
              .finally(() => {
                setBusy(false);
                onEnabled();
              });
          }}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          Enable
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          disabled={busy}
          onClick={onSnooze}
        >
          Not now
        </button>
      </div>
      <span className="sr-only" data-session-id={sessionId} />
    </div>
  );
}
