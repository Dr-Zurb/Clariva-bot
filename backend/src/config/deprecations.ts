/**
 * HTTP deprecation metadata for legacy OPD session endpoints (pdm-02, pdm-12).
 * Target removal: 2026-08-01 — confirm with the team before merge.
 */
export const OPD_LEGACY_SESSION_SUNSET = '2026-08-01T00:00:00Z';

export const OPD_LEGACY_SESSION_SUCCESSOR = '/api/v1/opd/session?date=YYYY-MM-DD';

/** Anchor in docs/Reference/engineering/architecture/CONTRACTS.md — doctor OPD session snapshot section. */
export const OPD_LEGACY_SESSION_DEPRECATION_DOC_LINK =
  'https://github.com/clariva-bot/clariva-bot/blob/main/docs/Reference/engineering/architecture/CONTRACTS.md#doctor-opd-session-snapshot-get-apiv1opdsession';
