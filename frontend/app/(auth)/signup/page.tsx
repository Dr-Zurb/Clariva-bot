"use client";

import { AuthMethodPicker } from "@/components/auth/AuthMethodPicker";
import { AuthShell } from "@/components/auth/AuthShell";
import { DEMO_HREF } from "@/components/marketing/constants";
import Link from "next/link";

/**
 * Sign-up (auth-v2). Same passwordless picker as login; profile fields move to
 * `/complete-profile` after auth.
 */
export default function SignupPage() {
  return (
    <AuthShell
      footer={
        <div className="space-y-2">
          <p>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
          <p>
            Prefer a guided walkthrough?{" "}
            <Link
              href={DEMO_HREF}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Book a demo
            </Link>
          </p>
        </div>
      }
    >
      <AuthMethodPicker mode="signup" />
    </AuthShell>
  );
}
