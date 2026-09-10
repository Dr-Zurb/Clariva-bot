import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Auth route group layout: redirect to dashboard if user already has a session.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // auth-v2: incomplete doctor profiles must not bounce through /dashboard first.
  // Receptionists skip profile_completed and never land on the clinical app (P1-Q2).
  if (user) {
    if (user.app_metadata?.role === "receptionist") {
      redirect("/desk");
    }
    if (user.user_metadata?.profile_completed !== true) {
      redirect("/complete-profile");
    }
    redirect("/dashboard");
  }
  return <>{children}</>;
}
