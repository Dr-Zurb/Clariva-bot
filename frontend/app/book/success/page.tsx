"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getBookingRedirectUrl } from "@/lib/api";

const REDIRECT_DELAY_MS = 1500;

function SuccessPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || token.trim() === "") {
      setError("Invalid or expired link. Please return to the chat.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);

    getBookingRedirectUrl(token)
      .then((res) => {
        if (cancelled) return;
        setRedirectUrl(res.data.redirectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load redirect. Please return to the chat manually.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!redirectUrl) return;
    const t = setTimeout(() => {
      window.location.href = redirectUrl;
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [redirectUrl]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md">
          <p className="text-center text-gray-600">Loading…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-medium text-amber-800">{error}</p>
          <a
            href={redirectUrl ?? "https://instagram.com"}
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Return to chat
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-medium text-green-800">
          Payment successful! Your appointment is confirmed.
        </p>
        <p className="mt-2 text-sm text-green-700">
          Redirecting you to the chat…
        </p>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-4">
          <div className="mx-auto max-w-md">
            <p className="text-center text-gray-600">Loading…</p>
          </div>
        </main>
      }
    >
      <SuccessPageContent />
    </Suspense>
  );
}
