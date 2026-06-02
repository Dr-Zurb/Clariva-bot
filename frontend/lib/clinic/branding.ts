/**
 * Sub-batch B · task-video-B1 — clinic branding for consultation lobbies.
 *
 * **Contract authored here, ahead of voice B2.** The voice batch's
 * `task-voice-B2-precall-lobby.md` will land its own clinic-branding work
 * later; B1's task draft says "if voice has shipped, import it; otherwise
 * ship the contract here". This file IS that contract — voice B2 will
 * import from here when it picks up.
 *
 * Today's data flow (post 0B + B1):
 *
 *   Patient join page calls `requestTextSessionToken(sessionId, hmac)`
 *   → backend `exchangeTextConsultTokenHandler` looks up
 *     `doctor_settings.practice_name` for the session's doctor (already
 *     wired pre-B1 — see consultation-controller.ts §practiceName lookup)
 *     AND emits `scheduledStartAt` from `consultation_sessions.scheduled_start_at`.
 *   → page receives `{ practiceName?, scheduledStartAt, … }` and passes
 *     into `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>`.
 *
 * What this file owns:
 *
 *   1. **`resolveClinicBranding(input)`** — pure normaliser. Takes the
 *      sparse server payload (`{ practiceName? }` today, `{ logoUrl?,
 *      primaryColor? }` later) and returns a `ClinicBranding` object
 *      with text-only fallback so renderers don't have to do
 *      null-checks at every step.
 *   2. **`formatAppointmentTimeEnGB(iso)`** — date/time formatter
 *      pinned to `en-GB` per task note #3 (deferred-date-locale-
 *      hydration sweep). Returns separate date + time lines so the
 *      header can stack them or inline them depending on viewport.
 *   3. **`actorInitials(name)` reuse note** — the avatar fallback
 *      ("CL" for "Clariva Clinic") is deliberately NOT reimplemented
 *      here; B1's lobby header reuses the existing
 *      `frontend/lib/call/actor-avatar.ts` `actorInitials` /
 *      `actorColor` helpers (originally extracted by B2 for
 *      `<CallerCardOverlay>`). Same colour palette → visual parity
 *      between the lobby and the in-call card.
 *
 * What this file does NOT own (deferrals + voice B2 wire-up notes):
 *
 *   - `logoUrl` fetch + `<img>` lifecycle. The `doctor_settings` table
 *     has no `logo_url` column today (verified against
 *     `docs/Reference/engineering/architecture/DB_SCHEMA.md` §doctor_settings). When voice B2
 *     introduces the schema column + backend pipe, just add `logoUrl`
 *     to the `BrandingInput` shape; `resolveClinicBranding()` already
 *     plumbs it through.
 *   - `primaryColor` theming. Same story — no `primary_color` column.
 *     Field is exposed in the type so the lobby header can paint
 *     accent borders / ring colours when the data arrives without a
 *     second prop-plumbing pass.
 *   - In-memory cache for authenticated `getClinicBranding()` (voice B2).
 *     Patient lobby still resolves from the token-exchange payload to
 *     avoid an extra round-trip before the HMAC is consumed.
 *
 * SSR safety: this module is pure (no DOM / fetch / window access). Safe
 * to import from server components, route handlers, and tests.
 */

import { actorColor, actorInitials } from "@/lib/call/actor-avatar";
import { getDoctorSettings } from "@/lib/api";

/** Per-tab in-memory cache — one fetch per doctor per page load. */
const brandingFetchCache = new Map<string, Promise<ClinicBranding>>();

/**
 * Raw branding fields from `doctor_settings` (and future logo/color columns).
 * Used by `getClinicBranding` before `resolveClinicBranding`.
 */
export interface ClinicBrandingSource {
  logoUrl?: string | null;
  practiceName?: string | null;
  primaryColor?: string | null;
}

/**
 * Resolved clinic branding ready to render. Always has a `practiceName`
 * (falls back to a generic copy when the server payload is sparse) so
 * renderers can pass it directly into JSX without a second null-check.
 */
export interface ClinicBranding {
  /** Display name. Always non-empty (`'Your clinic'` fallback). */
  practiceName: string;
  /**
   * Whether `practiceName` came from server data or is a fallback.
   * Renderers can use this to dim the chrome (a "we don't know yet"
   * affordance) or to swap copy.
   */
  isFallback: boolean;
  /**
   * Two-letter initials for the avatar / logo placeholder. Computed
   * via the shared `actorInitials` helper so the lobby and the in-call
   * caller card use the same algorithm (e.g. "Clariva Clinic" → "CC").
   */
  initials: string;
  /**
   * Tailwind class for the avatar background (e.g. `'bg-emerald-500'`).
   * Same `actorColor` palette as `<CallerCardOverlay>` (B2) so the
   * lobby logo placeholder and the in-call avatar match for the same
   * practice name.
   */
  initialsBgClass: string;
  /**
   * Optional logo image URL. **Today: always undefined** — see file-
   * level deferral note. Renderers should treat `undefined` as
   * "show the initials placeholder".
   */
  logoUrl?: string;
  /**
   * Optional primary brand colour as a CSS colour string (`#RRGGBB`
   * or `rgb(...)`). **Today: always undefined.** Reserved for future
   * theming.
   */
  primaryColor?: string;
}

/**
 * The sparse, optional shape the server payload arrives in. Mirrors
 * the relevant subset of `TextConsultTokenExchangeData`. Kept loose
 * (every field optional) so caller code can pass the whole payload
 * without filtering.
 */
export interface BrandingInput {
  practiceName?: string | null;
  /** Reserved for future schema; ignored today. */
  logoUrl?: string | null;
  /** Reserved for future schema; ignored today. */
  primaryColor?: string | null;
}

/** Generic copy used when the server doesn't surface a practice name. */
const FALLBACK_PRACTICE_NAME = "Your clinic";

/**
 * Normalise the server payload into a render-ready `ClinicBranding`.
 *
 * Behaviour:
 * - `null` / `undefined` / whitespace-only `practiceName` → fallback
 *   copy + `isFallback: true` + initials computed from the fallback.
 * - Non-empty `practiceName` → trimmed; initials + colour computed
 *   from the resolved name (so the lobby and the in-call card align).
 * - `logoUrl` / `primaryColor` plumbed through verbatim when truthy
 *   (today: always undefined).
 */
/**
 * Fetch clinic branding for the authenticated doctor. Cached in-memory
 * for the lifetime of the page so countdown re-renders do not refetch.
 *
 * `doctorId` keys the cache (typically `appointment.doctor_id`); the
 * Bearer token scopes the API call to that doctor's row.
 */
export function getClinicBranding(
  doctorId: string,
  authToken: string,
): Promise<ClinicBranding> {
  const cacheKey = doctorId.trim() || "self";
  const existing = brandingFetchCache.get(cacheKey);
  if (existing) return existing;

  const promise = getDoctorSettings(authToken)
    .then((res) => {
      const row = res.data as ClinicBrandingSource & {
        practice_name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      };
      return resolveClinicBranding({
        practiceName: row.practice_name ?? row.practiceName,
        logoUrl: row.logo_url ?? row.logoUrl,
        primaryColor: row.primary_color ?? row.primaryColor,
      });
    })
    .catch(() => resolveClinicBranding(null));

  brandingFetchCache.set(cacheKey, promise);
  return promise;
}

/** Clears the in-memory cache (tests only). */
export function __clearClinicBrandingCacheForTests(): void {
  brandingFetchCache.clear();
}

export function resolveClinicBranding(
  input: BrandingInput | null | undefined,
): ClinicBranding {
  const rawName =
    input?.practiceName?.trim() && input.practiceName.trim().length > 0
      ? input.practiceName.trim()
      : null;
  const practiceName = rawName ?? FALLBACK_PRACTICE_NAME;
  const isFallback = rawName === null;

  const trimmedLogo = input?.logoUrl?.trim();
  const trimmedColor = input?.primaryColor?.trim();

  return {
    practiceName,
    isFallback,
    initials: actorInitials(practiceName),
    initialsBgClass: actorColor(practiceName),
    logoUrl: trimmedLogo ? trimmedLogo : undefined,
    primaryColor: trimmedColor ? trimmedColor : undefined,
  };
}

/**
 * `Intl.DateTimeFormat` instance pinned to `en-GB`. Cached at module
 * scope because constructing `Intl.DateTimeFormat` is non-trivially
 * expensive (it bootstraps the locale data) — and the lobby countdown
 * re-renders every second.
 *
 * Two formatters: one for the date line ("Fri, 1 May 2026"), one for
 * the time line ("14:30") — kept separate so the header can stack
 * them or inline them depending on viewport.
 */
const DATE_FORMATTER_EN_GB = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TIME_FORMATTER_EN_GB = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Formatted appointment date + time, ready to render. Returns
 * `null` for invalid / missing inputs so callers can branch cleanly.
 *
 * Examples (en-GB output):
 *   "2026-05-01T14:30:00Z" → { dateLine: "Fri, 1 May 2026", timeLine: "20:00" }
 *
 * Note: time is rendered in the BROWSER's local timezone, not UTC and
 * not the doctor's timezone. The patient sees the consult time in
 * their own clock — which is what they actually need. Doctor side
 * (when it ships) will want the doctor's `doctor_settings.timezone`
 * applied; deferred to voice B2 / a follow-up.
 */
export function formatAppointmentTimeEnGB(
  iso: string | null | undefined,
): { dateLine: string; timeLine: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    dateLine: DATE_FORMATTER_EN_GB.format(date),
    timeLine: TIME_FORMATTER_EN_GB.format(date),
  };
}
