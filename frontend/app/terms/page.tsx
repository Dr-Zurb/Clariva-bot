import { LegalShell } from "@/components/legal/LegalShell";

export const metadata = {
  title: "Terms of Service | Halo Aid",
  description: "Terms of Service for Halo Aid AI Receptionist",
};

export default function TermsPage() {
  return (
    <LegalShell activeHref="/terms">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 2026</p>

      <div className="mt-8 space-y-8 text-foreground/80">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance</h2>
          <p>
            By using Halo Aid&apos;s AI receptionist service (via Instagram, our
            website, or other channels), you agree to these Terms of Service and
            our Privacy Policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            2. Service Description
          </h2>
          <p>
            Halo Aid provides an AI-powered receptionist service to help
            healthcare practices manage appointment bookings, answer common
            questions, and facilitate patient communication. The service is
            provided on behalf of the healthcare practice you interact with.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">3. Use of Service</h2>
          <p>You agree to:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Provide accurate information when booking appointments</li>
            <li>Use the service only for lawful purposes</li>
            <li>Not misuse, abuse, or attempt to harm the service</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            4. Medical Disclaimer
          </h2>
          <p>
            Halo Aid is not a medical service. It does not provide medical
            advice, diagnosis, or treatment. For medical emergencies, contact
            emergency services. For medical questions, consult your healthcare
            provider directly.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            5. Limitation of Liability
          </h2>
          <p>
            To the extent permitted by law, Halo Aid and its affiliates are
            not liable for any indirect, incidental, or consequential damages
            arising from your use of the service. Our liability is limited to the
            amount you paid for the service, if any.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Changes</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            service after changes constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
          <p>
            For questions about these Terms, contact the healthcare practice you
            interact with or the contact email in our app settings.
          </p>
        </section>
      </div>
    </LegalShell>
  );
}
