/**
 * A start-making time is a reminder. It does not move the card.
 * Chosen: Start making, Start today, or Late.
 * Making: Work on it, or Late once that time has passed.
 */

export type MakeStage = "chosen" | "making";
export type MakeTone = "planned" | "today" | "late" | "work";

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function makeTone(makeAt: string | null, stage: MakeStage, now = Date.now()): MakeTone | null {
  const time = Date.parse(makeAt ?? "");
  if (!makeAt || Number.isNaN(time)) return null;
  if (time < now) return "late";
  if (stage === "making") return "work";
  if (sameDay(new Date(time), new Date(now))) return "today";
  return "planned";
}

/** Lower ranks sort first: late, then today, then a future plan. */
export function makeRank(makeAt: string | null, stage: MakeStage, now = Date.now()): number {
  const tone = makeTone(makeAt, stage, now);
  if (tone === "late") return 0;
  if (tone === "today") return 1;
  if (tone === "planned" || tone === "work") return 2;
  return 3;
}

export function makeLine(makeAt: string | null, stage: MakeStage, now = Date.now()): string | null {
  const tone = makeTone(makeAt, stage, now);
  if (!tone || !makeAt) return null;
  const when = new Date(makeAt);
  const day = when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const clock = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (tone === "late") return `Late · ${day}`;
  if (tone === "today") return `Start today · ${clock}`;
  if (tone === "work") return `Work on it ${day}, ${clock}`;
  return `Start making ${day}, ${clock}`;
}
