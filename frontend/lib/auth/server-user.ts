import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-scoped Supabase server client (np-06).
 * React `cache()` dedupes within a single render — layout + page share one instance.
 */
export const getServerSupabase = cache(async () => createClient());

/** Memoized `auth.getUser()` — one underlying read per navigation. */
export const getServerUser = cache(async () => {
  const supabase = await getServerSupabase();
  return supabase.auth.getUser();
});

/** Memoized `auth.getSession()` — shares the cached client with getServerUser. */
export const getServerSession = cache(async () => {
  const supabase = await getServerSupabase();
  return supabase.auth.getSession();
});

/**
 * Dashboard auth gate used by pages that need the access token for `lib/api.ts`.
 * Redirect targets match the legacy per-page checks (`/login`).
 */
export async function requireDashboardAuth(): Promise<{ user: User; token: string }> {
  const {
    data: { user },
  } = await getServerUser();
  if (!user) redirect("/login");

  const {
    data: { session },
  } = await getServerSession();
  const token = session?.access_token ?? "";
  if (!token) redirect("/login");

  return { user, token };
}
