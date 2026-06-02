"use client";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MIN_PASSWORD_LENGTH = 6;

function getUserFriendlyMessage(error: { message?: string }): string {
  const msg = error?.message ?? "";
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "This email is already registered. Try signing in.";
  return "Something went wrong. Please try again.";
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailConfirmSent, setEmailConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? window.location.origin + "/dashboard"
              : undefined,
        },
      });
      if (err) {
        setError(getUserFriendlyMessage(err));
        return;
      }
      if (data?.user && !data.session) {
        setEmailConfirmSent(true);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (emailConfirmSent) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Check your email
          </h1>
          <p className="text-gray-600" role="status">
            We sent a confirmation link to your email. Click the link to
            activate your account, then sign in.
          </p>
          <Link
            href="/login"
            className="inline-block font-medium text-blue-600 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Sign up</h1>
        <p className="text-sm text-gray-600">
          Create an account to access the doctor dashboard.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="signup-email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={cn(
                "w-full rounded border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                loading && "cursor-not-allowed opacity-60"
              )}
              aria-describedby={error ? "signup-error" : undefined}
            />
          </div>
          <div>
            <label
              htmlFor="signup-password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              minLength={MIN_PASSWORD_LENGTH}
              className={cn(
                "w-full rounded border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                loading && "cursor-not-allowed opacity-60"
              )}
              aria-describedby={error ? "signup-error" : "signup-password-hint"}
            />
            <p id="signup-password-hint" className="mt-1 text-xs text-gray-500">
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          </div>
          <div>
            <label
              htmlFor="signup-confirm"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Confirm password
            </label>
            <input
              id="signup-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className={cn(
                "w-full rounded border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                loading && "cursor-not-allowed opacity-60"
              )}
              aria-describedby={error ? "signup-error" : undefined}
            />
          </div>
          {error && (
            <p
              id="signup-error"
              role="alert"
              className="text-sm text-red-600"
              aria-live="polite"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              loading && "cursor-not-allowed opacity-60"
            )}
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
