"use client";

import { useEffect, useState } from "react";

type Lookup = "loading" | "received" | "unknown" | "error";

/**
 * Status card for a Meta confirmation code (`?code=` on this page).
 * Fetches `/data-deletion-callback/status` so the URL we return to Meta
 * actually tracks the request.
 */
export function MetaCallbackStatus({ code }: { code: string }) {
  const [lookup, setLookup] = useState<Lookup>("loading");

  useEffect(() => {
    let cancelled = false;
    const url = `/data-deletion-callback/status?code=${encodeURIComponent(code)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("status lookup failed");
        const body = (await res.json()) as { status?: string };
        if (cancelled) return;
        setLookup(body.status === "received" ? "received" : "unknown");
      })
      .catch(() => {
        if (!cancelled) setLookup("error");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <section
      data-testid="meta-deletion-status"
      className="mb-8 rounded-lg border border-border bg-muted/40 p-6"
    >
      <h2 className="text-base font-semibold text-foreground">
        Meta deletion request
      </h2>
      <p className="mt-2 text-sm text-foreground/80">
        Confirmation code:{" "}
        <code className="rounded bg-background px-1.5 py-0.5 text-foreground">
          {code}
        </code>
      </p>
      <p className="mt-3 text-sm text-foreground/80">
        {lookup === "loading"
          ? "Checking status…"
          : lookup === "received"
            ? "Request received. Any Instagram connection tied to that Facebook account will be disconnected once the product backend is live. Email founder@haloaid.com if you need this handled sooner."
            : lookup === "unknown"
              ? "We do not recognise this confirmation code. If you just submitted a request, wait a moment and refresh. Otherwise write to founder@haloaid.com."
              : "We could not load the status just now. Your confirmation code is still valid — write to founder@haloaid.com if you need a follow-up."}
      </p>
    </section>
  );
}
