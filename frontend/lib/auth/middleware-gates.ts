/**
 * Pure auth-routing decisions for middleware (auth-v2 · av2-04).
 *
 * `profile_completed` is routing-only (AV2-D3). `/admin` is NOT gated on it
 * so an admin without the flag cannot lock themselves out of the console.
 */

import type { AuthUserLike } from "@/lib/auth/post-auth";
import { isProfileCompleted } from "@/lib/auth/post-auth";

export type AuthGateResult = "allow" | { redirect: string };

export function resolveAuthGate(input: {
  pathname: string;
  user: AuthUserLike;
}): AuthGateResult {
  const { pathname, user } = input;
  const isCompleteProfile =
    pathname === "/complete-profile" ||
    pathname.startsWith("/complete-profile/");
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");

  if (isCompleteProfile) {
    if (!user) return { redirect: "/login" };
    if (isProfileCompleted(user)) return { redirect: "/dashboard" };
    return "allow";
  }

  if ((isDashboard || isAdmin) && !user) {
    return { redirect: "/login" };
  }

  // Incomplete → complete-profile for dashboard only (admin left alone).
  if (isDashboard && user && !isProfileCompleted(user)) {
    return { redirect: "/complete-profile" };
  }

  return "allow";
}
