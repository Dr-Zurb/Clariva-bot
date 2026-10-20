/**
 * Title for a link the doctor just shared. Logged-out calls get nothing.
 * A miss returns a null title so the idea screen keeps its short label.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { lookupLinkTitle } from "@/lib/text/link-title-lookup";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user) return NextResponse.json({ title: null }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url") ?? "";
  const title = await lookupLinkTitle(url);
  return NextResponse.json({ title });
}
