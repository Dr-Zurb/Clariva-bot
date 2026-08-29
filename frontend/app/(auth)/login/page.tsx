"use client";

import { AuthMethodPicker } from "@/components/auth/AuthMethodPicker";
import { AuthShell } from "@/components/auth/AuthShell";
import Link from "next/link";

/**
 * Sign-in (auth-v2). Passwordless method picker — Google + Email OTP.
 */
export default function LoginPage() {
  return (
    <AuthShell
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create account
          </Link>
        </>
      }
    >
      <AuthMethodPicker mode="signin" />
    </AuthShell>
  );
}
