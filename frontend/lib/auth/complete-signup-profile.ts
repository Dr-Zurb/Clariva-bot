/**
 * Email-signup profile stamp (auth-password · AP-D14).
 * After OTP + password, write name + profile_completed and optional settings
 * so the email path can skip `/complete-profile`.
 */

import { patchDoctorSettings } from "@/lib/api";
import { formatDoctorDisplayName } from "@/lib/auth/doctor-name";
import type { AuthResult } from "@/lib/auth/methods";
import { createClient } from "@/lib/supabase/client";

export type CompleteSignupProfileInput = {
  fullName: string;
  practiceName?: string;
  specialty?: string;
};

export async function completeEmailSignupProfile(
  input: CompleteSignupProfileInput
): Promise<AuthResult> {
  const formatted = formatDoctorDisplayName(input.fullName);
  if (!formatted) {
    return { ok: false, message: "Please enter your full name." };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: formatted,
        profile_completed: true,
      },
    });
    if (error) {
      return { ok: false, message: "Could not save your profile. Please try again." };
    }

    const practice = (input.practiceName ?? "").trim();
    const specialty = (input.specialty ?? "").trim();
    if (practice || specialty) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        try {
          await patchDoctorSettings(token, {
            ...(practice ? { practice_name: practice } : {}),
            ...(specialty ? { specialty } : {}),
          });
        } catch {
          // Account + flag already saved; settings can be filled in practice setup.
        }
      }
    }

    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    const message =
      err instanceof Error && err.message.startsWith("Supabase is not configured")
        ? err.message
        : "Something went wrong. Please try again.";
    return { ok: false, message };
  }
}
