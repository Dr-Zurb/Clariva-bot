import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthGate } from "@/lib/auth/middleware-gates";

/**
 * Next.js middleware: refreshes Supabase session and routes by auth +
 * `profile_completed` (routing-only; auth-v2 · av2-04).
 * Admin / desk role checks are server-side in `requireAdminAuth` /
 * `requireDeskAuth` (layouts), not here. Receptionists are bounced off
 * `/dashboard` by `resolveAuthGate`.
 * @see e-task-2 optional 4.2; Supabase Next.js SSR
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Patients tab cutover (2026-05-18): redirect legacy /dashboard/patients[/...] to v2.
  // Removed in pr-14 when v1 routes are deleted (harmless if left longer).
  if (pathname === "/dashboard/patients") {
    return NextResponse.redirect(
      new URL("/dashboard/patients-v2", request.url),
      301
    );
  }
  if (pathname.startsWith("/dashboard/patients/")) {
    const rest = pathname.slice("/dashboard/patients".length);
    return NextResponse.redirect(
      new URL(`/dashboard/patients-v2${rest}`, request.url),
      301
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session so Server Components see up-to-date auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const gate = resolveAuthGate({ pathname, user });
  if (gate !== "allow") {
    const redirectUrl = new URL(gate.redirect, request.url);
    // Preserve return path so Instagram OAuth (and other bounces) can resume
    // after re-auth. Only for login; avoid loops on complete-profile.
    if (gate.redirect === "/login") {
      const next = `${pathname}${request.nextUrl.search}`;
      redirectUrl.searchParams.set("next", next);
    }
    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Keep any session cookies refreshed on `response` (discarded if we
    // returned a bare redirect).
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/complete-profile",
    "/complete-profile/:path*",
    "/desk",
    "/desk/:path*",
  ],
};
