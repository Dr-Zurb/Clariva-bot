import type { ConsultationMessage } from "@/lib/text/types";

function isMuteChanged(m: ConsultationMessage): boolean {
  return m.kind === "system" && m.systemEvent === "mute_changed";
}

/**
 * Collapse consecutive `mute_changed` system rows into one summary line.
 * Keeps the last event's timestamp/metadata and adds `mute_collapse_count`.
 */
export function collapseMuteSystemMessages(
  messages: ConsultationMessage[],
): ConsultationMessage[] {
  if (messages.length === 0) return messages;

  const out: ConsultationMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const current = messages[i]!;
    if (!isMuteChanged(current)) {
      out.push(current);
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < messages.length && isMuteChanged(messages[j]!)) {
      j += 1;
    }
    const streak = messages.slice(i, j);
    const last = streak[streak.length - 1]!;
    if (streak.length === 1) {
      out.push(last);
    } else {
      out.push({
        ...last,
        metadata: {
          ...(last.metadata ?? {}),
          mute_collapse_count: streak.length,
        },
      });
    }
    i = j;
  }
  return out;
}
