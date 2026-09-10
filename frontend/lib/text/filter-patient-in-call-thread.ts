import type { ConsultationMessage } from "@/lib/text/types";

const JOIN_EVENTS = new Set(["party_joined", "participant_joined"]);
const NOISE_EVENTS = new Set([
  ...JOIN_EVENTS,
  "mute_changed",
  "consult_started",
]);

export function isJoinSystemMessage(message: ConsultationMessage): boolean {
  return (
    message.kind === "system" &&
    (JOIN_EVENTS.has(message.systemEvent ?? "") ||
      /joined the consult\.?$/i.test(message.body))
  );
}

export function isInCallNoiseSystemMessage(
  message: ConsultationMessage,
): boolean {
  if (message.kind !== "system") return false;
  if (NOISE_EVENTS.has(message.systemEvent ?? "")) return true;
  if (isJoinSystemMessage(message)) return true;
  if (/^consultation started\b/i.test(message.body)) return true;
  if (/\b(muted|unmuted) (your|their) microphone\b/i.test(message.body)) {
    return true;
  }
  return false;
}

export function isChatActivityMessage(message: ConsultationMessage): boolean {
  return message.kind !== "system" && !message.deleted_at;
}

/**
 * In-call thread: drop join / mute / "consult started" banners.
 * If nothing real was said, drop leftover system rows so "Today"
 * does not show above an empty conversation.
 */
export function filterInCallThread(
  messages: ConsultationMessage[],
): ConsultationMessage[] {
  const cleaned = messages.filter(
    (message) => !isInCallNoiseSystemMessage(message),
  );
  if (cleaned.some(isChatActivityMessage)) return cleaned;
  return cleaned.filter((message) => message.kind !== "system");
}

/** @deprecated Use filterInCallThread — same filter, all in-call panes. */
export const filterPatientInCallThread = filterInCallThread;
