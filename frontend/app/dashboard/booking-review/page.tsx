import { redirect } from "next/navigation";

/** Booking review lived inside Inbox. That screen is gone. */
export default function BookingReviewRedirectPage() {
  redirect("/dashboard");
}
