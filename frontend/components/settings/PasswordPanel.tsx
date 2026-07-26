"use client";

/**
 * Settings → Account password panel (auth-password · ap-03 / AP-D6 / AP-D19).
 *
 * - OAuth-only (e.g. Google): Set a password (live session is proof).
 * - Email identity: Change password after current-password re-auth (happy path).
 * - Forgot / never set: OTP step-up → set new password (AP-D19). No reset-link.
 */

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isOAuthOnlyUser,
  MIN_PASSWORD_LENGTH,
  resetPasswordWithEmailOtp,
  sendPasswordResetOtp,
  signInWithPassword,
  updatePassword,
} from "@/lib/auth/methods";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";

const RESEND_COOLDOWN_SEC = 30;

type Mode = "set" | "change" | "reset";

export function PasswordPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mode, setMode] = useState<Mode>("set");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const next = data.user ?? null;
        setUser(next);
        setMode(isOAuthOnlyUser(next) ? "set" : "change");
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function enterResetMode() {
    setMode("reset");
    setCurrentPassword("");
    setOtp("");
    setCodeSent(false);
    setResendIn(0);
    clearMessages();
  }

  function leaveResetMode() {
    setMode("change");
    setOtp("");
    setCodeSent(false);
    setResendIn(0);
    clearMessages();
  }

  async function handleSendResetCode() {
    clearMessages();
    const email = user?.email?.trim().toLowerCase() ?? "";
    if (!email) {
      setError("No email on this account — sign in again with Google.");
      return;
    }
    setLoading(true);
    try {
      const result = await sendPasswordResetOtp(email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCodeSent(true);
      setOtp("");
      setResendIn(RESEND_COOLDOWN_SEC);
      setSuccess("We sent a 6-digit code to your email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`
      );
      return;
    }

    const email = user?.email?.trim().toLowerCase() ?? "";

    if (mode === "change") {
      if (!currentPassword) {
        setError("Please enter your current password.");
        return;
      }
      if (!email) {
        setError("No email on this account — use a code to sign in again.");
        return;
      }
    }

    if (mode === "reset") {
      if (!codeSent) {
        setError("Send a code to your email first.");
        return;
      }
      if (otp.trim().length < 6) {
        setError("Please enter the 6-digit code from your email.");
        return;
      }
      if (!email) {
        setError("No email on this account — sign in again with Google.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "change") {
        const verified = await signInWithPassword(email, currentPassword);
        if (!verified.ok) {
          setError("Current password is incorrect.");
          return;
        }
        const result = await updatePassword(newPassword);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        setSuccess("Password updated.");
        return;
      }

      if (mode === "reset") {
        const result = await resetPasswordWithEmailOtp(email, otp, newPassword);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOtp("");
        setNewPassword("");
        setCodeSent(false);
        setMode("change");
        setSuccess("Password updated. You can use it the next time you sign in.");
        return;
      }

      // mode === "set" (OAuth-only)
      const result = await updatePassword(newPassword);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNewPassword("");
      setSuccess("Password set. You can use it the next time you sign in.");
      setMode("change");
    } finally {
      setLoading(false);
    }
  }

  if (loadingUser) {
    return (
      <p className="text-sm text-muted-foreground">Loading account…</p>
    );
  }

  const title =
    mode === "set"
      ? "Set a password"
      : mode === "reset"
        ? "Reset password with a code"
        : "Change password";

  const subtitle =
    mode === "set"
      ? "Add a password for faster sign-in next time. Google and email codes still work."
      : mode === "reset"
        ? "We’ll email a 6-digit code to prove it’s you, then you can set a new password."
        : "Enter your current password, then choose a new one.";

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "change" ? (
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                aria-describedby={error ? "password-error" : undefined}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={
                  showCurrent ? "Hide current password" : "Show current password"
                }
                disabled={loading}
              >
                {showCurrent ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "reset" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSendResetCode()}
                disabled={loading || resendIn > 0}
              >
                {codeSent
                  ? resendIn > 0
                    ? `Resend code in ${resendIn}s`
                    : "Resend code"
                  : "Send code to my email"}
              </Button>
              {user?.email ? (
                <p className="text-xs text-muted-foreground">
                  Code goes to{" "}
                  <span className="font-medium text-foreground">
                    {user.email}
                  </span>
                </p>
              ) : null}
            </div>
            {codeSent ? (
              <div className="space-y-2">
                <Label htmlFor="reset-otp">Verification code</Label>
                <Input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={loading}
                  aria-describedby={error ? "password-error" : undefined}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              aria-describedby={error ? "password-error" : undefined}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? "Hide new password" : "Show new password"}
              disabled={loading}
            >
              {showNew ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        {error ? (
          <p
            id="password-error"
            role="alert"
            className="text-sm text-destructive"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            role="status"
            className="text-sm text-green-700 dark:text-green-400"
            aria-live="polite"
          >
            {success}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={
            loading || (mode === "reset" && (!codeSent || otp.length < 6))
          }
        >
          {loading
            ? mode === "set"
              ? "Setting…"
              : "Updating…"
            : mode === "set"
              ? "Set password"
              : mode === "reset"
                ? "Verify & update password"
                : "Update password"}
        </Button>
      </form>

      {mode === "change" ? (
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={enterResetMode}
          disabled={loading}
        >
          Forgot your current password? Use a code
        </button>
      ) : null}

      {mode === "reset" ? (
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={leaveResetMode}
          disabled={loading}
        >
          Back to current password
        </button>
      ) : null}
    </div>
  );
}
