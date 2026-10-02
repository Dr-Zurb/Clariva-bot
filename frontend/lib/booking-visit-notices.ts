/**
 * Patient-facing booking notices. They name no place and no number:
 * emergency numbers differ by location, and this form does not direct
 * anyone to a facility.
 *
 * The acknowledgement checkbox on the booking page is separate from
 * privacy consent and is not persisted.
 */

export const SCHEDULED_VISIT_NOTICE =
  "For scheduled visits only. This is not an emergency service.";

export const AFTER_BOOKING_URGENCY_NOTICE =
  "If your symptoms get worse before your visit, don't wait for this appointment — get urgent medical help.";
