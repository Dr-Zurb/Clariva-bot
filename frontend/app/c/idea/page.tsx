"use client";

/**
 * Share-sheet idea page. No dashboard shell, so the phone can paint the form
 * without waiting on the rest of the app. The home-screen shortcut still uses
 * /dashboard/social/idea.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IdeaCapture } from "@/components/dashboard/social/IdeaCapture";
import { createClient } from "@/lib/supabase/client";

function QuickIdea() {
  const params = useSearchParams();
  const [token, setToken] = useState("");

  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        const access = data.session?.access_token ?? "";
        if (!access) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        setToken(access);
      });
  }, []);

  return (
    <div className="px-4 py-4">
      <IdeaCapture
        token={token}
        title={params.get("title") ?? ""}
        note={params.get("note") ?? ""}
        link={params.get("link") ?? ""}
        fileKeys={params.get("keys") ?? ""}
      />
    </div>
  );
}

export default function QuickIdeaPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground">New idea</h1>
        </div>
      }
    >
      <QuickIdea />
    </Suspense>
  );
}
