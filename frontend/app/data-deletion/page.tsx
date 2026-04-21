import { DataDeletionClient } from "./DataDeletionClient";

export const metadata = {
  title: "Data Deletion Request | Clariva Care",
  description: "How to request deletion of your data from Clariva Care",
};

/**
 * Data Deletion landing page.
 *
 * Plan 02 · Task 33 extended the old Meta-compliance landing page
 * (static copy only) with a real request form driven by
 * `<DataDeletionClient>`. The legal / "here is how we handle
 * deletion" copy stays intact on this page so the URL continues to
 * satisfy the Meta app-review requirement — the interactive pieces
 * are layered underneath.
 *
 * Design choices:
 *   - The request form accepts a booking-token path (pasted from
 *     the patient's last DM, or auto-populated if the URL carries
 *     `?bookingToken=...`). This avoids shipping a patient auth
 *     system for v1 while still giving us a verifiable HMAC trail.
 *   - We render a soft warning banner explaining the 7-day grace
 *     window and the legal retention carve-out, consistent with
 *     the explainer DM sent post-finalize.
 */
export default function DataDeletionPage() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Data Deletion Request
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        How to request deletion of your personal data
      </p>

      <DataDeletionClient />

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700 mt-10">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            Your Right to Deletion
          </h2>
          <p>
            You have the right to request deletion of your personal data that we
            hold. We will process your request within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
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
          <p className="mt-3">
            The clinical portions of your medical record (appointments,
            prescriptions, consultation transcripts) are retained under the
            medical-record retention obligations of the Digital Personal Data
            Protection Act 2023 and GDPR Article 9. Your doctor continues to
            have access to those records for clinical follow-up; the records
            themselves are not deleted.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            Other Ways to Request Deletion
          </h2>
          <p>If you prefer not to use the form above, you can also:</p>
          <ol className="list-decimal pl-6 mt-2 space-y-2">
            <li>
              <strong>Via Facebook/Instagram:</strong> If you connected our app
              through Facebook or Instagram, go to Settings &amp; Privacy →
              Settings → Apps and Websites, find Clariva Care, and click
              &quot;Remove&quot; or &quot;Send Request&quot; to trigger a data
              deletion request. We will receive the request and process it.
            </li>
            <li>
              <strong>Via email:</strong> Contact the healthcare practice you
              booked with and ask them to forward your deletion request to us.
              Include your name, phone number, and/or the Instagram handle you
              used so we can identify your records.
            </li>
            <li>
              <strong>Via our contact:</strong> Email the contact address listed
              in our Meta app settings (Basic Settings → Contact email) with the
              subject &quot;Data Deletion Request&quot; and include the
              identifiers you used (name, phone, Instagram handle).
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
