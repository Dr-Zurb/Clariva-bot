"use client";

import { useState } from "react";

export function SharePrepLink({
  resolveUrl,
}: {
  resolveUrl: () => Promise<string>;
}) {
  const [note, setNote] = useState<string | null>(null);

  async function onShare() {
    setNote(null);
    try {
      const url = await resolveUrl();
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url });
          return;
        } catch (err) {
          if ((err as { name?: string }).name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      setNote("Link copied");
    } catch {
      setNote("Could not share that link.");
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="w-full rounded-lg border border-gray-900 bg-white px-4 py-3 text-sm font-medium text-gray-900"
        onClick={() => {
          void onShare();
        }}
      >
        Share this page
      </button>
      {note ? <p className="text-sm text-gray-700">{note}</p> : null}
    </div>
  );
}
