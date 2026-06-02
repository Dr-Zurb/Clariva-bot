"use client";

import { useEffect, useState } from "react";
import { PushOptInBanner } from "@/components/consultation/PushOptInBanner";
import {
  DOCTOR_PUSH_OPT_IN_DISMISS_KEY,
  usePushSubscription,
} from "@/lib/text/use-push-subscription";

const DOCTOR_PUSH_OPT_IN_SEEN_KEY = "clariva:push:doctor-opt-in-seen";

export interface DashboardPushOptInPromptProps {
  accessToken: string;
}

/**
 * One-time doctor dashboard prompt to enable Web Push when patients join
 * voice/video calls (voice-C3 · T5.32).
 */
export function DashboardPushOptInPrompt({ accessToken }: DashboardPushOptInPromptProps) {
  const [eligible, setEligible] = useState(false);
  const push = usePushSubscription({
    accessToken,
    enabled: Boolean(accessToken.trim()),
    dismissStorageKey: DOCTOR_PUSH_OPT_IN_DISMISS_KEY,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DOCTOR_PUSH_OPT_IN_SEEN_KEY) === "1") {
      setEligible(true);
      return;
    }
    window.localStorage.setItem(DOCTOR_PUSH_OPT_IN_SEEN_KEY, "1");
    setEligible(true);
  }, []);

  const show =
    eligible &&
    push.permission === "default" &&
    !push.isDismissed &&
    !push.notSupported &&
    !push.subscribed;

  if (!show) return null;

  return (
    <div className="mb-4">
      <PushOptInBanner
        counterpartyLabel="a patient joins your call"
        onEnable={push.subscribe}
        onDismiss={push.dismissOptIn}
      />
    </div>
  );
}
