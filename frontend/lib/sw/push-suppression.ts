/**
 * Web Push active-tab suppression helpers (task-text-D6c).
 *
 * Mirrored in `frontend/public/sw.js` push handler — keep in sync.
 *
 * Trade-off: a patient with the consult tab focused but the OS screen
 * locked still gets no notification (`clients.focused` is the signal).
 */

export interface PushSuppressionClient {
  focused: boolean;
  url: string;
}

export interface PushSuppressionPayload {
  data?: {
    deeplink?: string;
    sessionId?: string;
  };
}

/**
 * Returns true when a focused client already shows the push target surface.
 *
 * Uses deeplink when present (modality-specific) so a voice tab does NOT
 * suppress a text chat push for the same session.
 */
export function shouldSuppressWebPush(
  clients: PushSuppressionClient[],
  payload: PushSuppressionPayload,
): boolean {
  const deeplink = payload.data?.deeplink?.trim();
  const sessionId = payload.data?.sessionId?.trim();

  if (deeplink) {
    return clients.some((client) => client.focused && client.url.includes(deeplink));
  }

  if (sessionId) {
    return clients.some((client) => client.focused && client.url.includes(sessionId));
  }

  return false;
}
