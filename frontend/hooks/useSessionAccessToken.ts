"use client";

import { useEffect, useState } from "react";
import {
  accessTokenNeedsRefresh,
  getFreshBrowserAccessToken,
} from "@/lib/auth/browser-access-token";
import { createClient } from "@/lib/supabase/client";

/**
 * Live access token for client pages that sit open for hours (desk
 * registration). Starts from an optional SSR token, then follows
 * Supabase refresh + tab-focus so API calls do not keep a dead JWT.
 */
export function useSessionAccessToken(initialToken = "") {
  const [token, setToken] = useState(initialToken);
  const [isLoading, setIsLoading] = useState(!initialToken);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const apply = (next: string) => {
      if (!cancelled && next) setToken(next);
    };

    const sync = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const stored = session?.access_token ?? "";
        if (stored && accessTokenNeedsRefresh(stored)) {
          apply(await getFreshBrowserAccessToken(stored));
        } else if (stored) {
          apply(stored);
        }
      } catch {
        // Keep the last known token (SSR or previous refresh).
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    try {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        apply(session?.access_token ?? "");
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // Tests / missing env — stay on initialToken.
    }

    void sync();

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      unsubscribe?.();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { token, isLoading };
}
