import { NextResponse } from "next/server";
import { requireApiBaseUrl } from "@/lib/api-base";

export const dynamic = "force-dynamic";

/** Wake the API as soon as a share sheet opens, before Add is tapped. */
export async function GET() {
  try {
    await fetch(`${requireApiBaseUrl()}/health`, { cache: "no-store" });
  } catch {
    // Add still runs if the ping cannot connect.
  }
  return new NextResponse(null, { status: 204 });
}
