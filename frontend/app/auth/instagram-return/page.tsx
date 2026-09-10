"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OAuthReturnBridge } from "@/components/auth/OAuthReturnBridge";

/**
 * Public bridge after Meta Instagram OAuth.
 *
 * Meta returns cross-site → backend callback → here (not under /dashboard).
 * A delayed same-site navigation then carries Supabase Lax cookies into the
 * dashboard middleware; a direct 302 into /dashboard often lands on /login.
 */
function InstagramReturnRedirect() {
  const searchParams = useSearchParams();
  return <OAuthReturnBridge search={searchParams.toString()} />;
}

export default function InstagramReturnPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-center text-sm text-muted-foreground">
          Returning to Integrations…
        </p>
      }
    >
      <InstagramReturnRedirect />
    </Suspense>
  );
}
