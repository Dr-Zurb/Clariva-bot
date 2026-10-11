import { redirect } from "next/navigation";

/** The chat inbox is not a doctor surface. Old links land on Today. */
export default function InboxRedirectPage() {
  redirect("/dashboard");
}
