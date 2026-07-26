import { LegalShell } from "@/components/legal/LegalShell";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Halo Aid",
  description: "Privacy Policy for Halo Aid AI Receptionist",
};

export default function PrivacyPage() {
  return (
    <LegalShell activeHref="/privacy">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: March 2026</p>

      <div className="mt-8 space-y-8 text-foreground/80">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
          <p>
            Halo Aid (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides an AI receptionist
            service for healthcare practices. This Privacy Policy explains how we
            collect, use, and protect your information when you interact with our
            service via Instagram, our website, or other channels.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            2. Information We Collect
          </h2>
          <p>
            We collect information you provide when booking appointments,
            messaging us via Instagram, or using our dashboard:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Name and contact details (phone, email)</li>
            <li>Reason for visit and appointment preferences</li>
            <li>Instagram user ID (when you message us via Instagram)</li>
            <li>Conversation history related to your booking</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            3. How We Use Your Information
          </h2>
          <p>
            We use your information to schedule appointments, send confirmations,
            process payments, and provide the services you request. We do not sell
            your data or use it for marketing without your consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. Data Sharing</h2>
          <p>
            We share your information only with the healthcare practice you are
            booking with and payment processors (Razorpay, PayPal) as needed to
            complete your appointment and payment.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">5. Data Retention</h2>
          <p>
            We retain your data as long as needed to provide our services and
            comply with legal obligations. You may request deletion at any time
            (see Section 7).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Security</h2>
          <p>
            We use encryption, access controls, and secure infrastructure to
            protect your data. Our systems comply with applicable data protection
            standards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            7. Your Rights & Data Deletion
          </h2>
          <p>
            You have the right to access, correct, or delete your personal data.
            To request deletion of your data, please:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Email us at the contact address provided by your healthcare
              practice, or
            </li>
            <li>
              Visit our{" "}
              <Link
                href="/data-deletion"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Data Deletion Request
              </Link>{" "}
              page for instructions.
            </li>
          </ul>
          <p>
            We will process deletion requests within 30 days. You may also remove
            our app from your Facebook/Instagram settings to trigger a deletion
            request.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">8. Contact</h2>
          <p>
            For privacy-related questions, contact the healthcare practice you
            interact with, or reach us at the contact email listed in our app
            settings.
          </p>
        </section>
      </div>
    </LegalShell>
  );
}
