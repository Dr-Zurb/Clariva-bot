"use client";

import { useParams } from "next/navigation";
import { PublicClinicBookPage } from "@/app/book/page";

export default function PublicClinicPage() {
  const params = useParams();
  const raw = params?.slug;
  const slug = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? "" : "";

  if (!slug) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">This booking page was not found.</p>
        </div>
      </main>
    );
  }

  return <PublicClinicBookPage slug={slug} />;
}
