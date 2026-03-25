"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PatientVisitSession from "@/components/opd/PatientVisitSession";

/**
 * Patient "my visit" hub — pass consultation token (same as /consult/join).
 * e-task-opd-05: /my-visit?token=...
 */
function MyVisitContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  return <PatientVisitSession consultationToken={token} />;
}

export default function MyVisitPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-4">
          <div className="mx-auto max-w-lg">
            <p className="text-center text-gray-600">Loading…</p>
          </div>
        </main>
      }
    >
      <MyVisitContent />
    </Suspense>
  );
}
