"use client";

import { useEffect } from "react";
import { registerConsultServiceWorker } from "@/lib/text/share-target-bridge";

/**
 * Keeps the installed app's service worker current, and leaves the public
 * API address where the offline idea sheet can read it. No login token.
 */
export function RegisterConsultWorker() {
  useEffect(() => {
    try {
      const api = process.env.NEXT_PUBLIC_API_URL ?? "";
      const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (api) localStorage.setItem("halo-idea-api", api);
      if (supabase) localStorage.setItem("halo-idea-supabase", supabase);
      if (anon) localStorage.setItem("halo-idea-anon", anon);
    } catch {
      // Private mode can block storage. The idea sheet still opens.
    }
    void registerConsultServiceWorker();
  }, []);

  return null;
}
