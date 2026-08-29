import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationAfterAuth } from "@/lib/auth/post-auth";

/**
 * OAuth PKCE callback (auth-v2 · av2-02).
 *
 * Google returns here with `?code=…`. Exchange on the **server** (code flow —
 * never parse hash tokens). Route by `user_metadata.profile_completed`
 * (routing-only; AV2-D3).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = destinationAfterAuth(user, next);
  return NextResponse.redirect(new URL(path, origin));
}
