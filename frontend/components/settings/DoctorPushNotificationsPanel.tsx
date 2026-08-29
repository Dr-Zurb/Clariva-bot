"use client";

/**
 * Settings → Account — doctor Web Push for “patient joined call” (voice-C3).
 * Replaces the global DashboardShell banner (2026-08-06 product decision).
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DOCTOR_PUSH_OPT_IN_DISMISS_KEY,
  usePushSubscription,
} from "@/lib/text/use-push-subscription";
import { createClient } from "@/lib/supabase/client";

export function DoctorPushNotificationsPanel() {
  const [accessToken, setAccessToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        const token = session?.access_token?.trim() ?? "";
        if (!token) {
          setTokenError("Sign in again to manage notifications.");
          return;
        }
        setAccessToken(token);
      } catch {
        if (!cancelled) setTokenError("Could not load session.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const push = usePushSubscription({
    accessToken,
    enabled: Boolean(accessToken),
    dismissStorageKey: DOCTOR_PUSH_OPT_IN_DISMISS_KEY,
  });

  if (tokenError) {
    return <p className="text-sm text-muted-foreground">{tokenError}</p>;
  }

  if (!accessToken) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy>
        Loading…
      </p>
    );
  }

  if (push.notSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications aren’t supported in this browser.
      </p>
    );
  }

  if (push.permission === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for this site. Enable them in your browser
        settings, then return here to turn them on.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Get a notification on this device when a patient joins your voice or
        video call — useful if you’ve stepped away from the tab.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {push.subscribed ? (
          <>
            <p className="text-sm font-medium text-foreground">Enabled on this device</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void push.unsubscribe().finally(() => setBusy(false));
              }}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : null}
              Turn off
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void push.subscribe().finally(() => setBusy(false));
            }}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : null}
            Enable notifications
          </Button>
        )}
      </div>
    </div>
  );
}
