/** `for` picks a step on /d/:slug. A missing flag is still "visit" for the form title. The slug page itself shows the practice screen until `for` is set. */

export type BookingPagePurpose = "visit" | "times" | "change";

export function bookingPagePurpose(forParam: string | null | undefined): BookingPagePurpose {
  if (forParam === "times") return "times";
  if (forParam === "change") return "change";
  return "visit";
}

export function bookingPageTitle(purpose: BookingPagePurpose, reschedule: boolean): string {
  if (reschedule) return "Reschedule Appointment";
  if (purpose === "times") return "Availability";
  if (purpose === "change") return "Change or cancel a visit";
  return "New visit";
}

/** Same page, opened on the new-visit form. A chat link with no `for` is the menu. */
export function newVisitPath(path: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("for", "visit");
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
