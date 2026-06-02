/**
 * Sub-batch B · task-video-B5 (and voice A9, when it imports this) —
 * pure disconnect-reason classifier shared by `<VideoRoom>` and
 * `<VoiceConsultRoom>`.
 *
 * Modality-agnostic by design — both rooms call out to the same
 * function so the splash UI can render consistent copy regardless of
 * the call type. Voice A9 will import from this exact path; do not
 * move the file without coordinating both consumers.
 *
 * Branch order matters: more-specific signals win over more-generic
 * ones. Specifically:
 *
 *   1. `ourLocalEndCalled === true` → `'local'` (the user clicked end).
 *      Wins over everything else because we know with certainty what
 *      they did.
 *   2. `tokenExpiredAt && tokenExpiredAt < now` → `'token_expired'`.
 *      Wins over generic Twilio errors so the splash can offer the
 *      "Restart" CTA (a fresh token mint).
 *   3. Twilio token-error codes (20101 / 20103 / 20104) →
 *      `'token_expired'`. Same as above; the SDK surfaces these when
 *      the access token expires mid-call.
 *   4. Twilio connection-failure codes (53000-53999 except token
 *      family) → `'connection_lost'`. Covers signaling drops AND
 *      media-connection failures.
 *   5. `remoteEndedFirst === true` AND no other reason matched →
 *      `'remote'` (the counterparty left and we then disconnected).
 *   6. `sessionStatus === 'ended'` AND scheduled-end was reached →
 *      `'timeout'`. Future hook for slot-time enforcement.
 *   7. Default → `'unknown'`.
 *
 * NOTE: today's `<VideoRoom>` doesn't auto-disconnect on remote
 * leave (B4 reconnection-timeout territory), so the `'remote'`
 * branch only fires when the local user manually leaves AFTER
 * the remote already left. The classifier picks `'remote'` in
 * that case because the user is dismissing a call that was
 * already effectively over.
 */

export type DisconnectReason =
  | "local"
  | "remote"
  | "connection_lost"
  | "timeout"
  | "token_expired"
  | "unknown";

export interface ClassifyDisconnectInput {
  /**
   * Twilio's error object from `room.on('disconnected', (room, error?) => …)`.
   * Optional — `disconnected` fires without an error on a clean
   * `room.disconnect()` (the local-end path).
   *
   * Any object with a numeric `code` is acceptable so callers don't
   * have to import twilio-video's `TwilioError` type just to satisfy
   * the input shape.
   */
  twilioError?: { code?: number; message?: string } | null;
  /**
   * True if the local user explicitly clicked end-call (Leave button
   * → confirmation modal → confirm). Set in `<VideoRoom>`'s
   * `handleLeave` BEFORE the disconnect event fires so the classifier
   * can treat this as the most-specific signal.
   */
  ourLocalEndCalled: boolean;
  /**
   * True if the OTHER participant disconnected first (Twilio
   * `participantDisconnected` event fired before local
   * `disconnected`). For 1-on-1 calls, this is the "Patient ended /
   * Doctor ended" branch.
   */
  remoteEndedFirst?: boolean;
  /**
   * Server-side session state at disconnect time. Used to detect
   * `'timeout'` when the scheduled call window closed. Wired up by
   * future tasks (B4 reconnection, E2 audio fallback may consult).
   * Optional today.
   */
  sessionStatus?: "ended" | "cancelled";
  /**
   * Last-known token TTL (mint time + ttl). When the splash fires
   * AFTER this value, classify as `'token_expired'` so the user
   * gets the "Restart" CTA. Optional — when omitted, falls through
   * to Twilio error-code inspection.
   */
  tokenExpiredAt?: Date | null;
}

const TWILIO_TOKEN_ERROR_CODES = new Set<number>([
  20101, // Invalid Access Token
  20103, // Invalid Access Token issuer/subject
  20104, // Access Token expired
]);

/**
 * Twilio Video signaling + media error codes that should be
 * classified as `connection_lost`. Drawn from the Twilio Video
 * JS SDK's `TwilioError.code` table:
 *
 *   53000  SignalingConnectionError
 *   53001  SignalingConnectionDisconnected
 *   53002  SignalingConnectionTimeout
 *   53204  SignalingServerBusy
 *   53400  MediaConnectionError
 *   53405  MediaConnectionFailedError
 *
 * The full 53000–53999 range covers SDK-level connection issues;
 * we treat anything in that band (other than the explicit token
 * codes above) as `connection_lost` for v1. Refine later if a
 * specific code warrants its own splash copy (e.g. 53006 = room
 * full → distinct copy).
 */
function isTwilioConnectionErrorCode(code: number): boolean {
  return code >= 53000 && code < 54000;
}

export function classifyDisconnect(
  input: ClassifyDisconnectInput,
  now: Date = new Date(),
): DisconnectReason {
  const {
    twilioError,
    ourLocalEndCalled,
    remoteEndedFirst,
    sessionStatus,
    tokenExpiredAt,
  } = input;

  // 1. Local end wins over everything — the user told us.
  if (ourLocalEndCalled) {
    return "local";
  }

  // 2. Token-expiry by stamp wins over generic SDK errors so the
  //    splash can offer Restart (fresh mint), not Rejoin (cached).
  if (tokenExpiredAt instanceof Date && tokenExpiredAt.getTime() < now.getTime()) {
    return "token_expired";
  }

  // 3. Token-expiry by SDK error code (20101 / 20103 / 20104).
  if (twilioError && typeof twilioError.code === "number") {
    if (TWILIO_TOKEN_ERROR_CODES.has(twilioError.code)) {
      return "token_expired";
    }
    // 4. Generic Twilio connection failures → connection_lost.
    if (isTwilioConnectionErrorCode(twilioError.code)) {
      return "connection_lost";
    }
  }

  // 5. Remote ended first (counterparty left, we then disconnected).
  //    Decision: the explicit local-end signal (#1 above) wins over
  //    `remoteEndedFirst`. Rationale — if the user just clicked Leave,
  //    they expect "You ended the call." The hybrid case ("remote left
  //    THEN I clicked end") is rare in practice; doctors usually
  //    notice the empty-tile state and don't manually end. If telemetry
  //    later shows this matters, promote `remoteEndedFirst` above #1.
  if (remoteEndedFirst) {
    return "remote";
  }

  // 6. Server-marked timeout. Future hook; today's `<VideoRoom>`
  //    doesn't surface this signal, so this branch is dead code
  //    until the slot-enforcement scheduler (E1 territory) lands.
  if (sessionStatus === "ended") {
    return "timeout";
  }

  // 7. Default — couldn't determine reason. Splash will say
  //    "Call ended unexpectedly" + offer Rejoin.
  return "unknown";
}

/**
 * Build the patient-facing or doctor-facing copy for a given reason.
 *
 *   `actorLabel` is the counterparty name when known (e.g.
 *   "Dr. Sharma" / "Patient"). When omitted, falls back to a generic
 *   "the other person" copy. `<CallDisconnectSplash>` already infers
 *   this from the room's `remoteLabel` so call sites usually pass it.
 *
 * Kept in the same module as the classifier so a single import
 * pulls both the type AND the renderer-side mapping. `<CallDisconnectSplash>`
 * consumes this directly; voice A9 will too.
 */
export function disconnectReasonCopy(
  reason: DisconnectReason,
  options: {
    role: "doctor" | "patient";
    actorLabel?: string;
    /** voice-A9 — T2 §T2.16 headline/body table for `<VoicePostCallSplash>`. */
    modality?: "default" | "voice";
  } = { role: "patient" },
): { headline: string; body?: string } {
  const { role, actorLabel, modality = "default" } = options;
  const counterparty = actorLabel ?? (role === "doctor" ? "the patient" : "the doctor");

  if (modality === "voice") {
    switch (reason) {
      case "local":
        return { headline: "You ended the call." };
      case "remote":
        return {
          headline:
            role === "patient"
              ? `${capitalize(counterparty)} ended the call.`
              : "Patient ended the call.",
        };
      case "connection_lost":
        return { headline: "Call disconnected — connection lost." };
      case "timeout":
        return { headline: "Call ended — slot time expired." };
      case "token_expired":
        return { headline: "Session token expired — please rejoin." };
      case "unknown":
      default:
        return { headline: "Call ended." };
    }
  }

  switch (reason) {
    case "local":
      return { headline: "You ended the call." };
    case "remote":
      return {
        headline: `${capitalize(counterparty)} ended the call.`,
      };
    case "connection_lost":
      return {
        headline: "Lost connection.",
        body: "We couldn't keep the call connected. You can try to rejoin.",
      };
    case "timeout":
      return {
        headline: "Call ended.",
        body: "The scheduled time for this consult has elapsed.",
      };
    case "token_expired":
      return {
        headline: "Session expired.",
        body: "Your access to this consult has expired. Please restart from your booking link.",
      };
    case "unknown":
    default:
      return {
        headline: "Call ended unexpectedly.",
        body: "We're not sure why the call ended. You can try to rejoin.",
      };
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
