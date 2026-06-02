/**
 * E2E only: returns whether Supabase env is present (no secrets).
 * Used by Playwright to diagnose login failures.
 */
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return NextResponse.json({ supabase });
}
