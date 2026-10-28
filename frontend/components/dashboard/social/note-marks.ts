/**
 * Inline marks for a thought line. The stored string keeps the words plus
 * «b,i,u,s,t:red,h:yellow»spans«/». A color is a name or #rrggbb.
 * A line with no marks is stored as plain text.
 * A literal « is stored as ««.
 */

export const NOTE_COLORS = [
  { id: "gray", label: "Gray" },
  { id: "brown", label: "Brown" },
  { id: "orange", label: "Orange" },
  { id: "yellow", label: "Yellow" },
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
  { id: "red", label: "Red" },
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number]["id"];
export type ToneColor = NoteColor | `#${string}`;

export type StyleFlag = "bold" | "italic" | "underline" | "strike";

export type MarkStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: ToneColor;
  highlight?: ToneColor;
};

export type TextRun = { text: string; style: MarkStyle };

const MARK = "«";
const END = "»";
const STOP = "«/»";

const TONE_HEX = /^#[0-9a-f]{6}$/;

export function namedColor(value: string): value is NoteColor {
  return NOTE_COLORS.some((item) => item.id === value);
}

export function toneValue(value: string): ToneColor | null {
  if (namedColor(value)) return value;
  const hex = value.trim().toLowerCase();
  return TONE_HEX.test(hex) ? (hex as ToneColor) : null;
}

export function styleToken(style: MarkStyle): string {
  const parts: string[] = [];
  if (style.bold) parts.push("b");
  if (style.italic) parts.push("i");
  if (style.underline) parts.push("u");
  if (style.strike) parts.push("s");
  if (style.color) parts.push(`t:${style.color}`);
  if (style.highlight) parts.push(`h:${style.highlight}`);
  return parts.join(",");
}

function parseStyle(token: string): MarkStyle | null {
  if (!token) return null;
  const style: MarkStyle = {};
  for (const part of token.split(",")) {
    if (part === "b") style.bold = true;
    else if (part === "i") style.italic = true;
    else if (part === "u") style.underline = true;
    else if (part === "s") style.strike = true;
    else if (part.startsWith("t:")) {
      const color = toneValue(part.slice(2));
      if (!color) return null;
      style.color = color;
    } else if (part.startsWith("h:")) {
      const color = toneValue(part.slice(2));
      if (!color) return null;
      style.highlight = color;
    } else return null;
  }
  return styleToken(style) ? style : null;
}

export function readRuns(stored: string): TextRun[] {
  const runs: TextRun[] = [];
  let style: MarkStyle = {};
  function push(text: string, next: MarkStyle): void {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && styleToken(last.style) === styleToken(next)) last.text += text;
    else runs.push({ text, style: next });
  }
  let i = 0;
  while (i < stored.length) {
    if (stored.startsWith(`${MARK}${MARK}`, i)) {
      push(MARK, style);
      i += 2;
      continue;
    }
    if (stored.startsWith(STOP, i)) {
      style = {};
      i += STOP.length;
      continue;
    }
    if (stored[i] === MARK) {
      const close = stored.indexOf(END, i + 1);
      if (close > i) {
        const parsed = parseStyle(stored.slice(i + 1, close));
        if (parsed) {
          style = parsed;
          i = close + 1;
          continue;
        }
      }
    }
    push(stored[i] ?? "", style);
    i += 1;
  }
  return runs;
}

export function writeRuns(runs: readonly TextRun[]): string {
  let out = "";
  for (const run of runs) {
    if (!run.text) continue;
    const text = run.text.replaceAll(MARK, `${MARK}${MARK}`);
    const token = styleToken(run.style);
    out += token ? `${MARK}${token}${END}${text}${STOP}` : text;
  }
  return out;
}

export function plainText(stored: string): string {
  return readRuns(stored)
    .map((run) => run.text)
    .join("");
}

export function hasMarks(stored: string): boolean {
  return readRuns(stored).some((run) => styleToken(run.style) !== "");
}

function charStyles(stored: string): MarkStyle[] {
  const styles: MarkStyle[] = [];
  for (const run of readRuns(stored)) {
    for (let i = 0; i < run.text.length; i += 1) styles.push(run.style);
  }
  return styles;
}

function fromChars(plain: string, styles: readonly MarkStyle[]): string {
  const runs: TextRun[] = [];
  for (let i = 0; i < plain.length; i += 1) {
    const style = styles[i] ?? {};
    const last = runs[runs.length - 1];
    const letter = plain[i] ?? "";
    if (last && styleToken(last.style) === styleToken(style)) last.text += letter;
    else runs.push({ text: letter, style: { ...style } });
  }
  return writeRuns(runs);
}

function clamp(value: number, length: number): number {
  if (!Number.isInteger(value)) return 0;
  return Math.min(Math.max(value, 0), length);
}

export function plainChange(before: string, after: string): { from: number; removed: number; inserted: string } {
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return { from: prefix, removed: before.length - prefix - suffix, inserted: after.slice(prefix, after.length - suffix) };
}

export function editPlain(stored: string, nextPlain: string, pending?: { at: number; style: MarkStyle } | null): string {
  const plain = plainText(stored);
  if (plain === nextPlain) return stored;
  const styles = charStyles(stored);
  const change = plainChange(plain, nextPlain);
  let inherit: MarkStyle = {};
  if (pending && change.removed === 0 && pending.at === change.from) inherit = { ...pending.style };
  else if (change.removed > 0 && styles[change.from]) inherit = { ...styles[change.from] };
  else if (change.from > 0 && styles[change.from - 1]) inherit = { ...styles[change.from - 1] };
  else if (change.from === 0 && change.removed === 0 && styles.length > 0) {
    const first = styles[0];
    const color = first?.color ?? null;
    const highlight = first?.highlight ?? null;
    const uniform =
      (color !== null || highlight !== null) &&
      styles.every((style) => (style.color ?? null) === color && (style.highlight ?? null) === highlight);
    if (uniform) {
      if (color) inherit.color = color;
      if (highlight) inherit.highlight = highlight;
    }
  }
  const next = [
    ...styles.slice(0, change.from),
    ...Array.from(change.inserted, () => ({ ...inherit })),
    ...styles.slice(change.from + change.removed),
  ];
  return fromChars(nextPlain, next);
}

export function toggleStyle(stored: string, from: number, to: number, flag: StyleFlag): string {
  const plain = plainText(stored);
  const start = clamp(from, plain.length);
  const end = clamp(to, plain.length);
  if (end <= start) return stored;
  const styles = charStyles(stored);
  const clear = styles.slice(start, end).every((style) => Boolean(style[flag]));
  const next = styles.map((style, index) => {
    if (index < start || index >= end) return style;
    const copy: MarkStyle = { ...style };
    if (clear) delete copy[flag];
    else copy[flag] = true;
    return copy;
  });
  return fromChars(plain, next);
}

export function paintColor(stored: string, from: number, to: number, kind: "color" | "highlight", color: ToneColor | null): string {
  const plain = plainText(stored);
  const start = clamp(from, plain.length);
  const end = clamp(to, plain.length);
  if (end <= start) return stored;
  const styles = charStyles(stored);
  const next = styles.map((style, index) => {
    if (index < start || index >= end) return style;
    const copy: MarkStyle = { ...style };
    if (color) copy[kind] = color;
    else delete copy[kind];
    return copy;
  });
  return fromChars(plain, next);
}

export function styleBefore(stored: string, at: number): MarkStyle {
  const styles = charStyles(stored);
  const index = clamp(at, plainText(stored).length);
  if (index > 0 && styles[index - 1]) return { ...styles[index - 1] };
  return {};
}

export function selectionStyle(
  stored: string,
  from: number,
  to: number
): { bold: boolean; italic: boolean; underline: boolean; strike: boolean; color: ToneColor | null; highlight: ToneColor | null } {
  const plain = plainText(stored);
  const start = clamp(from, plain.length);
  const end = clamp(to, plain.length);
  const styles = charStyles(stored).slice(start, Math.max(end, start));
  const sample = styles.length > 0 ? styles : [styleBefore(stored, start)];
  function flag(key: StyleFlag): boolean {
    return sample.every((style) => Boolean(style[key]));
  }
  function tone(key: "color" | "highlight"): ToneColor | null {
    const first = sample[0]?.[key] ?? null;
    return sample.every((style) => (style[key] ?? null) === first) ? first : null;
  }
  return { bold: flag("bold"), italic: flag("italic"), underline: flag("underline"), strike: flag("strike"), color: tone("color"), highlight: tone("highlight") };
}

export function splitPlain(stored: string, at: number, end = at): { left: string; right: string } {
  const plain = plainText(stored);
  const start = clamp(at, plain.length);
  const stop = Math.max(start, clamp(end, plain.length));
  const styles = charStyles(stored);
  return {
    left: fromChars(plain.slice(0, start), styles.slice(0, start)),
    right: fromChars(plain.slice(stop), styles.slice(stop)),
  };
}

export function joinPlain(left: string, right: string): string {
  return fromChars(plainText(left) + plainText(right), [...charStyles(left), ...charStyles(right)]);
}

export function readRange(root: HTMLElement): { start: number; end: number } | null {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const measure = (container: Node, offset: number) => {
      const probe = document.createRange();
      probe.selectNodeContents(root);
      probe.setEnd(container, offset);
      return probe.toString().length;
    };
    return { start: measure(range.startContainer, range.startOffset), end: measure(range.endContainer, range.endOffset) };
  } catch {
    return null;
  }
}

export function writeRange(root: HTMLElement, start: number, end: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const from = pointAt(root, start);
  const to = pointAt(root, end);
  if (!from || !to) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (seen + len >= target) return { node, offset: target - seen };
    seen += len;
    node = walker.nextNode();
  }
  if (target === 0) return { node: root, offset: 0 };
  return null;
}
