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
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 2026</p>

      <div className="mt-8 space-y-8 text-foreground/80">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Who we are</h2>
          <p>
            Halo Aid is operated by <strong className="text-foreground">HALO AID
            PRIVATE LIMITED</strong> (CIN U62090PB2026PTC069487), Gali No. 10, Shiv
            Nagar, Batala, Gurdaspur - 143505, Punjab, India. You can reach us at{" "}
            <a
              href="mailto:founder@haloaid.com"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              founder@haloaid.com
            </a>
            .
          </p>
          <p>
            We provide software that healthcare practices use to answer patient
            enquiries, book appointments, run consultations, and record clinical
            notes. This policy explains how information is handled when you
            interact with the service through Instagram, Facebook, our booking
            pages, a consultation link, or a practice&apos;s front desk.
          </p>
          <p>
            <strong className="text-foreground">Your records belong to your
            practice.</strong> The doctor or clinic you booked with decides what is
            collected and how long it is kept. Halo Aid processes that information
            on their instructions, in order to provide the service. If you want your
            records changed or removed, your practice can action that directly, and
            you can also ask us using the routes in section 8.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            2. Information we collect
          </h2>
          <p>Information you give us when you book or message:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Name and contact details (phone, email)</li>
            <li>Age or date of birth, and a relative&apos;s name where a practice records one</li>
            <li>Reason for visit and appointment preferences</li>
            <li>Your Instagram or Facebook user ID, when you message a practice there</li>
            <li>Conversation history related to your enquiry or booking</li>
          </ul>
          <p>
            Health information created while your practice cares for you. This is
            sensitive personal data and we treat it accordingly:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Vital signs recorded at check-in</li>
            <li>Consultation notes written by your doctor</li>
            <li>Transcripts of voice or video consultations</li>
            <li>Recordings of video or voice consultations, where your practice uses them and you have consented</li>
            <li>Prescriptions and other clinical records your doctor issues</li>
          </ul>
          <p>
            We also keep payment metadata (gateway reference, amount, status) where
            a practice collects payment. We never receive or store your full card
            details — those go directly to the payment gateway.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            3. How we use your information
          </h2>
          <p>
            We use it to schedule and confirm appointments, send reminders, run the
            consultation, let your doctor record and retrieve your clinical notes,
            process payments where applicable, and provide support to your practice.
            We do not sell your data, and we do not use it for marketing without
            your consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            4. Who we share it with
          </h2>
          <p>
            Your information is shared with the healthcare practice you booked with,
            and with the service providers we use to run the product. Each is used
            only for the purpose listed:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong className="text-foreground">Hosting and database</strong> —
              Supabase, which stores your records
            </li>
            <li>
              <strong className="text-foreground">Video and voice consultations</strong>{" "}
              — Twilio, which carries the call and stores any recording
            </li>
            <li>
              <strong className="text-foreground">Transcription</strong> — Deepgram,
              which converts consultation audio to text
            </li>
            <li>
              <strong className="text-foreground">AI assistant</strong> — OpenAI and
              Anthropic, which generate assistant replies and draft summaries (see
              section 5)
            </li>
            <li>
              <strong className="text-foreground">Messaging</strong> — Meta, where
              you contact a practice through Instagram or Facebook
            </li>
            <li>
              <strong className="text-foreground">Payments</strong> — Razorpay and
              PayPal, which process the transaction
            </li>
            <li>
              <strong className="text-foreground">Email</strong> — Resend, which
              delivers confirmations and notifications
            </li>
          </ul>
          <p>
            We may also disclose information where the law requires it. Beyond that,
            we do not share your records with anyone else.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            5. AI and your data
          </h2>
          <p>
            The assistant that answers enquiries and drafts summaries is powered by
            third-party AI models. Before any request leaves our systems for those
            models, we strip out identifying details such as name and phone number.
          </p>
          <p>
            Your data is not used to train third-party AI models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            6. Where your data is stored
          </h2>
          <p>
            Your data is encrypted in transit and at rest. Some of the service
            providers listed in section 4 process or store data outside India in
            order to deliver their part of the service — video consultations are one
            example. If you want to know where a specific category of your data is
            held, ask us at{" "}
            <a
              href="mailto:founder@haloaid.com"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              founder@haloaid.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. Retention</h2>
          <p>
            We keep information for as long as your practice needs it to care for you
            and to meet their record-keeping and tax obligations, then delete or
            anonymise it. Clinical records are kept longer than booking and
            conversation data, because your doctor is required to retain them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            8. Your rights and data deletion
          </h2>
          <p>
            You can ask to access, correct, or delete your personal data, and you can
            withdraw consent you previously gave. To request deletion:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Use our{" "}
              <Link
                href="/data-deletion"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Data Deletion Request
              </Link>{" "}
              page, or
            </li>
            <li>
              Email{" "}
              <a
                href="mailto:founder@haloaid.com"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                founder@haloaid.com
              </a>
              , or
            </li>
            <li>Ask the healthcare practice you booked with</li>
          </ul>
          <p>
            Deletion requests are processed within 30 days, after a 7-day grace
            window in which you can cancel the request. Note that the clinical parts
            of your medical record are retained under your doctor&apos;s
            record-keeping obligations — see the{" "}
            <Link
              href="/data-deletion"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              deletion page
            </Link>{" "}
            for exactly what is removed and what is kept. You can also remove the app
            from your Facebook or Instagram settings to trigger a deletion request.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">9. Security</h2>
          <p>
            We use encryption, access controls, database-level separation between
            practices, and audit logging to protect your data. Our practices are
            designed to align with the Digital Personal Data Protection Act, 2023.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            10. Grievances and contact
          </h2>
          <p>
            If you have a privacy question or complaint, write to our Grievance
            Officer at{" "}
            <a
              href="mailto:founder@haloaid.com"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              founder@haloaid.com
            </a>
            . We will acknowledge your complaint and respond within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            11. Changes to this policy
          </h2>
          <p>
            We may update this policy as the product changes. The date at the top
            shows when it was last revised.
          </p>
        </section>
      </div>
    </LegalShell>
  );
}
