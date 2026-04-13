/**
 * Canonical kin / role terms for deterministic "book for my …" / multi-person booking (e-task-phil-02).
 * Prefer `resolveBookingTargetRelationForDm` in `ai-service` for OOV phrasing; extend this list only when
 * product requires zero-latency keyword match — add unit test coverage when changing.
 */

/** Pipe-separated alternation for embedding in RegExp (EN + common desi English). */
export const BOOKING_RELATION_KIN_PATTERN =
  'mother|father|mom|dad|mummy|papa|amma|appa|wife|husband|son|daughter|sister|brother|parent|parents|spouse|grandmother|grandma|grandfather|grandpa|nani|nana|dadi|dada|grandchild|grandson|granddaughter|kid|kids|child|children|baby|partner|friend|boss|colleague|coworker|uncle|aunt|cousin|nephew|niece|father-in-law|mother-in-law|brother-in-law|sister-in-law|fiancé|fiance|mentor';
