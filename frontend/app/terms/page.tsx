export const metadata = {
  title: "Terms of Service | Clariva Care",
  description: "Terms of Service for Clariva Care AI Receptionist",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Terms of Service
      </h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            1. Acceptance
          </h2>
          <p>
            By using Clariva Care&apos;s AI receptionist service (via Instagram, our
            website, or other channels), you agree to these Terms of Service and
            our Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            2. Service Description
          </h2>
          <p>
            Clariva Care provides an AI-powered receptionist service to help
            healthcare practices manage appointment bookings, answer common
            questions, and facilitate patient communication. The service is
            provided on behalf of the healthcare practice you interact with.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            3. Use of Service
          </h2>
          <p>You agree to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Provide accurate information when booking appointments</li>
            <li>Use the service only for lawful purposes</li>
            <li>Not misuse, abuse, or attempt to harm the service</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            4. Medical Disclaimer
          </h2>
          <p>
            Clariva Care is not a medical service. It does not provide medical
            advice, diagnosis, or treatment. For medical emergencies, contact
            emergency services. For medical questions, consult your healthcare
            provider directly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            5. Limitation of Liability
          </h2>
          <p>
            To the extent permitted by law, Clariva Care and its affiliates are
            not liable for any indirect, incidental, or consequential damages
            arising from your use of the service. Our liability is limited to the
            amount you paid for the service, if any.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            6. Changes
          </h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            service after changes constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            7. Contact
          </h2>
          <p>
            For questions about these Terms, contact the healthcare practice you
            interact with or the contact email in our app settings.
          </p>
        </section>
      </div>
    </main>
  );
}
