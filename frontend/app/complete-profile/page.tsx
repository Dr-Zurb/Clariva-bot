"use client";

import { AuthShell } from "@/components/auth/AuthShell";
import { DoctorNameField } from "@/components/auth/DoctorNameField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { patchDoctorSettings } from "@/lib/api";
import {
  formatDoctorDisplayName,
  stripDoctorPrefix,
} from "@/lib/auth/doctor-name";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Post-auth profile step (auth-v2 · av2-04).
 *
 * Outside `(auth)` on purpose — that layout redirects authed users to
 * `/dashboard`. Stamps `user_metadata.profile_completed` (routing-only).
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [fullName, setFullName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        if (user.user_metadata?.profile_completed === true) {
          router.replace("/dashboard");
          return;
        }
        const metaName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "";
        setFullName(stripDoctorPrefix(metaName));
        setReady(true);
      } catch {
        if (active) router.replace("/login");
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const name = formatDoctorDisplayName(fullName);
    if (!name) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Your session expired. Please sign in again.");
        router.replace("/login");
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        data: {
          full_name: name,
          profile_completed: true,
        },
      });
      if (updateErr) {
        setError("Could not save your profile. Please try again.");
        return;
      }

      const practice = practiceName.trim();
      const specialtyTrimmed = specialty.trim();
      if (practice || specialtyTrimmed) {
        try {
          await patchDoctorSettings(token, {
            ...(practice ? { practice_name: practice } : {}),
            ...(specialtyTrimmed ? { specialty: specialtyTrimmed } : {}),
          });
        } catch {
          // Account + flag already saved; settings can be filled in practice setup.
        }
      }

      router.push("/dashboard/getting-started");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <AuthShell>
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Loading…
          </h1>
          <p className="text-sm text-muted-foreground" role="status">
            Preparing your profile.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Complete your profile
          </h1>
          <p className="text-sm text-muted-foreground">
            A few basics so we can set up your practice. License verification
            comes next.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DoctorNameField
            id="profile-full-name"
            value={fullName}
            onChange={setFullName}
            disabled={loading}
            aria-describedby={error ? "profile-error" : undefined}
          />
          <div className="space-y-2">
            <Label htmlFor="profile-practice">
              Practice name{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="profile-practice"
              type="text"
              autoComplete="organization"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-specialty">
              Specialty{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="profile-specialty"
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              disabled={loading}
              placeholder="e.g. Dermatology"
            />
          </div>
          {error && (
            <p
              id="profile-error"
              role="alert"
              className="text-sm text-destructive"
              aria-live="polite"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
