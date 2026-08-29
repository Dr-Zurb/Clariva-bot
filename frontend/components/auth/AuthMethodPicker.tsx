"use client";

import { DoctorNameField } from "@/components/auth/DoctorNameField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeEmailSignupProfile } from "@/lib/auth/complete-signup-profile";
import { checkEmailStatus } from "@/lib/auth/email-status";
import {
  MIN_PASSWORD_LENGTH,
  sendEmailOtp,
  signInWithGoogle,
  signInWithPassword,
  verifyEmailOtp,
  verifyOtpThenSetPassword,
} from "@/lib/auth/methods";
import { routeAfterAuth } from "@/lib/auth/route-after-auth";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const RESEND_COOLDOWN_SEC = 30;

type Step = "methods" | "otp";

export type AuthMethodPickerProps = {
  mode: "signin" | "signup";
};

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Auth method picker (auth-v2 · av2-03 + auth-password · ap-02 / ap-05 / AP-D11–D14).
 * Email form first; Google below (AP-D11).
 * Signup: Dr. name + practice/specialty, OTP-verify, stamp profile, skip complete-profile.
 * Sign-in: password + "use a code" with shouldCreateUser:false (AP-D10).
 */
export function AuthMethodPicker({ mode }: AuthMethodPickerProps) {
  const router = useRouter();
  const otpRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("methods");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "oauth") {
      setError("Google sign-in failed. Please try again.");
    }
    const next = params.get("next");
    if (next) setNextPath(next);
  }, []);

  useEffect(() => {
    if (step !== "otp") return;
    otpRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  const title =
    mode === "signup" ? "Create your Halo Aid account" : "Sign in";
  const subtitle =
    mode === "signup"
      ? "Create an account with email, or continue with Google."
      : "Sign in with email and password, or continue with Google.";

  const createIfMissing = mode === "signup";

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
      }
      // On success the browser navigates away to Google.
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && !fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }
    if (!password) {
      setError(
        mode === "signup"
          ? "Please enter a password."
          : "Please enter your password."
      );
      return;
    }
    if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`
      );
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        // AP-D17: refuse confirmed accounts only. Unconfirmed stubs (OTP email
        // failed after Supabase created the row) may re-request a code.
        const status = await checkEmailStatus(trimmed);
        if (!status.ok) {
          setError(status.message);
          return;
        }
        if (status.exists && status.confirmed) {
          setError("An account already exists — sign in instead.");
          return;
        }

        // AP-D9: send OTP; name/password/practice stay in state across the step.
        const result = await sendEmailOtp(trimmed, { createIfMissing: true });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOtp("");
        setStep("otp");
        setResendIn(RESEND_COOLDOWN_SEC);
        return;
      }

      // AP-D18: unknown email → clear "no account" (not generic wrong-password).
      const status = await checkEmailStatus(trimmed);
      if (!status.ok) {
        setError(status.message);
        return;
      }
      if (!status.exists) {
        setError("No account found — create one.");
        return;
      }
      if (!status.confirmed) {
        setError(
          "Finish creating your account — use Create account to get a new code."
        );
        return;
      }

      const result = await signInWithPassword(trimmed, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      routeAfterAuth(router, result.user ?? { user_metadata: {} }, nextPath);
    } finally {
      setLoading(false);
    }
  }

  async function handleUseCodeInstead() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email first, then request a code.");
      return;
    }
    setLoading(true);
    try {
      const result = await sendEmailOtp(trimmed, { createIfMissing: false });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOtp("");
      setStep("otp");
      setResendIn(RESEND_COOLDOWN_SEC);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const verified = await verifyOtpThenSetPassword(email, otp, password);
        if (!verified.ok) {
          setError(verified.message);
          return;
        }
        // AP-D14: stamp profile so email path skips /complete-profile.
        const stamped = await completeEmailSignupProfile({
          fullName,
          practiceName,
          specialty,
        });
        if (!stamped.ok) {
          setError(stamped.message);
          return;
        }
        router.push("/dashboard/getting-started");
        router.refresh();
        return;
      }

      const result = await verifyEmailOtp(email, otp);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      routeAfterAuth(router, result.user ?? { user_metadata: {} }, nextPath);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await sendEmailOtp(email, { createIfMissing });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResendIn(RESEND_COOLDOWN_SEC);
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    const otpSubtitle =
      mode === "signup" ? (
        <>
          Enter the 6-digit code we sent to confirm your email at{" "}
          <span className="font-medium text-foreground">{email.trim()}</span>.
        </>
      ) : (
        <>
          Enter the 6-digit code we sent to{" "}
          <span className="font-medium text-foreground">{email.trim()}</span>.
        </>
      );

    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">{otpSubtitle}</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-otp">Verification code</Label>
            <Input
              ref={otpRef}
              id="auth-otp"
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
              aria-describedby={error ? "auth-error" : undefined}
            />
          </div>
          {error && (
            <p
              id="auth-error"
              role="alert"
              className="text-sm text-destructive"
              aria-live="polite"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || otp.length < 6}
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </Button>
        </form>

        <div className="flex flex-col gap-2 text-center text-sm">
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => void handleResend()}
            disabled={loading || resendIn > 0}
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setStep("methods");
              setOtp("");
              setError(null);
            }}
            disabled={loading}
          >
            {mode === "signup" ? "Back to create account" : "Back to sign-in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        {mode === "signup" ? (
          <DoctorNameField
            id="auth-full-name"
            value={fullName}
            onChange={setFullName}
            disabled={loading}
            aria-describedby={error ? "auth-error" : undefined}
          />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-describedby={error ? "auth-error" : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth-password">Password</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              aria-describedby={error ? "auth-error" : undefined}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={loading}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
          {mode === "signup" ? (
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          ) : null}
        </div>

        {mode === "signup" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="auth-practice">
                Practice name{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="auth-practice"
                type="text"
                autoComplete="organization"
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-specialty">
                Specialty{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="auth-specialty"
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                disabled={loading}
                placeholder="e.g. Dermatology"
              />
            </div>
          </>
        ) : null}

        {error && (
          <p
            id="auth-error"
            role="alert"
            className="text-sm text-destructive"
            aria-live="polite"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? mode === "signup"
              ? "Sending code…"
              : "Signing in…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      {mode === "signin" ? (
        <button
          type="button"
          className="w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          onClick={() => void handleUseCodeInstead()}
          disabled={loading}
        >
          Forgot password? Use a code instead
        </button>
      ) : null}

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full justify-start gap-3 px-4 text-sm font-medium"
        onClick={() => void handleGoogle()}
        disabled={loading}
      >
        <GoogleGlyph />
        Continue with Google
      </Button>
    </div>
  );
}
