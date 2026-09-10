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

/**
 * Admin console gate (admin-console-v1 · acon-02).
 *
 * Requires a logged-in user whose JWT carries `app_metadata.role === 'admin'`
 * (set server-side — never by the client). Non-admins are redirected to the
 * doctor dashboard; unauthenticated users go to `/login`. Belt-and-suspenders
 * on top of the backend `requireAdminJwtOrSecret` 403.
 */
export async function requireAdminAuth(): Promise<{ user: User; token: string }> {
  const { user, token } = await requireDashboardAuth();
  const role = user.app_metadata?.role;
  if (role !== "admin") {
    redirect("/dashboard");
  }
  return { user, token };
}

/**
 * Front-desk portal gate (receptionist-portal P3).
 *
 * Login required. JWT `receptionist` is a hint — backend `clinic_staff` is
 * authoritative (unlinked / suspended staff see the 403 empty state).
 * Admins are sent to `/admin`. Doctors are allowed so the founder can
 * exercise the desk during the pilot. Receptionists skip `profile_completed`.
 */
export async function requireDeskAuth(): Promise<{ user: User; token: string }> {
  const { user, token } = await requireDashboardAuth();
  if (user.app_metadata?.role === "admin") {
    redirect("/admin");
  }
  return { user, token };
}
