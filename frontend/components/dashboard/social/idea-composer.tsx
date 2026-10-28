"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as PressEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, AudioLines, Bold, Check, ChevronLeft, ChevronRight, Columns2, Copy, ExternalLink, FileText, Film, GripVertical, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, LayoutGrid, Link2, List, ListChecks, ListOrdered, Minus, Paperclip, Presentation, Quote, Rows2, Strikethrough, Table2, Tag, Type, Underline, X } from "lucide-react";
import {
  NOTE_COLORS,
  editPlain,
  joinPlain,
  paintColor,
  plainChange,
  plainText,
  readRange,
  readRuns,
  selectionStyle,
  splitPlain,
  styleBefore,
  styleToken,
  toggleStyle,
  writeRange,
  namedColor,
  toneValue,
  type MarkStyle,
  type NoteColor,
  type StyleFlag,
  type ToneColor,
} from "./note-marks";

export const FILE_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".webm",
  ".m4v",
  ".3gp",
  ".avi",
  ".mkv",
  ".mp3",
  ".m4a",
  ".wav",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
].join(",");

type LineKind = "text" | "heading" | "list" | "bullet" | "number" | "quote" | "file" | "link" | "rule" | "cols" | "split" | "endcols";

/** The thought note, including file and link markers. */
export const NOTE_MAX = 4000;

const WRITING = new Set<LineKind>(["text", "heading", "list", "bullet", "number", "quote"]);

type HeadingLevel = 1 | 2 | 3;

type NoteLine = { kind: LineKind; body: string; done?: boolean; name?: string; embed?: boolean; width?: number; level?: HeadingLevel };

const HEADING_ICON = { 1: Heading1, 2: Heading2, 3: Heading3 } as const;

const HEADING_LOOK: Record<HeadingLevel, string> = {
  1: "min-h-8 text-2xl font-medium leading-8",
  2: "min-h-7 text-lg font-medium leading-7",
  3: "min-h-6 text-base font-medium leading-6",
};

function headingChoice(id: string): HeadingLevel | null {
  if (id === "heading1") return 1;
  if (id === "heading2") return 2;
  if (id === "heading3") return 3;
  return null;
}

function lineHeading(line: NoteLine | undefined): HeadingLevel {
  if (line?.level === 1 || line?.level === 3) return line.level;
  return 2;
}

/** Ten files for each kind: photo, video, audio, and document. */
export const SCRAP_CAP = 10;

export type PileKind = "photo" | "video" | "audio" | "document";

export function scrapKind(item: { video?: boolean; audio?: boolean; page?: boolean }): PileKind {
  if (item.video) return "video";
  if (item.audio) return "audio";
  if (item.page) return "document";
  return "photo";
}

export type FileFace = "sheet" | "slides" | "page";

const SHEET_EXT = new Set(["xls", "xlsx", "csv", "ods"]);
const SLIDES_EXT = new Set(["ppt", "pptx", "odp"]);
const SHEET_TYPE = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
const SLIDES_TYPE = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
]);
const PAGE_EXT = new Set(["pdf", "doc", "docx", "txt", "rtf", "odt"]);
const PAGE_TYPE = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
]);

export function fileFace(name: string, type = ""): FileFace | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (SHEET_EXT.has(ext) || SHEET_TYPE.has(type)) return "sheet";
  if (SLIDES_EXT.has(ext) || SLIDES_TYPE.has(type)) return "slides";
  if (PAGE_EXT.has(ext) || PAGE_TYPE.has(type)) return "page";
  return null;
}

export type FileOpen = "pdf" | "text" | "file";

export function fileOpen(name: string, type = ""): FileOpen | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "txt" || ext === "csv" || type === "text/plain" || type === "text/csv") return "text";
  if (fileFace(name, type)) return "file";
  return null;
}

export function fileOpenFromUrl(url: string): FileOpen | null {
  try {
    const path = new URL(url).pathname;
    if (/\.pdf$/i.test(path)) return "pdf";
    if (/\.(txt|csv)$/i.test(path)) return "text";
    if (/\.(docx?|pptx?|xlsx?|rtf|odt|ods|odp)$/i.test(path)) return "file";
    return null;
  } catch {
    return null;
  }
}

export type ShelfFile = {
  id: string;
  preview: string | null;
  name?: string | null;
  pending?: boolean;
  /** 0–100 while a file is still uploading. */
  progress?: number;
  failed?: boolean;
  video?: boolean;
  audio?: boolean;
  page?: boolean;
  face?: FileFace | null;
  openAs?: FileOpen | null;
  /** False keeps a picture or video as its filename. Omitted pictures stay embedded. */
  embed?: boolean;
  /** Picture width as a share of the block, 20–100. Omitted means natural size. */
  width?: number;
};

export function pictureWidth(value: number): number {
  return Math.min(100, Math.max(20, Math.round(value)));
}

function fileMarker(id: string, name?: string): { body: string; name?: string } {
  const clean = name?.trim().replace(/\s+/g, " ").slice(0, 180);
  return clean ? { body: id, name: clean } : { body: id };
}

function readFileMarker(rest: string): { body: string; name?: string; embed?: boolean; width?: number } {
  const gap = rest.indexOf(" ");
  if (gap <= 0) return { body: rest };
  const tokens = rest.slice(gap + 1).split(" ");
  const mode: { embed?: boolean; width?: number } = {};
  while (tokens.length > 0 && tokens[tokens.length - 1].startsWith("=")) {
    const flag = tokens.pop() as string;
    if (flag === "=name") mode.embed = false;
    else if (flag === "=embed") mode.embed = true;
    else {
      const sized = /^=w(\d{2,3})$/.exec(flag);
      if (sized) mode.width = pictureWidth(Number(sized[1]));
    }
  }
  const encoded = tokens.join(" ");
  if (!encoded) return { body: rest.slice(0, gap), ...mode };
  try {
    return { ...fileMarker(rest.slice(0, gap), decodeURIComponent(encoded)), ...mode };
  } catch {
    return { ...fileMarker(rest.slice(0, gap), encoded), ...mode };
  }
}

export function placeFile(note: string, id: string, line: number, name?: string): string {
  const lines = splitNote(note);
  if (lines.some((item) => item.kind === "file" && item.body === id)) return note;
  const at = Math.min(Math.max(line, 0), lines.length);
  const marker: NoteLine = { kind: "file", ...fileMarker(id, name) };
  if (lines[at]?.kind === "text" && lines[at].body === "") lines[at] = marker;
  else lines.splice(at + 1, 0, marker);
  const joined = joinNote(lines);
  return joined.length > NOTE_MAX ? note : joined;
}

export function nameFile(note: string, id: string, name?: string): string {
  const marked = fileMarker(id, name);
  if (!marked.name) return note;
  let changed = false;
  const lines = splitNote(note).map((line) => {
    if (line.kind !== "file" || line.body !== id || line.name) return line;
    changed = true;
    return { ...line, name: marked.name };
  });
  return changed ? joinNote(lines) : note;
}

export function swapFile(note: string, fromId: string, toId: string): string {
  let changed = false;
  const lines = splitNote(note).map((line) => {
    if (line.kind !== "file" || line.body !== fromId) return line;
    changed = true;
    return { ...line, body: toId };
  });
  return changed ? joinNote(lines) : note;
}

export function stripFile(note: string, id: string): string {
  const lines = splitNote(note).filter((line) => !(line.kind === "file" && line.body === id));
  return joinNote(lines.length > 0 ? lines : [{ kind: "text", body: "" }]);
}

const MENU = [
  { id: "heading1", label: "Heading 1", icon: Heading1 },
  { id: "heading2", label: "Heading 2", icon: Heading2 },
  { id: "heading3", label: "Heading 3", icon: Heading3 },
  { id: "bullet", label: "Bullet", icon: List },
  { id: "number", label: "Numbered", icon: ListOrdered },
  { id: "list", label: "To-do", icon: ListChecks },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "columns", label: "Columns", icon: Columns2 },
  { id: "rule", label: "Divider", icon: Minus },
  { id: "file", label: "File", icon: Paperclip },
] as const;

const TURN = [
  { id: "text", label: "Text", icon: Type },
  { id: "heading1", label: "Heading 1", icon: Heading1 },
  { id: "heading2", label: "Heading 2", icon: Heading2 },
  { id: "heading3", label: "Heading 3", icon: Heading3 },
  { id: "bullet", label: "Bullet", icon: List },
  { id: "number", label: "Numbered", icon: ListOrdered },
  { id: "list", label: "To-do", icon: ListChecks },
  { id: "quote", label: "Quote", icon: Quote },
] as const;

const LINE_DRAG = "application/x-clariva-line";
export const LIFT_DRAG = "application/x-clariva-lift";

function parseLine(line: string): NoteLine {
  if (line === "!cols" || line.startsWith("!cols ")) {
    const ratio = Number(line.slice(5).trim());
    const body = Number.isInteger(ratio) && ratio >= 20 && ratio <= 80 ? String(ratio) : "";
    return { kind: "cols", body };
  }
  if (line === "!|") return { kind: "split", body: "" };
  if (line === "!/") return { kind: "endcols", body: "" };
  if (line === "!hr") return { kind: "rule", body: "" };
  if (line.startsWith("!file:")) return { kind: "file", ...readFileMarker(line.slice(6)) };
  if (line.startsWith("!link:")) return { kind: "link", body: line.slice(6) };
  if (line === "#1" || line.startsWith("#1 ")) return { kind: "heading", level: 1, body: line.startsWith("#1 ") ? line.slice(3) : "" };
  if (line === "#3" || line.startsWith("#3 ")) return { kind: "heading", level: 3, body: line.startsWith("#3 ") ? line.slice(3) : "" };
  if (line === "#" || line.startsWith("# ")) return { kind: "heading", level: 2, body: line.startsWith("# ") ? line.slice(2) : "" };
  if (line.startsWith("- [x] ") || line === "- [x]") return { kind: "list", body: line.slice(6), done: true };
  if (line.startsWith("- [ ] ") || line === "- [ ]") return { kind: "list", body: line.slice(6), done: false };
  if (line.startsWith("- ")) return { kind: "list", body: line.slice(2), done: false };
  if (line.startsWith("* ")) return { kind: "bullet", body: line.slice(2) };
  if (line === "*") return { kind: "bullet", body: "" };
  if (line.startsWith("> ")) return { kind: "quote", body: line.slice(2) };
  if (line === ">") return { kind: "quote", body: "" };
  const numbered = /^(\d+)\.(?: (.*))?$/.exec(line);
  if (numbered) return { kind: "number", body: numbered[2] ?? "" };
  return { kind: "text", body: line };
}

export function splitNote(value: string): NoteLine[] {
  const raw = value.split("\n");
  const lines = raw.length > 0 ? raw : [""];
  return lines.map(parseLine);
}

export type ResourceLink = { id: string; url: string };

function hostWithPort(value: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme || /^https?:\/\//i.test(value)) return false;
  const name = scheme[1];
  const rest = value.slice(scheme[0].length);
  return name.includes(".") || /^\d/.test(rest);
}

export function normalizeLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed) && !hostWithPort(trimmed)) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!host || (host !== "localhost" && !host.includes("."))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const LINK_IN_TEXT =
  /https?:\/\/[^\s<>"']+|localhost:\d+(?:\/[^\s<>"']*)?|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

export function normalizeLinks(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const whole = normalizeLink(trimmed);
  if (whole) return [whole];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of trimmed.matchAll(LINK_IN_TEXT)) {
    const url = normalizeLink(match[0].replace(/[),.;!?]+$/g, ""));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push(url);
  }
  return found;
}

export function linkSpans(value: string): Array<{ text: string; url: string | null; from: number; to: number }> {
  const spans: Array<{ text: string; url: string | null; from: number; to: number }> = [];
  let last = 0;
  for (const match of value.matchAll(LINK_IN_TEXT)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start < last) continue;
    const trimmed = raw.replace(/[),.;!?]+$/g, "");
    const url = normalizeLink(trimmed);
    if (!url) continue;
    if (start > last) spans.push({ text: value.slice(last, start), url: null, from: last, to: start });
    const end = start + trimmed.length;
    spans.push({ text: value.slice(start, end), url, from: start, to: end });
    last = end;
  }
  if (last < value.length || spans.length === 0) {
    spans.push({ text: value.slice(last), url: null, from: last, to: value.length });
  }
  return spans;
}

export function linksInNote(note: string, known: readonly ResourceLink[] = []): ResourceLink[] {
  const found: string[] = [];
  const seen = new Set<string>();
  function add(url: string | null): void {
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push(url);
  }
  for (const line of splitNote(note)) {
    if (line.kind === "link") {
      const knownUrl = known.find((item) => item.id === line.body)?.url ?? null;
      add(knownUrl ?? normalizeLink(line.body));
      continue;
    }
    if (!WRITING.has(line.kind)) continue;
    for (const url of normalizeLinks(plainText(line.body))) add(url);
  }
  return found.map((url) => known.find((item) => item.url === url) ?? { id: `url:${url}`, url });
}

export function forgetLink(note: string, item: { id: string; url: string }): string {
  const lines = splitNote(note).flatMap((line) => {
    if (line.kind === "link" && (line.body === item.id || line.body === item.url)) return [];
    if (!WRITING.has(line.kind)) return [line];
    const plain = linkSpans(plainText(line.body))
      .filter((span) => span.url !== item.url)
      .map((span) => span.text)
      .join("")
      .replace(/[^\S\n]{2,}/g, " ")
      .trim();
    return [{ ...line, body: editPlain(line.body, plain) }];
  });
  return joinNote(lines.length > 0 ? lines : [{ kind: "text", body: "" }]);
}

export function linkHost(url: string): string {
  return linkMark(url).host;
}

function shortSegment(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function linkMark(url: string): { host: string; detail: string | null } {
  try {
    const parsed = new URL(url);
    const host = parsed.host.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean).map(shortSegment);
    if (parts.length === 0 && !parsed.search) return { host, detail: null };
    let detail = parts.length > 0 ? `/${parts.join("/")}` : "";
    if (detail.length > 32 && parts.length > 1) detail = `/${parts[parts.length - 1]}`;
    if (parsed.search && detail.length < 24) {
      const query = parsed.search.length > 18 ? `${parsed.search.slice(0, 14)}…` : parsed.search;
      detail += query;
    }
    return { host, detail: detail || null };
  } catch {
    return { host: "Link", detail: null };
  }
}

export function placeLink(note: string, id: string, line: number): string {
  if (note.includes(`!link:${id}`)) return note;
  const lines = splitNote(note);
  const at = Math.min(Math.max(line, 0), lines.length);
  const marker: NoteLine = { kind: "link", body: id };
  if (lines[at]?.kind === "text" && lines[at].body === "") lines[at] = marker;
  else lines.splice(at + 1, 0, marker);
  const joined = joinNote(lines);
  return joined.length > NOTE_MAX ? note : joined;
}

export function stripLink(note: string, id: string): string {
  const lines = splitNote(note).filter((line) => !(line.kind === "link" && line.body === id));
  return joinNote(lines.length > 0 ? lines : [{ kind: "text", body: "" }]);
}

function isContent(line: NoteLine | undefined): boolean {
  return Boolean(line && line.kind !== "cols" && line.kind !== "split" && line.kind !== "endcols");
}

function insideColumns(lines: readonly NoteLine[], index: number): boolean {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (lines[i]?.kind === "cols") depth += 1;
    else if (lines[i]?.kind === "endcols") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/** The `!cols` … `!/` block that holds `index`, or null when the line sits outside columns. */
function columnBlock(lines: readonly NoteLine[], index: number): { at: number; end: number } | null {
  let at = -1;
  for (let i = index; i >= 0; i -= 1) {
    const kind = lines[i]?.kind;
    if (kind === "cols") {
      at = i;
      break;
    }
    if (kind === "endcols" && i !== index) return null;
  }
  if (at < 0) return null;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (lines[i]?.kind === "endcols") {
      end = i;
      break;
    }
  }
  return { at, end };
}

/** Lines of a columns block as one flow: left side first, then the right side. */
function unstackColumns(lines: readonly NoteLine[], at: number, end: number, skip?: number): NoteLine[] {
  const inside = lines.slice(at + 1, end).filter((line, offset) => isContent(line) && at + 1 + offset !== skip);
  const next = [...lines.slice(0, at), ...inside, ...lines.slice(Math.min(end + 1, lines.length))];
  return next.some(isContent) ? next : [{ kind: "text", body: "" }];
}

function blankLine(): NoteLine {
  return { kind: "text", body: "" };
}

function splitOf(lines: readonly NoteLine[], block: { at: number; end: number }): number {
  for (let i = block.at + 1; i < block.end; i += 1) {
    if (lines[i]?.kind === "split") return i;
  }
  return -1;
}

function contentBetween(
  lines: readonly NoteLine[],
  start: number,
  end: number,
  skipLow = -1,
  skipHigh = -1
): NoteLine[] {
  const out: NoteLine[] = [];
  for (let i = start; i < end; i += 1) {
    if (skipLow >= 0 && i >= skipLow && i <= skipHigh) continue;
    const line = lines[i];
    if (isContent(line)) out.push(line);
  }
  return out;
}

/** A run of blocks that can move together. Null when the selection crosses a column edge. */
function selectionRun(
  lines: readonly NoteLine[],
  index: number,
  span: { anchor: number; focus: number } | null
): { low: number; high: number } | null {
  const covered = span !== null && index >= Math.min(span.anchor, span.focus) && index <= Math.max(span.anchor, span.focus);
  const low = covered && span ? Math.min(span.anchor, span.focus) : index;
  const high = covered && span ? Math.max(span.anchor, span.focus) : index;
  if (low < 0 || high >= lines.length) return null;
  for (let i = low; i <= high; i += 1) {
    if (!isContent(lines[i])) return null;
  }
  const home = columnBlock(lines, low);
  if (home) {
    const other = columnBlock(lines, high);
    if (!other || other.at !== home.at) return null;
    const split = splitOf(lines, home);
    if (split >= 0 && low <= split && high >= split) return null;
  }
  return { low, high };
}

function columnMoves(
  lines: readonly NoteLine[],
  index: number,
  span: { anchor: number; focus: number } | null
): { left: boolean; right: boolean; out: boolean } {
  const run = selectionRun(lines, index, span);
  if (!run) return { left: false, right: false, out: false };
  const home = columnBlock(lines, run.low);
  if (!home) return { left: true, right: true, out: false };
  const split = splitOf(lines, home);
  if (split < 0) return { left: false, right: false, out: false };
  const onRight = run.low > split;
  return { left: onRight, right: !onRight, out: true };
}

function rebuildColumns(
  lines: readonly NoteLine[],
  block: { at: number; end: number },
  left: NoteLine[],
  right: NoteLine[],
  after: NoteLine[] = []
): NoteLine[] | null {
  const split = splitOf(lines, block);
  if (split < 0 || lines[block.at]?.kind !== "cols") return null;
  const leftLines = left.length > 0 ? left : [blankLine()];
  const rightLines = right.length > 0 ? right : [blankLine()];
  const endLine = lines[block.end]?.kind === "endcols" ? [lines[block.end]] : [];
  return [
    ...lines.slice(0, block.at),
    lines[block.at],
    ...leftLines,
    lines[split],
    ...rightLines,
    ...endLine,
    ...after,
    ...lines.slice(block.end + endLine.length),
  ];
}

function movedLanding(at: number, left: NoteLine[], right: NoteLine[], side: "left" | "right", count: number): number {
  const leftCount = Math.max(left.length, 1);
  const rightCount = Math.max(right.length, 1);
  if (side === "left") return at + 1 + leftCount - count;
  return at + 1 + leftCount + 1 + rightCount - count;
}

function shiftedColumns(
  lines: readonly NoteLine[],
  run: { low: number; high: number },
  side: "left" | "right"
): { next: NoteLine[]; landing: number } | null {
  const home = columnBlock(lines, run.low);
  if (!home) return null;
  const split = splitOf(lines, home);
  if (split < 0) return null;
  const moving = lines.slice(run.low, run.high + 1);
  const leftKept = contentBetween(lines, home.at + 1, split, run.low, run.high);
  const rightKept = contentBetween(lines, split + 1, home.end, run.low, run.high);
  const left = side === "left" ? [...leftKept, ...moving] : leftKept;
  const right = side === "right" ? [...rightKept, ...moving] : rightKept;
  const next = rebuildColumns(lines, home, left, right);
  if (!next) return null;
  return { next, landing: movedLanding(home.at, left, right, side, moving.length) };
}

function liftedOut(
  lines: readonly NoteLine[],
  run: { low: number; high: number }
): { next: NoteLine[]; landing: number } | null {
  const home = columnBlock(lines, run.low);
  if (!home) return null;
  const split = splitOf(lines, home);
  if (split < 0) return null;
  const moving = lines.slice(run.low, run.high + 1);
  const left = contentBetween(lines, home.at + 1, split, run.low, run.high);
  const right = contentBetween(lines, split + 1, home.end, run.low, run.high);
  const next = rebuildColumns(lines, home, left, right, moving);
  if (!next) return null;
  const landing = home.at + 1 + Math.max(left.length, 1) + 1 + Math.max(right.length, 1) + 1;
  return { next, landing };
}

function adjacentPair(lines: readonly NoteLine[], run: { low: number; high: number }): { at: number; end: number } | null {
  if (lines[run.low - 1]?.kind === "endcols") return columnBlock(lines, run.low - 1);
  if (lines[run.high + 1]?.kind === "cols") return columnBlock(lines, run.high + 1);
  return null;
}

function joinedColumns(
  lines: readonly NoteLine[],
  run: { low: number; high: number },
  target: { at: number; end: number },
  side: "left" | "right"
): { next: NoteLine[]; landing: number } | null {
  const split = splitOf(lines, target);
  if (split < 0) return null;
  const moving = lines.slice(run.low, run.high + 1);
  const without = [...lines.slice(0, run.low), ...lines.slice(run.high + 1)];
  const shift = run.high < target.at ? moving.length : 0;
  const block = { at: target.at - shift, end: target.end - shift };
  const leftKept = contentBetween(lines, target.at + 1, split);
  const rightKept = contentBetween(lines, split + 1, target.end);
  const left = side === "left" ? [...leftKept, ...moving] : leftKept;
  const right = side === "right" ? [...rightKept, ...moving] : rightKept;
  const next = rebuildColumns(without, block, left, right);
  if (!next) return null;
  return { next, landing: movedLanding(block.at, left, right, side, moving.length) };
}

function createdColumns(
  lines: readonly NoteLine[],
  run: { low: number; high: number },
  side: "left" | "right"
): { next: NoteLine[]; focus: number } {
  const moving = lines.slice(run.low, run.high + 1);
  const next = [
    ...lines.slice(0, run.low),
    { kind: "cols" as const, body: "" },
    ...(side === "left" ? moving : [blankLine()]),
    { kind: "split" as const, body: "" },
    ...(side === "right" ? moving : [blankLine()]),
    { kind: "endcols" as const, body: "" },
    ...lines.slice(run.high + 1),
  ];
  const focus = side === "left" ? run.low + 1 + moving.length + 1 : run.low + 1;
  return { next, focus };
}

function columnSide(lines: readonly NoteLine[], index: number): number[] | null {
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    if (lines[i]?.kind === "endcols") return null;
    if (lines[i]?.kind === "cols" || lines[i]?.kind === "split") {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const side: number[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const kind = lines[i]?.kind;
    if (kind === "split" || kind === "endcols" || kind === "cols") break;
    side.push(i);
  }
  return side;
}

type NoteSegment =
  | { type: "line"; index: number }
  | { type: "columns"; at: number; left: number[]; right: number[]; split: number; end: number };

function columnRatio(body: string | undefined): number {
  if (!body) return 50;
  const value = Number(body);
  if (!Number.isInteger(value)) return 50;
  return Math.min(80, Math.max(20, value));
}

function noteSegments(lines: readonly NoteLine[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.kind === "cols") {
      const left: number[] = [];
      const right: number[] = [];
      let side = left;
      let split = -1;
      const at = i;
      i += 1;
      while (i < lines.length && lines[i]?.kind !== "endcols") {
        if (lines[i]?.kind === "split") {
          side = right;
          split = i;
        } else if (isContent(lines[i])) side.push(i);
        i += 1;
      }
      const end = i;
      if (lines[i]?.kind === "endcols") i += 1;
      out.push({ type: "columns", at, left, right, split: split < 0 ? end : split, end });
    } else if (lines[i]?.kind === "split" || lines[i]?.kind === "endcols") {
      i += 1;
    } else {
      out.push({ type: "line", index: i });
      i += 1;
    }
  }
  return out;
}

export function noteNumber(lines: readonly NoteLine[], index: number): number {
  let count = 0;
  for (let i = 0; i <= index; i += 1) {
    if (lines[i]?.kind === "number") count += 1;
    else count = 0;
  }
  return count;
}

export function joinNote(lines: readonly NoteLine[]): string {
  let count = 0;
  return lines
    .map((line) => {
      if (line.kind !== "number") count = 0;
      if (line.kind === "file") {
        const parts: string[] = [];
        if (line.name) parts.push(encodeURIComponent(line.name));
        if (line.embed === false) parts.push("=name");
        if (line.width !== undefined) parts.push(`=w${pictureWidth(line.width)}`);
        return parts.length > 0 ? `!file:${line.body} ${parts.join(" ")}` : `!file:${line.body}`;
      }
      if (line.kind === "link") return `!link:${line.body}`;
      if (line.kind === "heading") {
        const level = line.level === 1 || line.level === 3 ? line.level : 2;
        if (level === 1) return `#1 ${line.body}`;
        if (level === 3) return `#3 ${line.body}`;
        return `# ${line.body}`;
      }
      if (line.kind === "list") return line.done ? `- [x] ${line.body}` : `- [ ] ${line.body}`;
      if (line.kind === "bullet") return line.body ? `* ${line.body}` : "*";
      if (line.kind === "quote") return line.body ? `> ${line.body}` : ">";
      if (line.kind === "number") {
        count += 1;
        return line.body ? `${count}. ${line.body}` : `${count}.`;
      }
      if (line.kind === "rule") return "!hr";
      if (line.kind === "cols") return line.body ? `!cols ${line.body}` : "!cols";
      if (line.kind === "split") return "!|";
      if (line.kind === "endcols") return "!/";
      return line.body;
    })
    .join("\n");
}

export const RESOURCE_DRAG = "application/x-clariva-resource";

function hasResourceDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(RESOURCE_DRAG);
}

export function readResourceDrag(event: DragEvent<HTMLElement>): { kind: "file" | "link"; id: string } | null {
  try {
    const parsed = JSON.parse(event.dataTransfer.getData(RESOURCE_DRAG)) as { kind?: string; id?: string };
    if ((parsed.kind === "file" || parsed.kind === "link") && typeof parsed.id === "string" && parsed.id) {
      return { kind: parsed.kind, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

function hasLineDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes(LINE_DRAG);
}

function lineUnder(event: DragEvent<HTMLElement>, count: number): number {
  const target = event.target;
  if (target instanceof Element) {
    const row = target.closest("[data-note-line]");
    const index = Number(row?.getAttribute("data-note-line"));
    if (Number.isInteger(index) && index >= 0) return index;
  }
  return Math.max(count - 1, 0);
}

function hasFileDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function nearestWriting(lines: readonly NoteLine[], index: number, step: -1 | 1): number | null {
  for (let i = index + step; i >= 0 && i < lines.length; i += step) {
    const kind = lines[i]?.kind;
    if (kind && WRITING.has(kind)) return i;
  }
  return null;
}

function lineIndex(node: Element | null): number | null {
  const row = node?.closest("[data-note-line]");
  if (!row) return null;
  const index = Number(row.getAttribute("data-note-line"));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function rangeOf(span: { anchor: number; focus: number }): { low: number; high: number } {
  return { low: Math.min(span.anchor, span.focus), high: Math.max(span.anchor, span.focus) };
}

function coversBlock(node: HTMLElement): boolean {
  const text = node instanceof HTMLTextAreaElement ? node.value : (node.textContent ?? "");
  if (text.length === 0) return true;
  if (node instanceof HTMLTextAreaElement) return node.selectionStart === 0 && node.selectionEnd === text.length;
  const range = readRange(node);
  return range !== null && range.start === 0 && range.end === text.length;
}

function selectAllKey(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; key: string; code: string }): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && (event.code === "KeyA" || event.key.toLowerCase() === "a");
}

const COLOR_TEXT: Record<NoteColor, string> = {
  gray: "text-neutral-600",
  brown: "text-amber-950",
  orange: "text-orange-800",
  yellow: "text-yellow-800",
  green: "text-green-800",
  blue: "text-primary",
  purple: "text-purple-800",
  pink: "text-pink-800",
  red: "text-red-700",
};

const COLOR_BG: Record<NoteColor, string> = {
  gray: "bg-neutral-200",
  brown: "bg-amber-100",
  orange: "bg-orange-100",
  yellow: "bg-yellow-100",
  green: "bg-green-100",
  blue: "bg-primary/15",
  purple: "bg-purple-100",
  pink: "bg-pink-100",
  red: "bg-red-100",
};

const TEXT_HEX: Record<NoteColor, string> = {
  gray: "#525252",
  brown: "#78350f",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#15803d",
  blue: "#1E56E0",
  purple: "#7e22ce",
  pink: "#be185d",
  red: "#b91c1c",
};

const WASH_HEX: Record<NoteColor, string> = {
  gray: "#e5e5e5",
  brown: "#f5e6d3",
  orange: "#ffedd5",
  yellow: "#fef9c3",
  green: "#dcfce7",
  blue: "#dbe6fb",
  purple: "#f3e8ff",
  pink: "#fce7f3",
  red: "#fee2e2",
};

function swatchFill(value: ToneColor | null, kind: "color" | "highlight"): string {
  if (!value) return kind === "color" ? "#000000" : "#ffffff";
  if (!namedColor(value)) return value;
  return kind === "color" ? TEXT_HEX[value] : WASH_HEX[value];
}

const MENU_GAP = 4;
const MENU_MARGIN = 8;

export function placeOnScreen(
  anchor: { top: number; left: number; right: number; bottom: number; width: number; height: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  side: "below" | "above" | "right" | "start" | "end"
): { top: number; left: number; maxHeight: number } {
  const spaceBelow = viewport.height - anchor.bottom - MENU_GAP - MENU_MARGIN;
  const spaceAbove = anchor.top - MENU_GAP - MENU_MARGIN;
  const spaceRight = viewport.width - anchor.right - MENU_GAP - MENU_MARGIN;
  const spaceLeft = anchor.left - MENU_GAP - MENU_MARGIN;
  let top = anchor.bottom + MENU_GAP;
  let left = anchor.left;
  let maxHeight = Math.max(96, viewport.height - MENU_MARGIN * 2);
  if (side === "right") {
    const openLeft = spaceRight < menu.width && spaceLeft > spaceRight;
    left = openLeft ? anchor.left - MENU_GAP - menu.width : anchor.right + MENU_GAP;
    top = anchor.top;
    if (top + menu.height > viewport.height - MENU_MARGIN) {
      top = Math.max(MENU_MARGIN, viewport.height - MENU_MARGIN - Math.min(menu.height, viewport.height - MENU_MARGIN * 2));
    }
    if (top < MENU_MARGIN) top = MENU_MARGIN;
    maxHeight = Math.max(96, viewport.height - MENU_MARGIN - top);
  } else if (side === "start") {
    top = anchor.top;
    left = anchor.left + anchor.width / 2 - menu.width / 2;
    if (top + menu.height > viewport.height - MENU_MARGIN) {
      top = Math.max(MENU_MARGIN, viewport.height - MENU_MARGIN - Math.min(menu.height, viewport.height - MENU_MARGIN * 2));
    }
    if (top < MENU_MARGIN) top = MENU_MARGIN;
    maxHeight = Math.max(96, viewport.height - MENU_MARGIN - top);
  } else {
    const fitsBelow = spaceBelow >= menu.height;
    const fitsAbove = spaceAbove >= menu.height;
    let openUp = side === "above";
    if (openUp && !fitsAbove && (fitsBelow || spaceBelow > spaceAbove)) openUp = false;
    if (!openUp && !fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) openUp = true;
    maxHeight = Math.max(96, openUp ? spaceAbove : spaceBelow);
    const used = Math.min(menu.height, maxHeight);
    top = openUp ? Math.max(MENU_MARGIN, anchor.top - MENU_GAP - used) : anchor.bottom + MENU_GAP;
    if (side === "end") left = anchor.right - menu.width;
  }
  if (left + menu.width > viewport.width - MENU_MARGIN) left = Math.max(MENU_MARGIN, viewport.width - menu.width - MENU_MARGIN);
  if (left < MENU_MARGIN) left = MENU_MARGIN;
  if (top < MENU_MARGIN) top = MENU_MARGIN;
  return { top, left, maxHeight };
}

function ScreenMenu({
  anchor,
  label,
  role,
  side = "below",
  className,
  holdFocus = false,
  shield = true,
  slash = false,
  children,
}: {
  anchor: HTMLElement | null;
  label?: string;
  role?: "menu" | "toolbar";
  side?: "below" | "above" | "right" | "start" | "end";
  className: string;
  holdFocus?: boolean;
  shield?: boolean;
  slash?: boolean;
  children: React.ReactNode;
}): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    function placeMenu(): void {
      if (!anchor || !menu) return;
      const box = anchor.getBoundingClientRect();
      const next = placeOnScreen(
        { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
        { width: menu.offsetWidth, height: menu.scrollHeight },
        { width: window.innerWidth, height: window.innerHeight },
        side
      );
      setPlace((current) =>
        current && current.top === next.top && current.left === next.left && current.maxHeight === next.maxHeight ? current : next
      );
    }
    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [anchor, side]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      role={role}
      aria-label={label}
      data-turn-menu={shield ? "" : undefined}
      data-slash-menu={slash ? "" : undefined}
      onMouseDown={holdFocus ? (event) => event.preventDefault() : undefined}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0, maxHeight: place?.maxHeight, visibility: place ? "visible" : "hidden" }}
      className={`fixed z-[80] overflow-y-auto ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}

function TonePanel({
  kind,
  value,
  onPick,
}: {
  kind: "color" | "highlight";
  value: ToneColor | null;
  onPick: (value: ToneColor | null) => void;
}): JSX.Element {
  const noun = kind === "color" ? "text" : "highlight";
  const picker = value ? swatchFill(value, "color") : "#111111";
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          role="menuitem"
          aria-label={`Default ${noun}`}
          aria-current={value === null ? "true" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(null)}
          className={`inline-flex h-7 w-7 items-center justify-center rounded ${value === null ? "bg-muted ring-1 ring-foreground" : "hover:bg-muted"}`}
        >
          <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: swatchFill(null, kind) }} />
        </button>
        {NOTE_COLORS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            aria-label={`${item.label} ${noun}`}
            aria-current={value === item.id ? "true" : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item.id)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded ${value === item.id ? "bg-muted ring-1 ring-foreground" : "hover:bg-muted"}`}
          >
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: swatchFill(item.id, kind) }} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-sm text-foreground">Any color</span>
        <input
          type="color"
          aria-label={`Any ${noun} color`}
          value={picker}
          onChange={(event) => {
            const next = toneValue(event.target.value);
            if (next) onPick(next);
          }}
          className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
        />
      </div>
    </div>
  );
}

function ToneRow({
  label,
  menuLabel,
  swatch,
  open,
  onOpen,
  children,
}: {
  label: string;
  menuLabel: string;
  swatch: string;
  open: boolean;
  onOpen: () => void;
  children: JSX.Element;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        role="menuitem"
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpen}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
      >
        <span className="h-3.5 w-3.5 rounded-full border border-border" style={{ backgroundColor: swatch }} />
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? (
        <ScreenMenu anchor={anchor.current} label={menuLabel} role="menu" side="right" className="w-44 rounded-lg border border-border bg-card p-2 shadow-lg">
          {children}
        </ScreenMenu>
      ) : null}
    </>
  );
}

function paintInserted(
  stored: string,
  before: string,
  typed: string,
  tone: { color?: ToneColor | null; highlight?: ToneColor | null } | null
): string {
  if (!tone) return stored;
  const change = plainChange(before, typed);
  if (change.removed !== 0 || change.inserted.length === 0) return stored;
  const end = change.from + change.inserted.length;
  let body = stored;
  if (tone.color !== undefined) body = paintColor(body, change.from, end, "color", tone.color);
  if (tone.highlight !== undefined) body = paintColor(body, change.from, end, "highlight", tone.highlight);
  return body;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markClass(style: MarkStyle): string {
  return [
    style.bold ? "font-semibold" : "",
    style.italic ? "italic" : "",
    style.underline ? "underline" : "",
    style.strike ? "line-through" : "",
    style.color && namedColor(style.color) ? COLOR_TEXT[style.color] : "",
    style.highlight ? "rounded-sm" : "",
    style.highlight && namedColor(style.highlight) ? COLOR_BG[style.highlight] : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function markCss(style: MarkStyle): string {
  const bits: string[] = [];
  if (style.color && !namedColor(style.color)) bits.push(`color:${style.color}`);
  if (style.highlight && !namedColor(style.highlight)) bits.push(`background-color:${style.highlight}`);
  return bits.join(";");
}

function lineHtml(stored: string, linksClickable: boolean): string {
  const plain = plainText(stored);
  if (!plain) return "";
  const styles: MarkStyle[] = [];
  for (const run of readRuns(stored)) {
    for (let i = 0; i < run.text.length; i += 1) styles.push(run.style);
  }
  let html = "";
  for (const span of linkSpans(plain)) {
    let inner = "";
    let cursor = span.from;
    while (cursor < span.to) {
      const style = styles[cursor] ?? {};
      const token = styleToken(span.url ? { ...style, color: undefined } : style);
      let end = cursor + 1;
      while (end < span.to && styleToken(styles[end] ?? {}) === styleToken(style)) end += 1;
      const text = escapeHtml(plain.slice(cursor, end));
      const shownStyle = span.url ? { ...style, color: undefined } : style;
      const look = markClass(shownStyle);
      const css = markCss(shownStyle);
      if (token || look || css) inner += `<span data-mark="${token}" class="${look}"${css ? ` style="${css}"` : ""}>${text}</span>`;
      else inner += text;
      cursor = end;
    }
    if (span.url && linksClickable) {
      html += `<button type="button" data-note-link="" data-from="${span.from}" data-to="${span.to}" class="pointer-events-auto inline cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-primary hover:underline">${inner}</button>`;
    } else if (span.url) html += `<span class="text-primary">${inner}</span>`;
    else html += inner;
  }
  return html;
}

function LineEditor({
  html,
  label,
  placeholder,
  className,
  onPlain,
  onKeyDown,
  onFocus,
  onBlur,
  onSelect,
  onLink,
  inputRef,
  style,
}: {
  html: string;
  label?: string;
  placeholder: string;
  className: string;
  onPlain: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSelect: (node: HTMLDivElement) => void;
  onLink: (event: React.MouseEvent<HTMLDivElement>, from: number, to: number, url: string) => void;
  inputRef: (node: HTMLDivElement | null) => void;
  style?: CSSProperties;
}): JSX.Element {
  const nodeRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || composing.current) return;
    if (node.dataset.drawn === html) return;
    const active = document.activeElement === node;
    const range = active ? readRange(node) : null;
    node.innerHTML = html;
    node.dataset.drawn = html;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    if (caret !== null) writeRange(node, caret, caret);
    else if (range) writeRange(node, range.start, range.end);
  }, [html]);
  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        inputRef(node);
      }}
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      tabIndex={0}
      data-placeholder={placeholder || undefined}
      onInput={() => {
        if (composing.current) return;
        const node = nodeRef.current;
        if (!node) return;
        onPlain((node.textContent ?? "").replace(/\r/g, "").replace(/\u00a0/g, " "));
      }}
      onPaste={(event) => {
        event.preventDefault();
        const node = nodeRef.current;
        if (!node) return;
        const clip = event.clipboardData.getData("text/plain").replace(/\r/g, "");
        const current = (node.textContent ?? "").replace(/\u00a0/g, " ");
        const range = readRange(node) ?? { start: current.length, end: current.length };
        pendingCaret.current = range.start + clip.length;
        onPlain(`${current.slice(0, range.start)}${clip}${current.slice(range.end)}`);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        const node = nodeRef.current;
        if (!node) return;
        onPlain((node.textContent ?? "").replace(/\r/g, "").replace(/\u00a0/g, " "));
      }}
      onFocus={() => {
        const node = nodeRef.current;
        if (node && node.textContent === "" && node.querySelector("br")) {
          node.innerHTML = "";
          node.dataset.drawn = "";
        }
        onFocus();
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onMouseUp={() => {
        const node = nodeRef.current;
        if (node) onSelect(node);
      }}
      onKeyUp={() => {
        const node = nodeRef.current;
        if (node) onSelect(node);
      }}
      onMouseDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-note-link]")) event.preventDefault();
      }}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("[data-note-link]");
        if (!(link instanceof HTMLElement)) return;
        onLink(event, Number(link.dataset.from), Number(link.dataset.to), link.textContent ?? "");
      }}
      className={`w-full max-w-full min-w-0 whitespace-pre-wrap break-words bg-transparent outline-none empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)] ${className}`}
      style={style}
    />
  );
}

export function IdeaNote({
  value,
  onChange,
  onPhoto,
  onLine,
  onDropResource,
  onDropFiles,
  files = [],
  links = [],
  focusRequest = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  onPhoto: (line: number) => void;
  onLine?: (line: number) => void;
  onDropResource?: (kind: "file" | "link", id: string, line: number) => void;
  onDropFiles?: (files: File[], line: number) => void;
  files?: readonly ShelfFile[];
  links?: readonly ResourceLink[];
  focusRequest?: number;
}): JSX.Element {
  const lines = splitNote(value);
  const inputs = useRef<Array<HTMLElement | null>>([]);
  const ink = useRef<{ index: number; at: number; style: MarkStyle } | null>(null);
  const blockTone = useRef<{ index: number; color?: ToneColor | null; highlight?: ToneColor | null } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const lineAnchors = useRef<Array<HTMLElement | null>>([]);
  const turnAnchors = useRef<Array<HTMLElement | null>>([]);
  const textAnchors = useRef<Array<HTMLElement | null>>([]);
  const dragEnd = useRef<(() => void) | null>(null);
  const pickedActions = useRef({
    selectAll: () => undefined as void,
    dropSpan: (_text: string | null) => undefined as void,
    copySpan: () => undefined as void,
    focusAt: (_index: number) => undefined as void,
  });
  const turnOpen = useRef(false);
  const linkOpen = useRef(false);
  const [span, setSpan] = useState<{ anchor: number; focus: number } | null>(null);
  const [columnDrag, setColumnDrag] = useState<{ at: number; ratio: number } | null>(null);
  const [turnAt, setTurnAt] = useState<number | null>(null);
  const [tonePanel, setTonePanel] = useState<"color" | "highlight" | null>(null);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const [formatAt, setFormatAt] = useState<{ index: number; start: number; end: number } | null>(null);
  const [, setInkRev] = useState(0);
  const [openLink, setOpenLink] = useState<{
    line: number;
    url: string;
    from: number;
    to: number;
    top: number;
    left: number;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  turnOpen.current = turnAt !== null;
  linkOpen.current = openLink !== null;
  const [slashQuery, setSlashQuery] = useState("");
  const [active, setActive] = useState(0);
  const [overLine, setOverLine] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const needle = slashQuery.trim().toLowerCase();
  const choices = MENU.filter((item) => {
    if (item.id === "columns" && (menuAt === null || insideColumns(lines, menuAt))) return false;
    return needle.length === 0 || item.label.toLowerCase().includes(needle);
  });

  useLayoutEffect(() => {
    for (const node of inputs.current) {
      if (!(node instanceof HTMLTextAreaElement)) continue;
      node.style.height = "0px";
      node.style.height = `${node.scrollHeight}px`;
    }
  }, [value, slashQuery, menuAt]);

  function write(next: NoteLine[]): void {
    const joined = joinNote(next);
    if (joined.length > NOTE_MAX) {
      setFull(true);
      return;
    }
    setFull(false);
    onChange(joined);
  }

  function focusLine(index: number, caret?: number): void {
    window.setTimeout(() => {
      const node = inputs.current[index];
      if (!node) return;
      node.focus();
      if (caret === undefined) return;
      const length = node instanceof HTMLTextAreaElement ? node.value.length : (node.textContent ?? "").length;
      const at = Math.min(Math.max(caret, 0), length);
      if (node instanceof HTMLTextAreaElement) node.setSelectionRange(at, at);
      else writeRange(node, at, at);
    }, 0);
  }

  const linesRef = useRef(lines);
  linesRef.current = lines;
  useEffect(() => {
    if (!focusRequest) return;
    const current = linesRef.current;
    const index = current.findIndex((line) => WRITING.has(line.kind));
    const at = index < 0 ? 0 : index;
    focusLine(at, plainText(current[at]?.body ?? "").length);
  }, [focusRequest]);

  function closeMenu(): void {
    setMenuAt(null);
    setSlashQuery("");
  }

  function blurNote(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.current?.contains(active)) active.blur();
    window.getSelection()?.removeAllRanges();
  }

  function selectAll(): void {
    closeMenu();
    if (lines.length === 0) return;
    setSpan({ anchor: 0, focus: lines.length - 1 });
    blurNote();
  }

  function dropSpan(text: string | null): void {
    if (!span) return;
    const { low, high } = rangeOf(span);
    const next = lines.slice();
    next.splice(low, high - low + 1, ...(text === null ? [] : [{ kind: "text" as const, body: text }]));
    const kept = next.some(isContent) ? next : [{ kind: "text" as const, body: "" }];
    setSpan(null);
    write(kept);
    focusLine(Math.min(low, kept.length - 1), text?.length ?? 0);
  }

  function copySpan(): void {
    if (!span || !navigator.clipboard?.writeText) return;
    const { low, high } = rangeOf(span);
    const text = lines
      .slice(low, high + 1)
      .filter((line) => line && WRITING.has(line.kind))
      .map((line) => plainText(line.body))
      .join("\n");
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }

  function lineFromPointer(event: PointerEvent): number | null {
    const rows = root.current?.querySelectorAll("[data-note-line]");
    if (!rows || rows.length === 0) return null;
    const hits: Element[] = [];
    let laidOut = false;
    let first: Element | null = null;
    let last: Element | null = null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (rect.height === 0 && rect.width === 0) continue;
      laidOut = true;
      if (!first || rect.top < first.getBoundingClientRect().top) first = row;
      if (!last || rect.bottom > last.getBoundingClientRect().bottom) last = row;
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) hits.push(row);
    }
    if (!laidOut) return event.target instanceof Element ? lineIndex(event.target) : null;
    if (hits.length === 1) return lineIndex(hits[0]);
    if (hits.length > 1) {
      const across = hits.find((row) => {
        const rect = row.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right;
      });
      return lineIndex(across ?? hits[0]);
    }
    if (first && event.clientY < first.getBoundingClientRect().top) return lineIndex(first);
    if (last && event.clientY > last.getBoundingClientRect().bottom) return lineIndex(last);
    return null;
  }

  function pressLine(index: number, event: PressEvent<HTMLDivElement>): void {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("button, a, input, video, [data-line-grip], [data-turn-menu]")) return;
    setTurnAt(null);
    const extend = event.shiftKey && span !== null;
    const origin = extend && span ? span.anchor : index;
    const chooseBlock = lines[index]?.kind === "rule";
    if (extend) {
      event.preventDefault();
      setSpan({ anchor: origin, focus: index });
    } else if (chooseBlock) {
      event.preventDefault();
      setSpan({ anchor: index, focus: index });
    } else {
      setSpan(null);
    }
    const startX = event.clientX;
    const startY = event.clientY;
    let block = extend;
    let previousSelect = "";
    let locked = false;
    function lock(): void {
      if (locked) return;
      locked = true;
      previousSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
    }
    function unlock(): void {
      if (!locked) return;
      document.body.style.userSelect = previousSelect;
      locked = false;
    }
    function onMove(ev: PointerEvent): void {
      if (ev.buttons !== 1) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!block && dx * dx + dy * dy < 16) return;
      const under = lineFromPointer(ev);
      if (under === null) return;
      if (!block && under === index) return;
      if (!block) {
        block = true;
        lock();
        blurNote();
        const cap = root.current;
        if (cap) {
          try {
            cap.setPointerCapture(ev.pointerId);
          } catch {
            /* the pointer can already be gone */
          }
        }
      }
      setSpan({ anchor: origin, focus: under });
    }
    function end(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      unlock();
      if (dragEnd.current === end) dragEnd.current = null;
    }
    dragEnd.current?.();
    dragEnd.current = end;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", end);
  }

  pickedActions.current = {
    selectAll,
    dropSpan,
    copySpan,
    focusAt: (index) => focusLine(index, plainText(lines[index]?.body ?? "").length),
  };

  useEffect(() => {
    if (!span) return;
    function onKey(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") &&
        !root.current?.contains(target)
      ) {
        setSpan(null);
        return;
      }
      if (selectAllKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        pickedActions.current.selectAll();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        pickedActions.current.copySpan();
        return;
      }
      if (event.key === "Escape") {
        if (turnOpen.current || linkOpen.current) return;
        event.preventDefault();
        event.stopPropagation();
        const focus = span.focus;
        setSpan(null);
        pickedActions.current.focusAt(focus);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        event.stopPropagation();
        pickedActions.current.dropSpan(null);
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        pickedActions.current.dropSpan(event.key);
      }
    }
    function onDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && root.current?.contains(target)) return;
      setSpan(null);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [span]);

  useEffect(() => () => dragEnd.current?.(), []);

  useEffect(() => {
    if (turnAt === null) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setTurnAt(null);
    }
    function onDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-turn-menu]")) return;
      setTurnAt(null);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [turnAt]);

  useEffect(() => {
    if (menuAt === null) return;
    function onDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-slash-menu]")) return;
      setMenuAt(null);
      setSlashQuery("");
      if (!(target instanceof Element) || !target.closest("[data-turn-menu]")) setFormatAt(null);
    }
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [menuAt]);

  useEffect(() => {
    if (!copiedLink) return;
    const timer = window.setTimeout(() => setCopiedLink(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);

  useEffect(() => {
    if (!openLink) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpenLink(null);
    }
    function onDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-link-menu], [data-note-link]")) return;
      setOpenLink(null);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [openLink]);

  function mergeColumns(at: number, skip?: number): void {
    setTurnAt(null);
    const block = columnBlock(lines, at);
    if (!block) return;
    const next = unstackColumns(lines, block.at, block.end, skip);
    write(next);
    const first = Math.min(block.at, next.length - 1);
    const landing = WRITING.has(next[first]?.kind ?? "text") ? first : (nearestWriting(next, first, 1) ?? nearestWriting(next, first, -1) ?? first);
    focusLine(landing, 0);
  }

  function deleteColumns(at: number): void {
    setTurnAt(null);
    const block = columnBlock(lines, at);
    if (!block) return;
    const next = [...lines.slice(0, block.at), ...lines.slice(Math.min(block.end + 1, lines.length))];
    const kept = next.some(isContent) ? next : [{ kind: "text" as const, body: "" }];
    write(kept);
    const previous = nearestWriting(kept, Math.min(block.at, kept.length - 1) + 1, -1);
    focusLine(previous ?? 0, previous !== null ? plainText(kept[previous]?.body ?? "").length : 0);
  }

  function removeLine(index: number): void {
    const side = columnSide(lines, index);
    const onlyInSide = Boolean(side && side.length <= 1);
    const onlyInNote = lines.filter(isContent).length <= 1;
    if (onlyInSide && lines[index]?.kind === "text" && lines[index]?.body === "") {
      const block = columnBlock(lines, index);
      if (block) {
        mergeColumns(block.at, index);
        return;
      }
    }
    if (onlyInSide || onlyInNote) {
      if (lines[index]?.kind === "text" && lines[index]?.body === "") return;
      const next = lines.slice();
      next[index] = { kind: "text", body: "" };
      write(next);
      focusLine(index);
      return;
    }
    const next = lines.slice();
    next.splice(index, 1);
    write(next.length > 0 ? next : [{ kind: "text", body: "" }]);
    const previous = nearestWriting(lines, index, -1);
    if (previous !== null) focusLine(previous, plainText(lines[previous]?.body ?? "").length);
  }

  function resizeColumns(at: number, ratio: number): void {
    const next = lines.slice();
    const line = next[at];
    if (!line || line.kind !== "cols") return;
    const clamped = columnRatio(String(ratio));
    if ((line.body || "50") === String(clamped) && line.body !== "") return;
    next[at] = { ...line, body: String(clamped) };
    write(next);
  }

  function moveLine(from: number, to: number): void {
    if (!Number.isInteger(from) || from < 0 || from >= lines.length || from === to) return;
    const moving = lines[from];
    if (!isContent(moving)) return;
    const next = lines.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    write(next);
  }

  /** Inserts a block just before a column marker. Removing first, then using the old marker index, lands one line too far. */
  function moveBefore(from: number, marker: number): void {
    if (!Number.isInteger(from) || from < 0 || from >= lines.length || from === marker || from + 1 === marker) return;
    const moving = lines[from];
    if (!isContent(moving)) return;
    const next = lines.slice();
    const [item] = next.splice(from, 1);
    const at = from < marker ? marker - 1 : marker;
    next.splice(at, 0, item);
    write(next);
  }

  function settleMoved(next: NoteLine[], landing: number, count: number): void {
    setTurnAt(null);
    write(next);
    const line = next[landing];
    if (count === 1 && line && WRITING.has(line.kind)) {
      setSpan(null);
      focusLine(landing, plainText(line.body).length);
      return;
    }
    setSpan({ anchor: landing, focus: landing + count - 1 });
  }

  function placeInColumn(index: number, side: "left" | "right"): void {
    const run = selectionRun(lines, index, span);
    if (!run) return;
    const count = run.high - run.low + 1;
    if (columnBlock(lines, run.low)) {
      const shifted = shiftedColumns(lines, run, side);
      if (shifted) settleMoved(shifted.next, shifted.landing, count);
      return;
    }
    const near = adjacentPair(lines, run);
    if (near && splitOf(lines, near) >= 0) {
      const joined = joinedColumns(lines, run, near, side);
      if (joined) settleMoved(joined.next, joined.landing, count);
      return;
    }
    const made = createdColumns(lines, run, side);
    setTurnAt(null);
    write(made.next);
    setSpan(null);
    focusLine(made.focus, 0);
  }

  function moveOutOfColumns(index: number): void {
    const run = selectionRun(lines, index, span);
    if (!run) return;
    const lifted = liftedOut(lines, run);
    if (lifted) settleMoved(lifted.next, lifted.landing, run.high - run.low + 1);
  }

  function swapSides(at: number): void {
    setTurnAt(null);
    const block = columnBlock(lines, at);
    if (!block) return;
    const split = splitOf(lines, block);
    if (split < 0) return;
    const next = [
      ...lines.slice(0, block.at),
      lines[block.at],
      ...lines.slice(split + 1, block.end),
      lines[split],
      ...lines.slice(block.at + 1, split),
      ...(lines[block.end]?.kind === "endcols" ? [lines[block.end]] : []),
      ...lines.slice(block.end + 1),
    ];
    write(next);
  }

  function pick(id: (typeof MENU)[number]["id"], index: number): void {
    closeMenu();
    if (id === "file") {
      onPhoto(index);
      return;
    }
    if (id === "columns") {
      if (insideColumns(lines, index)) return;
      const current = lines[index] ?? { kind: "text" as const, body: "" };
      const left: NoteLine = isContent(current) ? current : { kind: "text", body: "" };
      const next = lines.slice();
      next.splice(index, 1, { kind: "cols", body: "" }, left, { kind: "split", body: "" }, { kind: "text", body: "" }, { kind: "endcols", body: "" });
      write(next);
      const focusAt = WRITING.has(left.kind) ? index + 1 : index + 3;
      focusLine(focusAt);
      return;
    }
    if (id === "rule") {
      const next = lines.slice();
      next.splice(index, 1, { kind: "rule", body: "" }, { kind: "text", body: "" });
      write(next);
      focusLine(index + 1);
      return;
    }
    const level = headingChoice(id);
    const kind: LineKind =
      level ? "heading" : id === "bullet" || id === "number" || id === "quote" || id === "list" ? id : "text";
    const next = lines.slice();
    next[index] = level ? { kind: "heading", level, body: "" } : { kind, body: "", done: false };
    write(next);
    focusLine(index);
  }

  function turnInto(id: (typeof TURN)[number]["id"], index: number): void {
    const level = headingChoice(id);
    const kind: LineKind = level
      ? "heading"
      : id === "text" || id === "bullet" || id === "number" || id === "quote" || id === "list"
        ? id
        : "text";
    const covered = span !== null && index >= rangeOf(span).low && index <= rangeOf(span).high;
    const low = covered && span ? rangeOf(span).low : index;
    const high = covered && span ? rangeOf(span).high : index;
    const next = lines.map((line, at) => {
      if (at < low || at > high || (!WRITING.has(line.kind) && line.kind !== "rule")) return line;
      return {
        kind,
        ...(level ? { level } : {}),
        body: line.kind === "rule" ? "" : line.body,
        done: kind === "list" ? Boolean(line.done) : false,
      };
    });
    setTurnAt(null);
    write(next);
    focusLine(index, plainText(next[index]?.body ?? "").length);
  }

  function setFileView(index: number, embed: boolean): void {
    setTurnAt(null);
    const line = lines[index];
    if (!line || line.kind !== "file") return;
    const next = lines.slice();
    next[index] = { ...line, embed: embed ? undefined : false };
    write(next);
  }

  function setFileWidth(index: number, width: number): void {
    const line = lines[index];
    if (!line || line.kind !== "file") return;
    const clamped = pictureWidth(width);
    if (line.width === clamped) return;
    const next = lines.slice();
    next[index] = { ...line, width: clamped };
    write(next);
  }

  function deleteTurn(index: number): void {
    setTurnAt(null);
    const covered = span !== null && index >= rangeOf(span).low && index <= rangeOf(span).high;
    if (covered) {
      dropSpan(null);
      return;
    }
    removeLine(index);
  }

  function showLink(
    event: { preventDefault: () => void; stopPropagation: () => void; currentTarget: HTMLElement },
    index: number,
    url: string,
    from: number,
    to: number
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const placed = placeOnScreen(
      { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      { width: 240, height: 180 },
      { width: window.innerWidth, height: window.innerHeight },
      "below"
    );
    setCopiedLink(false);
    setOpenLink((current) =>
      current && current.line === index && current.from === from && current.to === to
        ? null
        : { line: index, url, from, to, top: placed.top, left: placed.left }
    );
  }

  function editOpenLink(): void {
    if (!openLink) return;
    const { line: index, url, from, to } = openLink;
    setOpenLink(null);
    if (from < 0) {
      const next = lines.slice();
      next[index] = { kind: "text", body: url };
      write(next);
    }
    window.setTimeout(() => {
      const node = inputs.current[index];
      if (!node) return;
      node.focus();
      const length = node instanceof HTMLTextAreaElement ? node.value.length : (node.textContent ?? "").length;
      const start = from < 0 ? 0 : from;
      const end = from < 0 ? url.length : to;
      if (node instanceof HTMLTextAreaElement) node.setSelectionRange(start, Math.min(end, length));
      else writeRange(node, start, Math.min(end, length));
    }, 0);
  }

  function removeOpenLink(): void {
    if (!openLink) return;
    const { line: index, from, to } = openLink;
    setOpenLink(null);
    if (from < 0) {
      removeLine(index);
      return;
    }
    const line = lines[index];
    if (!line || !WRITING.has(line.kind)) return;
    const plain = plainText(line.body);
    const body = editPlain(line.body, `${plain.slice(0, from)}${plain.slice(to)}`.replace(/[^\S\n]{2,}/g, " ").trim());
    const next = lines.slice();
    next[index] = { ...line, body };
    write(next);
  }

  async function copyOpenLink(): Promise<void> {
    if (!openLink) return;
    try {
      await navigator.clipboard.writeText(openLink.url);
      setCopiedLink(true);
    } catch {
      setCopiedLink(false);
    }
  }

  function launchOpenLink(): void {
    if (!openLink) return;
    window.open(openLink.url, "_blank", "noopener,noreferrer");
    setOpenLink(null);
  }

  function insertUrl(index: number, url: string): void {
    const current = lines[index];
    const next = lines.slice();
    if (current && WRITING.has(current.kind)) {
      const plain = plainText(current.body);
      const gap = plain.length > 0 && !/\s$/.test(plain) ? " " : "";
      next[index] = { ...current, body: editPlain(current.body, `${plain}${gap}${url}`) };
    } else {
      next.splice(Math.min(index + 1, next.length), 0, { kind: "text", body: url });
    }
    write(next);
  }

  function continueNote(event: { button: number; preventDefault: () => void }): void {
    if (event.button > 0) return;
    event.preventDefault();
    setSpan(null);
    setTurnAt(null);
    const last = lines[lines.length - 1];
    if (last?.kind === "text" && last.body === "") {
      focusLine(lines.length - 1, 0);
      return;
    }
    write([...lines, { kind: "text", body: "" }]);
    focusLine(lines.length, 0);
  }

  function continueSide(side: readonly number[], before: number): void {
    closeMenu();
    setTurnAt(null);
    const last = side[side.length - 1];
    if (last !== undefined && lines[last]?.kind === "text" && lines[last]?.body === "") {
      focusLine(last, 0);
      return;
    }
    const next = lines.slice();
    next.splice(before, 0, { kind: "text", body: "" });
    write(next);
    focusLine(before, 0);
  }

  function putInk(next: { index: number; at: number; style: MarkStyle } | null): void {
    ink.current = next;
    setInkRev((n) => n + 1);
  }

  function applyFlag(index: number, flag: StyleFlag): void {
    const line = lines[index];
    if (!line || !WRITING.has(line.kind)) return;
    const node = inputs.current[index];
    const live = node && !(node instanceof HTMLTextAreaElement) ? readRange(node) : null;
    const range = live && live.end > live.start ? live : formatAt?.index === index ? formatAt : live;
    if (!range) return;
    if (range.start === range.end) {
      const base = styleBefore(line.body, range.start);
      const style: MarkStyle = { ...base };
      if (style[flag]) delete style[flag];
      else style[flag] = true;
      putInk({ index, at: range.start, style });
      return;
    }
    ink.current = null;
    const next = lines.slice();
    next[index] = { ...line, body: toggleStyle(line.body, range.start, range.end, flag) };
    write(next);
    setFormatAt({ index, start: range.start, end: range.end });
  }

  function applyBlockTone(index: number, kind: "color" | "highlight", color: ToneColor | null): void {
    const line = lines[index];
    if (!line || !WRITING.has(line.kind)) return;
    const prev = blockTone.current?.index === index ? blockTone.current : {};
    blockTone.current = { ...prev, index, [kind]: color };
    const plain = plainText(line.body);
    setTurnAt(null);
    if (plain.length === 0) return;
    const next = lines.slice();
    next[index] = { ...line, body: paintColor(line.body, 0, plain.length, kind, color) };
    write(next);
  }

  function renderLine(index: number): JSX.Element {
    const line = lines[index];
    const writing = Boolean(line && WRITING.has(line.kind));
    const filtering = menuAt === index;
    const picked = span !== null && index >= rangeOf(span).low && index <= rangeOf(span).high;
    const shownFile = line?.kind === "file" ? noteFile(files.find((file) => file.id === line.body), line) : null;
    const canSwitchView = Boolean(shownFile && hasPicture(shownFile) && !shownFile.pending);
    const viewing = Boolean(shownFile && canSwitchView && shownFile.embed !== false);
    const canTurn = Boolean(line && (writing || line.kind === "rule" || line.kind === "file"));
    const moves = columnMoves(lines, index, span);
    const moveChoices = [
      moves.left ? { label: "Move to left column", go: () => placeInColumn(index, "left") } : null,
      moves.right ? { label: "Move to right column", go: () => placeInColumn(index, "right") } : null,
      moves.out ? { label: "Move out of columns", go: () => moveOutOfColumns(index) } : null,
    ].flatMap((item) => (item ? [item] : []));
    const TurnIcon =
      line?.kind === "rule"
        ? Minus
        : line?.kind === "file"
          ? viewing
            ? shownFile?.video
              ? Film
              : ImageIcon
            : Paperclip
          : line?.kind === "heading"
            ? HEADING_ICON[lineHeading(line)]
            : (TURN.find((item) => item.id === line?.kind)?.icon ?? Type);
    const shown = filtering ? `/${slashQuery}` : plainText(line?.body ?? "");
    const html = filtering || !line ? escapeHtml(shown) : lineHtml(line.body, focusAt !== index);
    const held = formatAt?.index === index ? formatAt : null;
    const format = held && held.end > held.start && line && !filtering ? selectionStyle(line.body, held.start, held.end) : null;
    const plainBody = line && writing ? plainText(line.body) : "";
    const armedTone = blockTone.current?.index === index ? blockTone.current : null;
    const storedTone = plainBody.length > 0 && line ? selectionStyle(line.body, 0, plainBody.length) : null;
    const lineColor = armedTone && armedTone.color !== undefined ? armedTone.color : (storedTone?.color ?? null);
    const lineHighlight = armedTone && armedTone.highlight !== undefined ? armedTone.highlight : (storedTone?.highlight ?? null);
    return (
      <div
        key={index}
        ref={(node) => {
          lineAnchors.current[index] = node;
        }}
        data-note-line={index}
        data-picked={picked ? "true" : undefined}
        onPointerDown={(event) => pressLine(index, event)}
        className={`group relative flex min-w-0 items-start gap-1.5 rounded-md pr-11 ${
          picked ? "bg-primary/30" : overLine === index ? "bg-primary/10" : ""
        }`}
        onDragOver={(event) => {
          if (!hasLineDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setOverLine(index);
        }}
        onDrop={(event) => {
          if (!hasLineDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          const from = Number(event.dataTransfer.getData(LINE_DRAG));
          setOverLine(null);
          moveLine(from, index);
        }}
      >
        <span
          draggable
          data-line-grip=""
          aria-label="Move line"
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData(LINE_DRAG, String(index));
            if (line && line.body.trim() && WRITING.has(line.kind)) {
              event.dataTransfer.setData(LIFT_DRAG, plainText(line.body).trim());
            }
            event.dataTransfer.effectAllowed = "copyMove";
          }}
          className="mt-1 inline-flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {canTurn && line ? (
          <div className="relative" data-turn-menu="">
              <button
              ref={(node) => {
                turnAnchors.current[index] = node;
              }}
              type="button"
              aria-label={line.kind === "file" ? "File options" : "Turn into"}
              aria-expanded={turnAt === index}
              data-turn={line.kind}
              title={line.kind === "file" ? "File options" : "Turn into"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                closeMenu();
                setTonePanel(null);
                setTurnAt((current) => (current === index ? null : index));
              }}
              className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground ${
                turnAt === index
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              }`}
            >
              <TurnIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {turnAt === index ? (
              <ScreenMenu
                anchor={turnAnchors.current[index] ?? null}
                label={line.kind === "file" ? "File options" : "Turn into"}
                role="menu"
                className="w-52 rounded-lg border border-border bg-card py-1 shadow-lg"
              >
                {line.kind === "file"
                  ? canSwitchView
                    ? [
                        { embed: true, label: shownFile?.video ? "Show the video" : "Show the picture", icon: shownFile?.video ? Film : ImageIcon },
                        { embed: false, label: "Show the file name", icon: Paperclip },
                      ].map((item) => {
                        const Icon = item.icon;
                        const current = item.embed === viewing;
                        return (
                          <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            aria-current={current ? "true" : undefined}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setFileView(index, item.embed)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted ${
                              current ? "bg-muted" : ""
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            {item.label}
                          </button>
                        );
                      })
                    : null
                  : TURN.map((item) => {
                      const Icon = item.icon;
                      const level = headingChoice(item.id);
                      const current = level ? line.kind === "heading" && lineHeading(line) === level : line.kind === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          aria-current={current ? "true" : undefined}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => turnInto(item.id, index)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted ${
                            current ? "bg-muted" : ""
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {item.label}
                        </button>
                      );
                    })}
                {writing ? (
                  <>
                    <div className="my-1 border-t border-border" />
                    <ToneRow
                      label="Color"
                      menuLabel="Text color"
                      swatch={swatchFill(lineColor, "color")}
                      open={tonePanel === "color"}
                      onOpen={() => setTonePanel((current) => (current === "color" ? null : "color"))}
                    >
                      <TonePanel kind="color" value={lineColor} onPick={(value) => applyBlockTone(index, "color", value)} />
                    </ToneRow>
                    <ToneRow
                      label="Highlight"
                      menuLabel="Highlight"
                      swatch={swatchFill(lineHighlight, "highlight")}
                      open={tonePanel === "highlight"}
                      onOpen={() => setTonePanel((current) => (current === "highlight" ? null : "highlight"))}
                    >
                      <TonePanel kind="highlight" value={lineHighlight} onPick={(value) => applyBlockTone(index, "highlight", value)} />
                    </ToneRow>
                  </>
                ) : null}
                {moveChoices.length > 0 ? (
                  <>
                    {line.kind !== "file" || canSwitchView ? <div className="my-1 border-t border-border" /> : null}
                    {moveChoices.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={item.go}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                      >
                        <Columns2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {item.label}
                      </button>
                    ))}
                  </>
                ) : null}
                {line.kind !== "file" || canSwitchView || moveChoices.length > 0 ? (
                  <div className="my-1 border-t border-border" />
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => deleteTurn(index)}
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
                >
                  Delete
                </button>
              </ScreenMenu>
            ) : null}
          </div>
        ) : null}
        {line?.kind === "list" ? (
          <button
            type="button"
            aria-label={line.done ? "Done" : "Not done"}
            aria-pressed={Boolean(line.done)}
            onClick={() => {
              const next = lines.slice();
              next[index] = { ...line, done: !line.done };
              write(next);
            }}
            className="mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-foreground text-foreground"
          >
            {line.done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
          </button>
        ) : null}
        {line?.kind === "bullet" ? (
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
        ) : null}
        {line?.kind === "number" ? (
          <span className="mt-0.5 w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {noteNumber(lines, index)}.
          </span>
        ) : null}
        {line?.kind === "file" && shownFile ? (
          <NoteFile item={shownFile} onRemove={() => removeLine(index)} onResize={(width) => setFileWidth(index, width)} />
        ) : null}
        {line?.kind === "link" ? (
          <button
            type="button"
            data-note-link=""
            className="min-w-0 flex-1 break-all bg-transparent p-0 text-left text-sm text-primary hover:underline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => showLink(event, index, links.find((item) => item.id === line.body)?.url ?? line.body, -1, -1)}
          >
            {links.find((item) => item.id === line.body)?.url ?? line.body}
          </button>
        ) : null}
        {line?.kind === "rule" ? (
          <div
            tabIndex={0}
            aria-label="Divider"
            onKeyDown={(event) => {
              if (event.key !== "Backspace" && event.key !== "Delete") return;
              event.preventDefault();
              removeLine(index);
            }}
            className="flex h-6 min-w-0 flex-1 cursor-pointer items-center outline-none"
          >
            <span className="w-full border-t border-border" />
          </div>
        ) : null}
        {writing && line ? (
          <div
            ref={(node) => {
              textAnchors.current[index] = node;
            }}
            className={`relative min-w-0 flex-1 rounded-md ${line.kind === "quote" ? "border-l-2 border-border" : ""} ${lineHighlight && namedColor(lineHighlight) ? COLOR_BG[lineHighlight] : ""}`}
            style={lineHighlight && !namedColor(lineHighlight) ? { backgroundColor: lineHighlight } : undefined}
          >
          {format ? (
            <ScreenMenu
              anchor={textAnchors.current[index] ?? null}
              label="Format"
              role="toolbar"
              side="above"
              holdFocus
              className="w-max rounded-lg border border-border bg-card p-1 shadow-lg"
            >
              <div className="flex items-center gap-0.5">
                {(
                  [
                    { flag: "bold" as const, label: "Bold", icon: Bold, pressed: format.bold },
                    { flag: "italic" as const, label: "Italic", icon: Italic, pressed: format.italic },
                    { flag: "underline" as const, label: "Underline", icon: Underline, pressed: format.underline },
                    { flag: "strike" as const, label: "Strikethrough", icon: Strikethrough, pressed: format.strike },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.flag}
                      type="button"
                      aria-label={item.label}
                      aria-pressed={item.pressed}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyFlag(index, item.flag)}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded text-foreground hover:bg-muted ${item.pressed ? "bg-muted" : ""}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </ScreenMenu>
          ) : null}
          <LineEditor
            html={html}
            label={index === 0 ? "Note" : undefined}
            placeholder={!filtering && shown === "" ? "Type / for headings, lists, etc." : ""}
            className={`${line.kind === "heading" ? HEADING_LOOK[lineHeading(line)] : "min-h-6 text-sm leading-6"} ${line.kind === "quote" ? "pl-2" : ""} ${
              line.kind === "list" && line.done
                ? "text-muted-foreground line-through"
                : lineColor && namedColor(lineColor)
                  ? COLOR_TEXT[lineColor]
                  : "text-foreground"
            }`}
            style={lineColor && !namedColor(lineColor) ? { color: lineColor } : undefined}
            inputRef={(node) => {
              inputs.current[index] = node;
            }}
            onPlain={(typed) => {
              if (filtering) {
                if (!typed.startsWith("/")) {
                  closeMenu();
                  const next = lines.slice();
                  next[index] = { ...line, body: typed };
                  write(next);
                  return;
                }
                const query = typed.slice(1);
                const nextNeedle = query.trim().toLowerCase();
                const matched =
                  nextNeedle.length === 0 ||
                  MENU.some((item) => {
                    if (item.id === "columns" && insideColumns(lines, index)) return false;
                    return item.label.toLowerCase().includes(nextNeedle);
                  });
                if (!matched) {
                  closeMenu();
                  const next = lines.slice();
                  next[index] = { ...line, body: typed };
                  write(next);
                  return;
                }
                setSlashQuery(query);
                setActive(0);
                return;
              }
              if (plainText(line.body) === "" && typed === "/") {
                setTurnAt(null);
                setMenuAt(index);
                setSlashQuery("");
                setActive(0);
                setFormatAt(null);
                return;
              }
              const pending = ink.current?.index === index ? ink.current : null;
              const before = plainText(line.body);
              const tone = blockTone.current?.index === index ? blockTone.current : null;
              if (!typed.includes("\n")) {
                const next = lines.slice();
                let body = paintInserted(editPlain(line.body, typed, pending), before, typed, tone);
                if (plainText(body) === "" && before.length > 0 && !tone) {
                  const look = selectionStyle(line.body, 0, before.length);
                  if (look.color || look.highlight) blockTone.current = { index, color: look.color, highlight: look.highlight };
                }
                next[index] = { ...line, body };
                const change = plainChange(before, typed);
                if (pending && change.removed === 0 && change.from === pending.at && change.inserted.length > 0) {
                  const at = pending.at + change.inserted.length;
                  ink.current = { index, at, style: pending.style };
                  setFormatAt({ index, start: at, end: at });
                } else ink.current = null;
                write(next);
                return;
              }
              ink.current = null;
              const parts = typed.split("\n");
              let rest = editPlain(line.body, parts.join(""), pending);
              const bodies = parts.map((part) => {
                const cut = splitPlain(rest, part.length);
                rest = cut.right;
                return cut.left;
              });
              const next = lines.slice();
              next[index] = { ...line, body: bodies[0] ?? "" };
              const carried: LineKind =
                line.kind === "list" || line.kind === "bullet" || line.kind === "number" || line.kind === "quote"
                  ? line.kind
                  : "text";
              const extra: NoteLine[] = bodies.slice(1).map((body) => ({ kind: carried, body, done: false }));
              next.splice(index + 1, 0, ...extra);
              write(next);
            }}
            onFocus={() => {
              setFocusAt(index);
              onLine?.(index);
              if (blockTone.current && blockTone.current.index !== index) blockTone.current = null;
            }}
            onBlur={() => {
              setFocusAt((current) => (current === index ? null : current));
              setFormatAt((current) => (current?.index === index ? null : current));
              if (ink.current?.index === index) putInk(null);
            }}
            onSelect={(node) => {
              if (filtering) return;
              const range = readRange(node);
              if (!range || range.start === range.end) {
                if (ink.current?.index === index && range && range.start !== ink.current.at) putInk(null);
                setFormatAt((current) => (current?.index === index ? null : current));
                return;
              }
              if (ink.current?.index === index) putInk(null);
              setFormatAt({ index, start: range.start, end: range.end });
            }}
            onLink={(event, from, to, url) => showLink(event, index, url, from, to)}
            onKeyDown={(event) => {
              if (selectAllKey(event) && coversBlock(event.currentTarget)) {
                event.preventDefault();
                selectAll();
                return;
              }
              if (!filtering && (event.metaKey || event.ctrlKey) && !event.altKey) {
                const key = event.key.toLowerCase();
                const flag: StyleFlag | null =
                  key === "b" ? "bold" : key === "i" ? "italic" : key === "u" ? "underline" : event.shiftKey && (key === "s" || key === "x") ? "strike" : null;
                if (flag) {
                  event.preventDefault();
                  applyFlag(index, flag);
                  return;
                }
              }
              if (filtering) {
                if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length > 0) {
                  event.preventDefault();
                  setActive((current) =>
                    event.key === "ArrowDown"
                      ? (current + 1) % choices.length
                      : (current + choices.length - 1) % choices.length
                  );
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const picked = choices[active];
                  if (picked) pick(picked.id, index);
                  else {
                    closeMenu();
                    const next = lines.slice();
                    next[index] = { ...line, body: slashQuery ? `/${slashQuery}` : "" };
                    write(next);
                  }
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu();
                  return;
                }
              }
              const range = readRange(event.currentTarget) ?? { start: 0, end: 0 };
              const cursor = range.start;
              const cursorEnd = range.end;
              const collapsed = cursor === cursorEnd;
              if (event.key === "ArrowUp" && !event.shiftKey && collapsed && cursor === 0) {
                const previous = nearestWriting(lines, index, -1);
                if (previous === null) return;
                event.preventDefault();
                focusLine(previous, plainText(lines[previous]?.body ?? "").length);
                return;
              }
              if (event.key === "ArrowDown" && !event.shiftKey && collapsed && cursor === shown.length) {
                const following = nearestWriting(lines, index, 1);
                if (following === null) return;
                event.preventDefault();
                focusLine(following, 0);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const block =
                  line.kind === "list" || line.kind === "bullet" || line.kind === "number" || line.kind === "quote";
                if (block && plainText(line.body) === "") {
                  const next = lines.slice();
                  next[index] = { kind: "text", body: "" };
                  write(next);
                  return;
                }
                const cut = splitPlain(filtering ? shown : line.body, cursor, cursorEnd);
                const next = lines.slice();
                next[index] = { ...line, body: cut.left };
                const kind: LineKind = block ? line.kind : "text";
                next.splice(index + 1, 0, { kind, body: cut.right, done: false });
                write(next);
                focusLine(index + 1, 0);
                return;
              }
              if (event.key === "Backspace" && collapsed && cursor === 0) {
                event.preventDefault();
                if (plainText(line.body) === "") {
                  if (line.kind !== "text") {
                    const next = lines.slice();
                    next[index] = { kind: "text", body: "" };
                    write(next);
                    return;
                  }
                  removeLine(index);
                  return;
                }
                const previous = nearestWriting(lines, index, -1);
                if (previous === null) {
                  if (line.kind !== "text") {
                    const next = lines.slice();
                    next[index] = { kind: "text", body: line.body };
                    write(next);
                  }
                  return;
                }
                const prior = lines[previous];
                if (!prior || !WRITING.has(prior.kind)) return;
                const next = lines.slice();
                next[previous] = { ...prior, body: joinPlain(prior.body, line.body) };
                next.splice(index, 1);
                write(next);
                focusLine(previous, plainText(prior.body).length);
              }
            }}
          />
          </div>
        ) : null}
        {menuAt === index && choices.length > 0 ? (
          <ScreenMenu anchor={lineAnchors.current[index] ?? null} label="Note options" role="menu" slash shield={false} className="w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
            {choices.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(item.id, index)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground ${
                    itemIndex === active ? "bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </ScreenMenu>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className={`relative mt-8 flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto ${
        span ? "select-none" : ""
      }`}
      onDragOver={(event) => {
        if (onDropFiles && hasFileDrag(event)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setOverLine(lineUnder(event, lines.length));
          return;
        }
        if (!hasResourceDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOverLine(lineUnder(event, lines.length));
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOverLine(null);
      }}
      onDrop={(event) => {
        if (onDropFiles && hasFileDrag(event)) {
          event.preventDefault();
          event.stopPropagation();
          const at = lineUnder(event, lines.length);
          setOverLine(null);
          onDropFiles(Array.from(event.dataTransfer.files ?? []), at);
          return;
        }
        if (!hasResourceDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const resource = readResourceDrag(event);
        const at = lineUnder(event, lines.length);
        setOverLine(null);
        if (resource?.kind === "link") {
          const url = links.find((item) => item.id === resource.id)?.url;
          if (url) insertUrl(at, url);
          return;
        }
        if (resource && onDropResource) onDropResource(resource.kind, resource.id, at);
      }}
    >
      {noteSegments(lines).map((segment) =>
        segment.type === "line" ? (
          renderLine(segment.index)
        ) : (
          <ColumnPair
            key={`cols-${segment.at}`}
            ratio={columnDrag?.at === segment.at ? columnDrag.ratio : columnRatio(lines[segment.at]?.body)}
            onDrag={(ratio) => setColumnDrag({ at: segment.at, ratio })}
            onResize={(ratio) => {
              setColumnDrag(null);
              resizeColumns(segment.at, ratio);
            }}
            left={segment.left.map((index) => renderLine(index))}
            right={segment.right.map((index) => renderLine(index))}
            onAddLeft={() => continueSide(segment.left, segment.split)}
            onAddRight={() => continueSide(segment.right, segment.end)}
            menuOpen={turnAt === segment.at}
            onMenu={(open) => {
              closeMenu();
              setTurnAt(open ? segment.at : null);
            }}
            onMerge={() => mergeColumns(segment.at)}
            onDelete={() => deleteColumns(segment.at)}
            onSwap={() => swapSides(segment.at)}
            onDropLeft={(from) => {
              setOverLine(null);
              moveBefore(from, segment.split);
            }}
            onDropRight={(from) => {
              setOverLine(null);
              moveBefore(from, segment.end);
            }}
          />
        )
      )}
      <button
        type="button"
        aria-label="Add a line"
        onClick={continueNote}
        className="min-h-24 w-full flex-1 cursor-text border-0 bg-transparent p-0"
      />
      {full ? (
        <p className="text-sm text-destructive" role="status">
          The note is full
        </p>
      ) : null}
      {!full && value.length >= NOTE_MAX - 800 ? (
        <p className="text-xs text-muted-foreground">{NOTE_MAX - value.length} left</p>
      ) : null}
      {openLink
        ? createPortal(
            <div
              data-link-menu=""
              role="menu"
              aria-label="Link"
              style={{ top: openLink.top, left: openLink.left }}
              className="fixed z-[70] w-60 rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              <p className="break-all text-xs leading-5 text-foreground">{openLink.url}</p>
              <div className="mt-2 border-t border-border pt-1">
                <LinkMenuButton label="Open" icon={ExternalLink} onClick={launchOpenLink} />
                <LinkMenuButton label={copiedLink ? "Copied" : "Copy"} icon={copiedLink ? Check : Copy} onClick={() => void copyOpenLink()} />
                <LinkMenuButton label="Edit" icon={Type} onClick={editOpenLink} />
                <LinkMenuButton label="Remove" icon={X} onClick={removeOpenLink} />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function TagPicker({
  topic,
  topics,
  onChange,
  searchLabel,
}: {
  topic: string;
  topics: readonly string[];
  onChange: (value: string) => void;
  searchLabel: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = topics.filter((item) => item.toLowerCase().includes(needle));
  const exact = topics.some((item) => item.toLowerCase() === needle);
  const canCreate = query.trim().length > 0 && !exact;

  function choose(next: string): void {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button
        ref={anchor}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-foreground hover:bg-muted"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        Tags
      </button>
      {open ? (
        <ScreenMenu anchor={anchor.current} side="end" shield={false} className="w-64 rounded-lg border border-border bg-card p-2 shadow-lg">
          <input
            aria-label={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (shown[0] && !canCreate) choose(shown[0]);
              else if (canCreate) choose(query.trim());
            }}
            placeholder="Search tags"
            maxLength={80}
            className="h-9 w-full rounded-md border border-primary/40 px-2 text-sm text-foreground outline-none"
          />
          <ul className="mt-2 max-h-40 overflow-y-auto">
            {shown.map((item) => {
              const selected = item === topic.trim();
              return (
                <li key={item}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(selected ? "" : item)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-foreground">{item}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {canCreate ? (
            <button
              type="button"
              onClick={() => choose(query.trim())}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            >
              Create {query.trim()}
            </button>
          ) : null}
        </ScreenMenu>
      ) : null}
    </div>
  );
}

function noteFile(found: ShelfFile | undefined, line: NoteLine): ShelfFile {
  const name = found?.name || line.name;
  if (!found) return { id: line.body, preview: null, name, embed: line.embed, width: line.width };
  return { ...found, name, embed: line.embed, width: line.width };
}

function ColumnPair({
  ratio,
  onDrag,
  onResize,
  left,
  right,
  onAddLeft,
  onAddRight,
  menuOpen,
  onMenu,
  onMerge,
  onDelete,
  onSwap,
  onDropLeft,
  onDropRight,
}: {
  ratio: number;
  onDrag: (ratio: number) => void;
  onResize: (ratio: number) => void;
  left: JSX.Element[];
  right: JSX.Element[];
  onAddLeft: () => void;
  onAddRight: () => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onMerge: () => void;
  onDelete: () => void;
  onSwap: () => void;
  onDropLeft: (from: number) => void;
  onDropRight: (from: number) => void;
}): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const menuAnchor = useRef<HTMLDivElement>(null);
  function press(event: PressEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const bounds = frame.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) {
      onMenu(!menuOpen);
      return;
    }
    const width = bounds.width;
    const edge = bounds.left;
    const startX = event.clientX;
    let moved = false;
    const share = (clientX: number) => columnRatio(String(Math.round(((clientX - edge) / width) * 100)));
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 4) return;
      moved = true;
      onDrag(share(ev.clientX));
    };
    const stop = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      if (moved) onResize(share(ev.clientX));
      else onMenu(!menuOpen);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  function nudge(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onMenu(!menuOpen);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onResize(ratio + (event.key === "ArrowRight" ? 5 : -5));
  }
  function takeLine(event: DragEvent<HTMLButtonElement>, drop: (from: number) => void, landing: boolean): void {
    if (!hasLineDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (landing) drop(Number(event.dataTransfer.getData(LINE_DRAG)));
  }
  return (
    <div ref={frame} className="flex min-w-0 items-stretch">
      <div style={{ flex: `${ratio} 1 0%` }} className="flex min-w-0 flex-col gap-1">
        {left}
        <button
          type="button"
          aria-label="Add a line to the left column"
          onClick={onAddLeft}
          onDragOver={(event) => takeLine(event, onDropLeft, false)}
          onDrop={(event) => takeLine(event, onDropLeft, true)}
          className="min-h-6 w-full flex-1 cursor-text border-0 bg-transparent p-0"
        />
      </div>
      <div ref={menuAnchor} className="relative shrink-0" data-turn-menu="">
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={ratio}
          aria-label="Columns"
          title="Drag to resize. Click for options."
          onPointerDown={press}
          onKeyDown={nudge}
          className="group/col relative mx-1 h-full w-3 cursor-col-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={`absolute inset-y-0 left-1/2 -translate-x-1/2 ${
              menuOpen ? "w-0.5 bg-primary" : "w-px bg-border group-hover/col:w-0.5 group-hover/col:bg-foreground"
            }`}
          />
        </div>
        {menuOpen ? (
          <ScreenMenu anchor={menuAnchor.current} label="Columns" role="menu" side="start" className="w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSwap}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            >
              <Columns2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Swap sides
            </button>
            <button
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onMerge}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            >
              <Rows2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Merge into one
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onDelete}
              className="flex w-full items-center px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
            >
              Delete columns
            </button>
          </ScreenMenu>
        ) : null}
      </div>
      <div style={{ flex: `${100 - ratio} 1 0%` }} className="flex min-w-0 flex-col gap-1">
        {right}
        <button
          type="button"
          aria-label="Add a line to the right column"
          onClick={onAddRight}
          onDragOver={(event) => takeLine(event, onDropRight, false)}
          onDrop={(event) => takeLine(event, onDropRight, true)}
          className="min-h-6 w-full flex-1 cursor-text border-0 bg-transparent p-0"
        />
      </div>
    </div>
  );
}

function fileLabel(item: ShelfFile): string {
  return item.name?.trim() || "File";
}

function UploadRing({
  progress = 0,
  labelled = true,
  large = false,
}: {
  progress?: number;
  labelled?: boolean;
  large?: boolean;
}): JSX.Element {
  const amount = Math.max(0, Math.min(100, Math.round(progress)));
  const size = large ? 36 : 16;
  const stroke = large ? 3 : 2;
  const radius = large ? 14 : 6;
  const length = 2 * Math.PI * radius;
  const box = large ? "h-10 w-10" : "h-4 w-4 shrink-0";
  return (
    <span
      role={labelled ? "progressbar" : undefined}
      aria-valuemin={labelled ? 0 : undefined}
      aria-valuemax={labelled ? 100 : undefined}
      aria-valuenow={labelled ? amount : undefined}
      aria-label={labelled ? `Uploading ${amount} percent` : undefined}
      aria-hidden={labelled ? undefined : true}
      className={
        large
          ? "relative inline-flex h-10 w-10 items-center justify-center"
          : "inline-flex shrink-0 items-center gap-1"
      }
    >
      <svg viewBox={`0 0 ${size} ${size}`} className={`${box} -rotate-90 text-primary`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - amount / 100)}
          strokeLinecap={amount > 0 ? "round" : "butt"}
        />
      </svg>
      {large ? (
        <span aria-hidden="true" className="absolute text-[11px] font-medium tabular-nums text-foreground">
          {amount}%
        </span>
      ) : labelled ? (
        <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">
          {amount}%
        </span>
      ) : null}
    </span>
  );
}

function hasPicture(item: ShelfFile): boolean {
  return Boolean(item.preview) && !item.audio && !item.page && !item.face && !item.failed;
}

function NoteFile({
  item,
  onRemove,
  onResize,
}: {
  item: ShelfFile;
  onRemove: () => void;
  onResize: (width: number) => void;
}): JSX.Element {
  const [viewing, setViewing] = useState(false);
  const [sizing, setSizing] = useState<number | null>(null);
  const block = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const label = fileLabel(item);
  const picture = hasPicture(item);
  const embedded = picture && !item.pending && item.embed !== false;
  const width = sizing ?? item.width ?? null;
  const Icon = item.face === "sheet" ? Table2 : item.face === "slides" ? Presentation : item.audio ? AudioLines : item.video ? Film : item.page ? FileText : ImageIcon;
  function open(): void {
    if (item.pending || item.failed || !item.preview) return;
    setViewing(true);
  }
  function startResize(event: PressEvent<HTMLElement>, side: -1 | 1): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const whole = block.current?.getBoundingClientRect();
    const shown = frame.current?.getBoundingClientRect();
    if (!whole || whole.width <= 0 || !shown) return;
    const startX = event.clientX;
    const startWidth = (shown.width / whole.width) * 100;
    const at = (clientX: number) => pictureWidth(startWidth + (((clientX - startX) * side * 2) / whole.width) * 100);
    const move = (ev: PointerEvent) => setSizing(at(ev.clientX));
    const stop = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setSizing(null);
      onResize(at(ev.clientX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }
  function nudge(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onResize((item.width ?? 100) + (event.key === "ArrowRight" ? 5 : -5));
  }
  const handle =
    "absolute top-1/2 h-10 w-1.5 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-background/90 shadow-sm ring-1 ring-border opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";
  return (
    <div className="min-w-0 flex-1">
      {embedded ? null : (
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={open}
            title={label}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
          >
            {item.pending ? (
              <UploadRing labelled={!picture} progress={item.progress ?? 0} />
            ) : (
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="truncate text-sm text-foreground">{label}</span>
            {item.failed ? <span className="shrink-0 text-xs text-destructive">Could not add</span> : null}
          </button>
          <button type="button" aria-label="Remove from the note" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {picture && (embedded || item.pending) ? (
        <div ref={block} className={`relative ${embedded ? "" : "mt-1"}`}>
          <div
            ref={frame}
            data-picture-frame=""
            style={width !== null ? { width: `${width}%` } : undefined}
            className={`relative mx-auto ${width !== null ? "" : "w-fit max-w-full"}`}
          >
            {item.video && embedded ? (
              <div className="relative block w-full overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the clinician's own clip, no caption track exists */}
                <video
                  src={item.preview ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={label}
                  className={width !== null ? "h-auto w-full object-contain" : "h-auto max-h-80 w-auto max-w-full object-contain"}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={open}
                aria-label={embedded ? label : undefined}
                aria-hidden={embedded ? undefined : true}
                className="relative block w-full overflow-hidden rounded-md bg-muted"
              >
                {item.video ? (
                  <video
                    src={item.preview ?? undefined}
                    muted
                    playsInline
                    preload="metadata"
                    className={width !== null ? "h-auto w-full object-contain" : "h-auto max-h-80 w-auto max-w-full object-contain"}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview ?? undefined}
                    alt=""
                    className={width !== null ? "h-auto w-full object-contain" : "h-auto max-h-80 w-auto max-w-full object-contain"}
                  />
                )}
              </button>
            )}
            {item.pending ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40">
                <UploadRing large progress={item.progress ?? 0} />
              </span>
            ) : null}
            {embedded ? (
              <>
                <span aria-hidden="true" onPointerDown={(event) => startResize(event, -1)} className={`${handle} left-1`} />
                <span
                  role="slider"
                  tabIndex={0}
                  aria-label={item.video ? "Resize video" : "Resize picture"}
                  aria-valuemin={20}
                  aria-valuemax={100}
                  aria-valuenow={item.width ?? 100}
                  aria-valuetext={item.width !== undefined ? `${item.width} percent` : "Natural size"}
                  onPointerDown={(event) => startResize(event, 1)}
                  onKeyDown={nudge}
                  className={`${handle} right-1 outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                />
                <button
                  type="button"
                  aria-label="Remove from the note"
                  onClick={onRemove}
                  className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {viewing && item.preview ? <FileView item={item} onClose={() => setViewing(false)} /> : null}
    </div>
  );
}

function ShelfTile({
  item,
  onRemove,
  onPlace,
  removeLabel,
  large = false,
}: {
  item: ShelfFile;
  onRemove?: () => void;
  onPlace?: () => void;
  removeLabel: string;
  large?: boolean;
}): JSX.Element {
  const [viewing, setViewing] = useState(false);
  const box = large ? "aspect-square w-full" : "h-12 w-12";
  const icon = large ? "h-8 w-8" : "h-4 w-4";
  const face = item.face ?? (item.page ? "page" : null);
  const FaceIcon = face === "sheet" ? Table2 : face === "slides" ? Presentation : FileText;
  const faceLabel = face === "sheet" ? "Sheet" : face === "slides" ? "Slides" : "Document";
  const viewLabel = item.video
    ? "View video"
    : item.audio
      ? "View audio"
      : face === "sheet"
        ? "View sheet"
        : face === "slides"
          ? "View slides"
          : face
            ? "View document"
            : "View photo";
  function show(): void {
    if (item.pending || item.failed || !item.preview) return;
    setViewing(true);
  }
  function startDrag(event: DragEvent<HTMLElement>): void {
    if (!onPlace) return;
    event.dataTransfer.setData(RESOURCE_DRAG, JSON.stringify({ kind: "file", id: item.id }));
    event.dataTransfer.effectAllowed = "copy";
  }
  return (
    <span
      className={`group relative shrink-0 ${onPlace ? "cursor-grab active:cursor-grabbing" : ""} ${box}`}
      draggable={Boolean(onPlace)}
      onDragStart={(event) => {
        if (!onPlace) return;
        event.dataTransfer.setData(RESOURCE_DRAG, JSON.stringify({ kind: "file", id: item.id }));
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      {face ? (
        <button
          type="button"
          aria-label={viewLabel}
          draggable={Boolean(onPlace)}
          onDragStart={startDrag}
          onClick={show}
          className={`flex flex-col items-center justify-center gap-2 rounded-md bg-muted text-muted-foreground ${box}`}
        >
          <FaceIcon className={icon} aria-hidden="true" />
          {large ? <span className="text-xs">{faceLabel}</span> : null}
        </button>
      ) : null}
      {item.audio ? (
        <button
          type="button"
          aria-label={viewLabel}
          draggable={Boolean(onPlace)}
          onDragStart={startDrag}
          onClick={show}
          className={`flex items-center justify-center rounded-md bg-muted text-muted-foreground ${box}`}
        >
          <AudioLines className={icon} aria-hidden="true" />
        </button>
      ) : null}
      {item.preview && !face && !item.audio ? (
        <button
          type="button"
          aria-label={viewLabel}
          draggable={Boolean(onPlace)}
          onDragStart={startDrag}
          onClick={show}
          className={`overflow-hidden rounded-md ${box}`}
        >
          {item.video ? (
            <video src={item.preview} muted playsInline draggable={false} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.preview} alt="" draggable={false} className="h-full w-full object-cover" />
          )}
        </button>
      ) : null}
      {!item.preview && !face && !item.audio ? (
        <span className={`block rounded-md bg-muted ${box}`} />
      ) : null}
      {item.pending ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/45">
          <UploadRing large progress={item.progress ?? 0} />
        </span>
      ) : null}
      {onPlace ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPlace();
          }}
          aria-label="Place"
          className="absolute bottom-1.5 right-1.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className={`absolute z-10 inline-flex items-center justify-center rounded-full bg-foreground text-background ${
            large ? "right-1 top-1 h-5 w-5" : "right-0.5 top-0.5 h-4 w-4"
          }`}
        >
          <X className={large ? "h-3 w-3" : "h-2.5 w-2.5"} aria-hidden="true" />
        </button>
      ) : null}
      {viewing && item.preview ? <FileView item={item} onClose={() => setViewing(false)} /> : null}
    </span>
  );
}

const SHEET_ROW_CAP = 200;
const SHEET_COL_CAP = 30;

function sheetRows(
  xlsx: typeof import("xlsx"),
  book: import("xlsx").WorkBook,
  sheetName: string
): string[][] {
  const sheet = book.Sheets[sheetName];
  if (!sheet) return [];
  const raw = xlsx.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return raw.slice(0, SHEET_ROW_CAP).map((row) =>
    (Array.isArray(row) ? row : []).slice(0, SHEET_COL_CAP).map((cell) => (cell == null ? "" : String(cell)))
  );
}

function SheetView({ url }: { url: string }): JSX.Element {
  const bookRef = useRef<import("xlsx").WorkBook | null>(null);
  const xlsxRef = useRef<typeof import("xlsx") | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    setRows(null);
    setFailed(false);
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then(async (buffer) => {
        const xlsx = await import("xlsx");
        const book = xlsx.read(buffer, { type: "array" });
        if (gone) return;
        const first = book.SheetNames[0] ?? "";
        bookRef.current = book;
        xlsxRef.current = xlsx;
        setNames(book.SheetNames);
        setName(first);
        setRows(sheetRows(xlsx, book, first));
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [url]);
  function choose(next: string): void {
    const xlsx = xlsxRef.current;
    const book = bookRef.current;
    if (!xlsx || !book) return;
    setName(next);
    setRows(sheetRows(xlsx, book, next));
  }
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-card px-12 py-10">
        <p className="text-sm text-foreground">Could not open the sheet</p>
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >
          Open
        </a>
      </div>
    );
  }
  const width = Math.max(1, ...((rows ?? []).map((row) => row.length)));
  return (
    <div className="flex h-[85vh] w-[min(72rem,90vw)] flex-col overflow-hidden rounded-lg bg-white">
      {names.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2">
          {names.map((sheetName) => (
            <button
              key={sheetName}
              type="button"
              onClick={() => choose(sheetName)}
              className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                sheetName === name ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {rows ? (
          <table className="w-max min-w-full border-collapse text-left text-sm text-foreground">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-muted/60 font-medium" : undefined}>
                  {Array.from({ length: width }, (_, colIndex) => (
                    <td key={colIndex} className="border border-border px-3 py-1.5 align-top">
                      {row[colIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

function FileBody({ item }: { item: ShelfFile }): JSX.Element {
  const url = item.preview ?? "";
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (item.openAs !== "text" || !url) return;
    let gone = false;
    void fetch(url)
      .then((res) => res.text())
      .then((body) => {
        if (!gone) setText(body.slice(0, 20000));
      })
      .catch(() => {
        if (!gone) setText("");
      });
    return () => {
      gone = true;
    };
  }, [item.openAs, url]);
  if (item.video) {
    return (
      <video src={url} controls autoPlay playsInline className="max-h-[85vh] max-w-[90vw] rounded-lg bg-black" />
    );
  }
  if (item.audio) {
    return <audio src={url} controls autoPlay className="w-[min(32rem,90vw)]" />;
  }
  if (item.openAs === "pdf") {
    return <iframe title="Document" src={url} className="h-[85vh] w-[min(64rem,90vw)] rounded-lg bg-white" />;
  }
  if (item.face === "sheet") {
    return <SheetView url={url} />;
  }
  if (item.openAs === "text") {
    return (
      <pre className="max-h-[85vh] w-[min(48rem,90vw)] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-6 text-sm text-foreground">
        {text ?? ""}
      </pre>
    );
  }
  if (item.openAs === "file" || item.face || item.page) {
    const label = item.face === "sheet" ? "Sheet" : item.face === "slides" ? "Slides" : "Document";
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-card px-12 py-10">
        <p className="text-sm text-foreground">{label}</p>
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground"
        >
          Open
        </a>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" />
  );
}

function FileView({ item, onClose }: { item: ShelfFile; onClose: () => void }): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-label={
        item.video ? "Video" : item.audio ? "Audio" : item.face === "sheet" ? "Sheet" : item.openAs === "pdf" || item.face ? "Document" : "Photo"
      }
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="animate-in fade-in zoom-in-95 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <FileBody item={item} />
      </div>
      <button
        ref={closeRef}
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}

type ResourceGroup = "all" | "photo" | "video" | "audio" | "file" | "link";

const RESOURCE_GROUPS: Array<{ id: ResourceGroup; label: string; icon: typeof ImageIcon }> = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "photo", label: "Photos", icon: ImageIcon },
  { id: "video", label: "Video", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "file", label: "Files", icon: FileText },
  { id: "link", label: "Links", icon: Link2 },
];

function resourceGroup(item: ShelfFile): Exclude<ResourceGroup, "link"> {
  if (item.video) return "video";
  if (item.audio) return "audio";
  if (item.page || item.face) return "file";
  return "photo";
}

function emptyCopy(group: ResourceGroup): string {
  if (group === "photo") return "No photos yet.";
  if (group === "video") return "No videos yet.";
  if (group === "audio") return "No audio yet.";
  if (group === "file") return "No files yet.";
  if (group === "link") return "No links yet.";
  return "Nothing here yet.";
}

function closedCount(files: number, linkCount: number): string {
  if (files > 0 && linkCount === 0) return files === 1 ? "1 file" : `${files} files`;
  if (linkCount > 0 && files === 0) return linkCount === 1 ? "1 link" : `${linkCount} links`;
  const total = files + linkCount;
  return total === 1 ? "1 item" : `${total} items`;
}

function LinkMenuButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Copy;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {label}
    </button>
  );
}

function LinkRow({
  item,
  onRemove,
}: {
  item: ResourceLink;
  onRemove: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!open) return;
    function place(): void {
      const rect = nameRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 300;
      let left = rect.right + 10;
      if (left + width > window.innerWidth - 12) left = Math.max(12, rect.left - width - 10);
      const top = Math.max(12, Math.min(rect.top - 4, window.innerHeight - 240));
      setSpot({ top, left });
    }
    place();
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    function onPointer(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (nameRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function openLink(): void {
    window.open(item.url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }
  const action = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";
  const mark = linkMark(item.url);
  const menu =
    open && spot
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Link"
            style={{ top: spot.top, left: spot.left }}
            className="fixed z-[70] w-[18.75rem] rounded-xl border border-border bg-card p-3 shadow-xl"
          >
            <p className="break-all text-xs leading-5 text-foreground">{item.url}</p>
            <div className="mt-2 border-t border-border pt-1">
              <LinkMenuButton label="Open" icon={ExternalLink} onClick={openLink} />
              <LinkMenuButton label={copied ? "Copied" : "Copy"} icon={copied ? Check : Copy} onClick={() => void copy()} />
              <LinkMenuButton
                label="Remove"
                icon={X}
                onClick={() => {
                  onRemove();
                  setOpen(false);
                }}
              />
            </div>
          </div>,
          document.body
        )
      : null;
  return (
    <div className={`flex items-center gap-0.5 rounded-md px-1 py-1 hover:bg-muted/60 ${open ? "bg-muted/60" : ""}`}>
      <button
        ref={nameRef}
        type="button"
        aria-expanded={open}
        aria-label={mark.detail ? `${mark.host}${mark.detail}` : mark.host}
        onClick={() => setOpen((current) => !current)}
        className="min-w-0 flex-1 rounded text-left"
      >
        <span className="block truncate text-xs text-primary">{mark.host}</span>
        {mark.detail ? <span className="block truncate text-[10px] leading-4 text-muted-foreground">{mark.detail}</span> : null}
      </button>
      <button type="button" aria-label={copied ? "Copied" : "Copy link"} onClick={() => void copy()} className={action}>
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open link" className={action}>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <button type="button" aria-label="Remove link" onClick={onRemove} className={action}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}

export function ScrapShelf({
  items,
  links = [],
  dropping = false,
  dropProps,
  onAdd,
  onRemove,
  onPut,
  onRemoveLink,
  folded = false,
}: {
  items: readonly ShelfFile[];
  links?: readonly ResourceLink[];
  dropping?: boolean;
  dropProps?: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPut: (id: string) => void;
  onRemoveLink?: (id: string) => void;
  folded?: boolean;
}): JSX.Element {
  const [group, setGroup] = useState<ResourceGroup>("all");
  const [open, setOpen] = useState(() => items.length > 0 || links.length > 0);
  const known = useRef<Set<string> | null>(null);
  const expanded = open && !folded;
  useEffect(() => {
    const next = new Set(items.map((item) => item.id));
    if (known.current) {
      const fresh = items.find((item) => !known.current?.has(item.id));
      if (fresh) {
        setGroup("all");
        setOpen(true);
      }
    }
    known.current = next;
  }, [items]);
  const shown = group === "all" ? items : items.filter((item) => resourceGroup(item) === group);
  const pileEmpty = group === "all" ? items.length === 0 && links.length === 0 : group === "link" ? links.length === 0 : shown.length === 0;
  return (
    <aside
      aria-label="Resources"
      {...dropProps}
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r transition-[width,background-color,box-shadow] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        dropping ? "bg-card ring-2 ring-inset ring-primary" : "border-border bg-card"
      } ${expanded ? "w-64 duration-500" : folded ? "w-16 duration-200" : "w-16 duration-500"}`}
    >
      {expanded ? (
        <div className="border-b border-border px-3 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Add a file"
              onClick={onAdd}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <p className="text-[11px] font-medium text-foreground">Resources</p>
          </div>
          <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">Add a file, or drag & drop</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label="Add a file"
            onClick={onAdd}
            className="mx-auto mt-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <p className="mt-2 px-1 text-center text-[10px] leading-3 text-muted-foreground">
            Add a file,
            <br />
            or drag
            <br />
            & drop
          </p>
          {items.length + links.length === 0 ? null : (
            <p className="mt-2 px-1 text-center text-[10px] leading-3 text-muted-foreground">{closedCount(items.length, links.length)}</p>
          )}
        </>
      )}
      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded ? "opacity-100 duration-500" : "pointer-events-none opacity-0 duration-200"
        }`}
      >
        <div className="mt-3 flex justify-between px-2">
          {RESOURCE_GROUPS.map((item) => {
            const Icon = item.icon;
            const selected = item.id === group;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setGroup(item.id)}
                className="group flex flex-1 flex-col items-center gap-1"
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground group-hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className={`whitespace-nowrap text-[10px] leading-none ${selected ? "font-medium text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-4">
          {(group === "link" || group === "all") && links.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {links.map((item) => (
                <LinkRow key={item.id} item={item} onRemove={() => onRemoveLink?.(item.id)} />
              ))}
            </div>
          ) : null}
          {group !== "link" ? (
            <div className="grid grid-cols-2 gap-2">
              {shown.map((item) => (
                <ShelfTile
                  key={item.id}
                  item={item}
                  large
                  onRemove={() => onRemove(item.id)}
                  onPlace={() => onPut(item.id)}
                  removeLabel="Remove file"
                />
              ))}
            </div>
          ) : null}
          {pileEmpty ? (
            <p className="my-auto px-3 text-center text-[11px] leading-4 text-muted-foreground">{emptyCopy(group)}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide resources" : "Show resources"}
        onClick={() => setOpen(!expanded)}
        className="mx-auto mb-3 mt-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted"
      >
        {expanded ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
      </button>
    </aside>
  );
}

export function useSheetFileDrop(onFiles: (files: File[]) => void): {
  over: boolean;
  dropProps: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
} {
  const [over, setOver] = useState(false);

  function hasFiles(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  return {
    over,
    dropProps: {
      onDragEnter: (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setOver(true);
      },
      onDragOver: (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
      },
      onDragLeave: (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOver(false);
      },
      onDrop: (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files ?? []));
      },
    },
  };
}

export function PhotoControl({
  preview,
  video = false,
  audio = false,
  page = false,
  fileLabel,
  onPick,
  onRemove,
  inputRef,
}: {
  preview: string | null;
  video?: boolean;
  audio?: boolean;
  page?: boolean;
  fileLabel: string;
  onPick: (file: File | undefined) => void;
  onRemove?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {preview || onRemove ? (
        <span className="relative h-12 w-12 shrink-0">
          {page ? (
            <span
              aria-label="Document"
              className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          {audio ? (
            <span
              aria-label="Audio"
              className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <AudioLines className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          {preview && !video && !page && !audio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-12 w-12 rounded-md object-cover" />
          ) : null}
          {preview && video ? (
            <video src={preview} muted playsInline className="h-12 w-12 rounded-md object-cover" />
          ) : null}
          {!preview && !page && !audio ? <span className="block h-12 w-12 rounded-md bg-muted" /> : null}
          {onRemove ? (
            <button
              type="button"
              aria-label="Remove file"
              onClick={onRemove}
              className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background"
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ) : null}
      <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        <input
          ref={inputRef}
          type="file"
          aria-label={fileLabel}
          accept={FILE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
