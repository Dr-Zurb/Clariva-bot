import { createClient } from "@/lib/supabase/server";
import { getDoctorSettings, getServiceStaffReviews } from "@/lib/api";
import { redirect } from "next/navigation";
import { ServiceReviewsInbox } from "@/components/service-reviews/ServiceReviewsInbox";

/**
 * ARM-07: Service match review inbox (pending AI proposals → confirm / reassign / cancel).
 */
export default async function ServiceReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  if (!token) redirect("/login");

  let errorMessage: string | null = null;
  let reviews: Awaited<ReturnType<typeof getServiceStaffReviews>>["data"]["reviews"] = [];
  let settings: Awaited<ReturnType<typeof getDoctorSettings>>["data"]["settings"] | null = null;

  try {
    const [reviewsRes, settingsRes] = await Promise.all([
      getServiceStaffReviews(token, "pending"),
      getDoctorSettings(token),
    ]);
    reviews = reviewsRes.data.reviews;
    settings = settingsRes.data.settings;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 500;
    if (status === 401) {
      redirect("/login");
    }
    errorMessage =
      status === 403
        ? "You don’t have access to this page."
        : "Unable to load service reviews. Please try again.";
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
        aria-live="polite"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{errorMessage}</p>
      </div>
    );
  }

  return (
    <ServiceReviewsInbox initialReviews={reviews} settings={settings} token={token} />
  );
}
