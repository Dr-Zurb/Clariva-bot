"use client";

import { useEffect, useState } from "react";
import { safeNextPath } from "@/lib/auth/post-auth";

const INTEGRATIONS = "/dashboard/settings/integrations";

/**
 * Break Chrome's cross-site redirect-chain attribution so SameSite=Lax
 * Supabase cookies are included on the follow-up navigation into /dashboard.
 * Immediate location.replace on first paint often still lands on /login.
 */
const REDIRECT_DELAY_MS = 300;

type OAuthReturnBridgeProps = {
  /** Query string without `?` (e.g. `connected=1` or `fb_connected=1&error=…`). */
  search: string;
};

export function OAuthReturnBridge({ search }: OAuthReturnBridgeProps) {
  const target = safeNextPath(
    `${INTEGRATIONS}${search ? `?${search}` : ""}`,
    INTEGRATIONS
  );
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    const navTimer = window.setTimeout(() => {
      window.location.replace(target);
    }, REDIRECT_DELAY_MS);
    const continueTimer = window.setTimeout(() => {
      setShowContinue(true);
    }, 1200);
    return () => {
      window.clearTimeout(navTimer);
      window.clearTimeout(continueTimer);
    };
  }, [target]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">Returning to Integrations…</p>
      {showContinue ? (
        <a
          href={target}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Continue to Integrations
        </a>
      ) : null}
    </div>
  );
}
