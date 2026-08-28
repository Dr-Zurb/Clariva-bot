import { LegalShell } from "@/components/legal/LegalShell";
import Link from "next/link";

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
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 2026</p>

      <div className="mt-8 space-y-8 text-foreground/80">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            1. Who we are, and who these terms are for
          </h2>
          <p>
            Halo Aid is operated by <strong className="text-foreground">HALO AID
            PRIVATE LIMITED</strong> (CIN U62090PB2026PTC069487), Gali No. 10, Shiv
            Nagar, Batala, Gurdaspur - 143505, Punjab, India.
          </p>
          <p>
            These terms cover two different people. Sections 2 to 5 apply to{" "}
            <strong className="text-foreground">patients</strong> who book, message,
            or attend a consultation. Sections 6 and 7 apply to{" "}
            <strong className="text-foreground">healthcare practices</strong> —
            doctors, clinics, and their staff — who use Halo Aid to run their
            practice. Sections 8 onward apply to everyone.
          </p>
          <p>
            By using the service you agree to these terms and to our{" "}
            <Link
              href="/privacy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            2. Halo Aid is software, not a doctor
          </h2>
          <p>
            Halo Aid provides software. It does not practise medicine. The
            Registered Medical Practitioner you consult is solely responsible for
            every clinical decision, diagnosis, and prescription. Nothing produced by
            the automated assistant is medical advice — it schedules, reminds,
            answers practice questions, and hands off to your doctor.
          </p>
          <p>
            <strong className="text-foreground">In an emergency, do not use this
            service.</strong> Call <strong className="text-foreground">112</strong>{" "}
            or <strong className="text-foreground">108</strong>, or go to the nearest
            hospital. The assistant does not triage and does not assess how serious
            your condition is.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            3. Your appointment is with the practice
          </h2>
          <p>
            When you book through Halo Aid, your appointment and your course of care
            are with the healthcare practice, not with us. The practice sets its own
            availability, fees, and clinical policies. We pass messages, hold the
            booking, and store the records on the practice&apos;s behalf.
          </p>
          <p>You agree to:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Give accurate information when booking, including who the appointment is for</li>
            <li>Use the service only for lawful purposes</li>
            <li>Not misuse, abuse, or attempt to disrupt the service</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. Payments</h2>
          <p>
            You pay the practice, not Halo Aid. We are never the merchant of record
            for a consultation fee and we never take a cut of what you pay your
            doctor. Where a practice has connected a payment gateway, we may create
            the payment link and, on that practice&apos;s instruction, initiate a
            refund on their account. We do not hold, advance, or guarantee your
            money.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            5. Cancellations and refunds
          </h2>
          <p>
            You are entitled to a full refund, initiated automatically where the
            practice has connected a payment gateway, when:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>The doctor cancels your appointment</li>
            <li>An emergency is flagged in your conversation or intake form</li>
            <li>There is a technical failure — a double payment, or a slot that is no longer available</li>
          </ul>
          <p>
            If you cancel, or do not attend, the practice&apos;s own cancellation
            policy applies. That policy is shown on the booking page before you pay.
            Where a practice has not set one, the default is a full refund if you
            cancel at least 24 hours before your slot.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            6. For healthcare practices
          </h2>
          <p>By using Halo Aid to run your practice, you confirm that:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              You are a Registered Medical Practitioner, or you are authorised to act
              for one, and your registration is current
            </li>
            <li>
              You are responsible for every clinical decision, diagnosis, and
              prescription made through the service
            </li>
            <li>
              You obtain your patients&apos; consent to the consultation and to the
              use of this software. We provide the consent flow in-product; using it
              is your responsibility
            </li>
            <li>
              Patient records belong to you. We process them only to provide the
              service and on your instructions
            </li>
            <li>
              You keep your staff accounts secure and remove access when someone
              leaves
            </li>
            <li>
              You will comply with the telemedicine and prescribing rules that apply
              to you
            </li>
          </ul>
          <p>
            Fees, billing, and any pilot or founding-customer terms are set out in the
            agreement or order form you signed with us. Where that agreement conflicts
            with these terms, that agreement wins.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            7. Ending your subscription
          </h2>
          <p>
            Either side may end the arrangement with 30 days&apos; written notice, for
            any reason, without penalty. On termination you receive a complete export
            of your practice&apos;s data within 14 days. We may suspend access sooner
            if the service is being used unlawfully or in a way that puts patients or
            other customers at risk.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            8. Availability
          </h2>
          <p>
            We work to keep the service running and to fix problems promptly, but we
            do not promise it will be uninterrupted or error-free. Parts of the
            service depend on providers outside our control, including messaging,
            video, and payment platforms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            9. Limitation of liability
          </h2>
          <p>
            For a healthcare practice, our total liability is capped at the fees you
            paid us in the three months before the claim. For a patient, who pays the
            practice rather than us, our liability is limited to any amount you paid
            Halo Aid directly, if any.
          </p>
          <p>
            Neither side is liable for indirect or consequential loss. Nothing here
            limits liability that cannot be limited under Indian law, and nothing here
            transfers a doctor&apos;s clinical responsibility to us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            10. Changes to these terms
          </h2>
          <p>
            We may update these terms as the product changes. For practices, we will
            give notice of a material change before it takes effect. Continued use
            after a change means you accept the updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            11. Governing law
          </h2>
          <p>These terms are governed by the laws of India.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">12. Contact</h2>
          <p>
            Questions about these terms go to{" "}
            <a
              href="mailto:founder@haloaid.com"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              founder@haloaid.com
            </a>
            . For anything about your care or your appointment, contact your
            healthcare practice directly.
          </p>
        </section>
      </div>
    </LegalShell>
  );
}
