"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OAuthReturnBridge } from "@/components/auth/OAuthReturnBridge";

/**
 * Public bridge after Facebook Page OAuth (fbm-03).
 * Maps fb_connected → Integrations query params (same card can read either).
 */
function FacebookReturnRedirect() {
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  const fb = searchParams.get("fb_connected");
  const err = searchParams.get("error");
  if (fb != null) params.set("fb_connected", fb);
  if (err) params.set("error", err);
  return <OAuthReturnBridge search={params.toString()} />;
}

export default function FacebookReturnPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-center text-sm text-muted-foreground">
          Returning to Integrations…
        </p>
      }
    >
      <FacebookReturnRedirect />
    </Suspense>
  );
}
