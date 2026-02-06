/**
 * Settings page. Dashboard layout enforces auth.
 * Instagram section: connection status and Connect/Disconnect (e-task-5).
 */
import InstagramConnect from "@/components/settings/InstagramConnect";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-gray-600">
        Manage your account and integrations.
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
