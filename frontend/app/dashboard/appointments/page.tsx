import { redirect } from "next/navigation";

/**
 * Legacy appointments list removed (2026-05-28). OPD today is the operational hub.
 * Keep this route as a redirect so bookmarks and old links land safely.
 */
export default function AppointmentsRedirect() {
  redirect("/dashboard/opd-today");
}
