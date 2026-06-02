export const metadata = {
  title: "Privacy Policy | Clariva Care",
  description: "Privacy Policy for Clariva Care AI Receptionist",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Privacy Policy
      </h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            1. Introduction
          </h2>
          <p>
            Clariva Care (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides an AI receptionist
            service for healthcare practices. This Privacy Policy explains how we
            collect, use, and protect your information when you interact with our
            service via Instagram, our website, or other channels.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            2. Information We Collect
          </h2>
          <p>
            We collect information you provide when booking appointments,
            messaging us via Instagram, or using our dashboard:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Name and contact details (phone, email)</li>
            <li>Reason for visit and appointment preferences</li>
            <li>Instagram user ID (when you message us via Instagram)</li>
            <li>Conversation history related to your booking</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            3. How We Use Your Information
          </h2>
          <p>
            We use your information to schedule appointments, send confirmations,
            process payments, and provide the services you request. We do not sell
            your data or use it for marketing without your consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            4. Data Sharing
          </h2>
          <p>
            We share your information only with the healthcare practice you are
            booking with and payment processors (Razorpay, PayPal) as needed to
            complete your appointment and payment.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            5. Data Retention
          </h2>
          <p>
            We retain your data as long as needed to provide our services and
            comply with legal obligations. You may request deletion at any time
            (see Section 7).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            6. Security
          </h2>
          <p>
            We use encryption, access controls, and secure infrastructure to
            protect your data. Our systems comply with applicable data protection
            standards.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            7. Your Rights & Data Deletion
          </h2>
          <p>
            You have the right to access, correct, or delete your personal data.
            To request deletion of your data, please:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>
              Email us at the contact address provided by your healthcare
              practice, or
            </li>
            <li>
              Visit our{" "}
              <a
                href="/data-deletion"
                className="text-blue-600 hover:underline"
              >
                Data Deletion Request
              </a>{" "}
              page for instructions.
            </li>
          </ul>
          <p className="mt-2">
            We will process deletion requests within 30 days. You may also remove
            our app from your Facebook/Instagram settings to trigger a deletion
            request.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            8. Contact
          </h2>
          <p>
            For privacy-related questions, contact the healthcare practice you
            interact with, or reach us at the contact email listed in our app
            settings.
          </p>
        </section>
      </div>
    </main>
  );
}
