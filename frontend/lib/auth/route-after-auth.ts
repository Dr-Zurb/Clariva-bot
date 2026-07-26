/**
 * Client-side post-auth navigation (auth-v2 · av2-02).
 * Used by the email OTP path after `verifyEmailOtp` succeeds.
 */

import {
  destinationAfterAuth,
  type AuthUserLike,
} from "@/lib/auth/post-auth";

type AuthRouter = {
  push: (href: string) => void;
  refresh: () => void;
};

/**
 * Push to `/complete-profile` or `/dashboard` by `profile_completed`, then refresh
 * so Server Components see the new session cookies.
 */
export function routeAfterAuth(router: AuthRouter, user: AuthUserLike): void {
  router.push(destinationAfterAuth(user));
  router.refresh();
}
