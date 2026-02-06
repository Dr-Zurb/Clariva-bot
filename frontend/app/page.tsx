import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          Clariva Doctor Dashboard
        </h1>
        <Link
          href="/login"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Sign in
        </Link>
      </div>
      <p className="mt-2 text-gray-600">
        Digital infrastructure for doctors operating on social media.
      </p>
      <p className="mt-4 text-sm text-gray-500">
        Backend runs separately at{" "}
        <code className="rounded bg-gray-100 px-1">backend/</code>. Dashboard UI
        will be added in the next tasks.
      </p>
    </main>
  );
}
