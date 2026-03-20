export const metadata = {
  title: "Data Deletion Request | Clariva Care",
  description: "How to request deletion of your data from Clariva Care",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Data Deletion Request
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        How to request deletion of your personal data
      </p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
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
            How to Request Deletion
          </h2>
          <p>You can request data deletion in the following ways:</p>
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

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            What We Delete
          </h2>
          <p>
            Upon request, we delete or anonymize your personal data, including
            name, contact details, conversation history, and appointment records
            associated with your identifiers. We may retain anonymized or
            aggregated data where required by law or for legitimate business
            purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mt-6">
            Confirmation
          </h2>
          <p>
            After processing your request, we will confirm deletion (or explain
            any legitimate reason we cannot delete certain data) via the contact
            method you provided.
          </p>
        </section>
      </div>
    </main>
  );
}
