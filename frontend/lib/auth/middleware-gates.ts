/**
 * Pure auth-routing decisions for middleware (auth-v2 · av2-04).
 *
 * `profile_completed` is routing-only (AV2-D3). `/admin` and `/desk` are NOT
 * gated on it so staff / admins cannot lock themselves out of those portals
 * (P1-Q2). Receptionists never land on the doctor dashboard.
 */

import type { AuthUserLike } from "@/lib/auth/post-auth";
import { isProfileCompleted, isReceptionistRole } from "@/lib/auth/post-auth";

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
  const isDesk = pathname === "/desk" || pathname.startsWith("/desk/");

  if (isCompleteProfile) {
    if (!user) return { redirect: "/login" };
    if (isReceptionistRole(user)) return { redirect: "/desk" };
    if (isProfileCompleted(user)) return { redirect: "/dashboard" };
    return "allow";
  }

  if ((isDashboard || isAdmin || isDesk) && !user) {
    return { redirect: "/login" };
  }

  if (isDashboard && user && isReceptionistRole(user)) {
    return { redirect: "/desk" };
  }

  // Incomplete → complete-profile for dashboard only (admin / desk left alone).
  if (isDashboard && user && !isProfileCompleted(user)) {
    return { redirect: "/complete-profile" };
  }

  return "allow";
}
