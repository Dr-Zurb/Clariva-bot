/**
 * Booking review → Inbox (IB3 / IBI3-D4).
 * Service-match triage lives under Inbox → Needs review.
 */

import { redirect } from "next/navigation";

export default function BookingReviewRedirectPage() {
  redirect("/dashboard/inbox?filter=needs_review");
}
