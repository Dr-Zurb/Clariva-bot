import Link from "next/link";
import InstagramConnect from "@/components/settings/InstagramConnect";

/**
 * Integrations page: Instagram and other third-party connections.
 */
export default function IntegrationsPage() {
  return (
    <div>
      <Link
        href="/dashboard/settings"
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-blue-600"
      >
        ← Back to Settings
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
      <p className="mt-1 text-gray-600">
        Connect your accounts to receive patient messages and manage appointments.
      </p>
      <section className="mt-6" aria-labelledby="instagram-heading">
        <h2 id="instagram-heading" className="sr-only">
          Instagram connection
        </h2>
        <InstagramConnect />
      </section>
    </div>
  );
}
