import { LegalShell } from "@/components/legal/LegalShell";
import { DataDeletionClient } from "./DataDeletionClient";
import { MetaCallbackStatus } from "./MetaCallbackStatus";

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
export default function DataDeletionPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const confirmationCode = searchParams?.code?.trim() ?? "";

  return (
    <LegalShell activeHref="/data-deletion">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Data Deletion Request
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        How to request deletion of your personal data
      </p>

      {confirmationCode ? (
        <div className="mt-8">
          <MetaCallbackStatus code={confirmationCode} />
        </div>
      ) : null}

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
            prescriptions, consultation notes and transcripts) are retained
            because your doctor is required to keep clinical records. Your doctor
            continues to have access to those records for clinical follow-up; the
            records themselves are not deleted. If you want those records removed,
            that is a decision for the practice that holds them, and you should
            contact them directly.
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
              <strong className="text-foreground">Via email:</strong> Write to{" "}
              <a
                href="mailto:founder@haloaid.com"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                founder@haloaid.com
              </a>{" "}
              with the subject &quot;Data Deletion Request&quot;. Include the
              identifiers you used — name, phone number, and/or the Instagram
              handle — so we can find your records.
            </li>
            <li>
              <strong className="text-foreground">Via your practice:</strong>{" "}
              Contact the healthcare practice you booked with and ask them to
              action or forward your deletion request.
            </li>
          </ol>
        </section>
      </div>
    </LegalShell>
  );
}
