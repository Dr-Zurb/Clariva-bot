import { LegalShell } from "@/components/legal/LegalShell";
import { DataDeletionClient } from "./DataDeletionClient";

export const metadata = {
  title: "Data Deletion Request | Halo Aid",
  description: "How to request deletion of your data from Halo Aid",
};

/**
 * Data Deletion landing page.
 *
 * Plan 02 · Task 33 extended the old Meta-compliance landing page
 * (static copy only) with a real request form driven by
 * `<DataDeletionClient>`. Legal copy stays intact for Meta app-review.
 * Visual chrome updated by halo-aid-legal (`LegalShell`).
 */
export default function DataDeletionPage() {
  return (
    <LegalShell activeHref="/data-deletion">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Data Deletion Request
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        How to request deletion of your personal data
      </p>

      <div className="mt-8">
        <DataDeletionClient />
      </div>

      <div className="mt-10 space-y-8 text-foreground/80">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Your Right to Deletion
          </h2>
          <p>
            You have the right to request deletion of your personal data that we
            hold. We will process your request within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            How We Handle Deletion
          </h2>
          <p>
            When you confirm a deletion request, your account enters a 7-day
            grace window so an accidental tap does not take effect immediately.
            You can cancel during that window by returning to this page and
            clicking &quot;Cancel deletion&quot;. After the grace window, your
            access to your consultation recordings and chat history is revoked,
            your personal identifiers (name, phone, email) are removed from our
            systems, and we send you one final confirmation message.
          </p>
          <p>
            The clinical portions of your medical record (appointments,
            prescriptions, consultation transcripts) are retained under the
            medical-record retention obligations of the Digital Personal Data
            Protection Act 2023 and GDPR Article 9. Your doctor continues to
            have access to those records for clinical follow-up; the records
            themselves are not deleted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Other Ways to Request Deletion
          </h2>
          <p>If you prefer not to use the form above, you can also:</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              <strong className="text-foreground">Via Facebook/Instagram:</strong>{" "}
              If you connected our app through Facebook or Instagram, go to
              Settings &amp; Privacy → Settings → Apps and Websites, find Halo
              Aid, and click &quot;Remove&quot; or &quot;Send Request&quot; to
              trigger a data deletion request. We will receive the request and
              process it.
            </li>
            <li>
              <strong className="text-foreground">Via email:</strong> Contact the
              healthcare practice you booked with and ask them to forward your
              deletion request to us. Include your name, phone number, and/or
              the Instagram handle you used so we can identify your records.
            </li>
            <li>
              <strong className="text-foreground">Via our contact:</strong> Email
              the contact address listed in our Meta app settings (Basic Settings
              → Contact email) with the subject &quot;Data Deletion Request&quot;
              and include the identifiers you used (name, phone, Instagram
              handle).
            </li>
          </ol>
        </section>
      </div>
    </LegalShell>
  );
}
