/**
 * Settings page. Dashboard layout enforces auth.
 * Doctor settings form and Instagram section (e-task-5).
 */
import DoctorSettingsForm from "@/components/settings/DoctorSettingsForm";
import InstagramConnect from "@/components/settings/InstagramConnect";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-gray-600">
        Manage your account, practice settings, and integrations.
      </p>
      <section className="mt-6" aria-labelledby="doctor-settings-heading">
        <h2 id="doctor-settings-heading" className="sr-only">
          Doctor settings
        </h2>
        <DoctorSettingsForm />
      </section>
      <section className="mt-6" aria-labelledby="instagram-heading">
        <h2 id="instagram-heading" className="sr-only">
          Instagram connection
        </h2>
        <InstagramConnect />
      </section>
    </div>
  );
}
