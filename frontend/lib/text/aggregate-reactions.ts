/**
 * text-B5 — pure aggregation of per-row reactions into emoji → user_id[].
 */

/** Five-emoji whitelist — mirrors migration 107 CHECK constraint. */
export const REACTION_EMOJIS = ["👍", "❤️", "✓", "❓", "😮"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export interface ConsultationMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: ReactionEmoji;
  created_at: string;
}

export function aggregateReactions(
  rows: ConsultationMessageReaction[],
): Record<string, string[]> {
  return rows.reduce(
    (acc, r) => {
      (acc[r.emoji] ||= []).push(r.user_id);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}
