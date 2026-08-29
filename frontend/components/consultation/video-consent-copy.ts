/**
 * rec-26 patient-facing consent copy. Founder owns the final words (5.5).
 * Kept out of VideoConsentModal so tests can assert the strings without
 * mounting the dialog (1Hz countdown + Realtime hook hang vitest).
 */

export const CONSENT_ALREADY_VISIBLE =
  "Your doctor can already see you. This choice is only about whether we save the video.";

export const CONSENT_GRANT_BOUNDS =
  "If you say yes, we start saving now, for up to 2 minutes. Your doctor can add 2 more minutes once.";

export const CONSENT_PAUSE_OR_STOP =
  "You can pause or stop saving at any moment. Pause is temporary — you can resume without being asked again. Stop ends saving and turns your camera off until you turn it back on.";

export const CONSENT_DECLINE =
  "If you say no, the video is not saved. The visit goes on. Your doctor can still see you, just like now.";

export const CONSENT_BODY_PARAGRAPHS = [
  CONSENT_ALREADY_VISIBLE,
  CONSENT_GRANT_BOUNDS,
  CONSENT_PAUSE_OR_STOP,
  CONSENT_DECLINE,
] as const;
