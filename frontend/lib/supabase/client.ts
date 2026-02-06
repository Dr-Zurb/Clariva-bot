import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for Client Components.
 * Use for auth (signIn, signOut, getSession) and client-side data access.
 * @see FRONTEND_RECIPES F2
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local and restart the dev server (use npm run dev:e2e for E2E)."
    );
  }
  return createBrowserClient(url, key);
}
