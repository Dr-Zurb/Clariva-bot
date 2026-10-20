/**
 * Ideas from the phone sheet that the server has not confirmed yet.
 * Add shows "Saved" at once; the idea stays here until the card exists,
 * so closing the sheet mid-save does not lose it.
 */

import { createSocialCard, listSocialCards } from "./social-cards";

const KEY = "halo-idea-pending-v1";
const RESEND_AFTER_MS = 3 * 60 * 1000;
const SAME_CARD_WINDOW_MS = 10 * 60 * 1000;

export type PendingIdea = {
  id: string;
  title: string;
  note?: string;
  sourceUrl?: string;
  filePath?: string;
  at: number;
};

export function newPendingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readPendingIdeas(): PendingIdea[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingIdea =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PendingIdea).id === "string" &&
        typeof (item as PendingIdea).title === "string" &&
        typeof (item as PendingIdea).at === "number"
    );
  } catch {
    return [];
  }
}

function writeAll(ideas: PendingIdea[]): void {
  try {
    if (ideas.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(ideas));
  } catch {
    // Storage can be full or blocked. The save in flight still runs.
  }
}

export function keepPendingIdea(idea: PendingIdea): void {
  writeAll([...readPendingIdeas().filter((item) => item.id !== idea.id), idea]);
}

export function dropPendingIdea(id: string): void {
  writeAll(readPendingIdeas().filter((item) => item.id !== id));
}

export function pendingIdeaDraft(idea: PendingIdea) {
  return {
    ...(idea.note ? { words: { note: idea.note } } : {}),
    ...(idea.sourceUrl ? { sourceUrl: idea.sourceUrl } : {}),
    ...(idea.filePath ? { filePath: idea.filePath } : {}),
  };
}

/**
 * Sends ideas a closed sheet left behind. A card that already landed is not
 * created twice. Recent entries are skipped because their save may still be running.
 */
export async function resendPendingIdeas(token: string): Promise<void> {
  const now = Date.now();
  const waiting = readPendingIdeas().filter((idea) => now - idea.at > RESEND_AFTER_MS);
  if (waiting.length === 0) return;
  let cards: Awaited<ReturnType<typeof listSocialCards>>;
  try {
    cards = await listSocialCards(token);
  } catch {
    return;
  }
  for (const idea of waiting) {
    const landed = cards.some(
      (card) =>
        card.title === idea.title &&
        (card.sourceUrl ?? undefined) === idea.sourceUrl &&
        Date.parse(card.createdAt) >= idea.at - SAME_CARD_WINDOW_MS
    );
    if (landed) {
      dropPendingIdea(idea.id);
      continue;
    }
    try {
      await createSocialCard(token, idea.title, "thoughts", pendingIdeaDraft(idea));
      dropPendingIdea(idea.id);
    } catch {
      // Stays on the phone for the next open.
    }
  }
}
