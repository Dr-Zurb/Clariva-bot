"use client";

import { useEffect, useLayoutEffect, useState, useRef, type DragEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, AudioLines, Check, ChevronLeft, ChevronRight, Columns2, Copy, ExternalLink, FileText, Film, GripVertical, Heading, Image as ImageIcon, LayoutGrid, Link2, List, Minus, Paperclip, Presentation, Table2, Tag, X } from "lucide-react";

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

type LineKind = "text" | "heading" | "list" | "file" | "link" | "rule" | "cols" | "split" | "endcols";

type NoteLine = { kind: LineKind; body: string; done?: boolean };

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
  video?: boolean;
  audio?: boolean;
  page?: boolean;
  face?: FileFace | null;
  openAs?: FileOpen | null;
};

export function placeFile(note: string, id: string, line: number): string {
  if (note.includes(`!file:${id}`)) return note;
  const lines = splitNote(note);
  const at = Math.min(Math.max(line, 0), lines.length);
  const marker: NoteLine = { kind: "file", body: id };
  if (lines[at]?.kind === "text" && lines[at].body === "") lines[at] = marker;
  else lines.splice(at + 1, 0, marker);
  const joined = joinNote(lines);
  return joined.length > 1000 ? note : joined;
}

export function stripFile(note: string, id: string): string {
  const lines = splitNote(note).filter((line) => !(line.kind === "file" && line.body === id));
  return joinNote(lines.length > 0 ? lines : [{ kind: "text", body: "" }]);
}

const MENU = [
  { id: "heading", label: "Heading", icon: Heading },
  { id: "list", label: "List", icon: List },
  { id: "columns", label: "Columns", icon: Columns2 },
  { id: "rule", label: "Divider", icon: Minus },
  { id: "file", label: "File", icon: Paperclip },
  { id: "link", label: "Link", icon: Link2 },
] as const;

const LINE_DRAG = "application/x-clariva-line";
export const LIFT_DRAG = "application/x-clariva-lift";

function parseLine(line: string): NoteLine {
  if (line === "!cols") return { kind: "cols", body: "" };
  if (line === "!|") return { kind: "split", body: "" };
  if (line === "!/") return { kind: "endcols", body: "" };
  if (line === "!hr") return { kind: "rule", body: "" };
  if (line.startsWith("!file:")) return { kind: "file", body: line.slice(6) };
  if (line.startsWith("!link:")) return { kind: "link", body: line.slice(6) };
  if (line.startsWith("# ")) return { kind: "heading", body: line.slice(2) };
  if (line.startsWith("- [x] ") || line === "- [x]") return { kind: "list", body: line.slice(6), done: true };
  if (line.startsWith("- [ ] ") || line === "- [ ]") return { kind: "list", body: line.slice(6), done: false };
  if (line.startsWith("- ")) return { kind: "list", body: line.slice(2), done: false };
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
  return joined.length > 1000 ? note : joined;
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
  | { type: "columns"; at: number; left: number[]; right: number[] };

function noteSegments(lines: readonly NoteLine[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.kind === "cols") {
      const left: number[] = [];
      const right: number[] = [];
      let side = left;
      const at = i;
      i += 1;
      while (i < lines.length && lines[i]?.kind !== "endcols") {
        if (lines[i]?.kind === "split") side = right;
        else if (isContent(lines[i])) side.push(i);
        i += 1;
      }
      if (lines[i]?.kind === "endcols") i += 1;
      out.push({ type: "columns", at, left, right });
    } else if (lines[i]?.kind === "split" || lines[i]?.kind === "endcols") {
      i += 1;
    } else {
      out.push({ type: "line", index: i });
      i += 1;
    }
  }
  return out;
}

export function joinNote(lines: readonly NoteLine[]): string {
  return lines
    .map((line) => {
      if (line.kind === "file") return `!file:${line.body}`;
      if (line.kind === "link") return `!link:${line.body}`;
      if (line.kind === "heading") return `# ${line.body}`;
      if (line.kind === "list") return line.done ? `- [x] ${line.body}` : `- [ ] ${line.body}`;
      if (line.kind === "rule") return "!hr";
      if (line.kind === "cols") return "!cols";
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

export function IdeaNote({
  value,
  onChange,
  onPhoto,
  onLink,
  onLine,
  onDropResource,
  files = [],
  links = [],
}: {
  value: string;
  onChange: (value: string) => void;
  onPhoto: (line: number) => void;
  onLink: () => void;
  onLine?: (line: number) => void;
  onDropResource?: (kind: "file" | "link", id: string, line: number) => void;
  files?: readonly ShelfFile[];
  links?: readonly ResourceLink[];
}): JSX.Element {
  const lines = splitNote(value);
  const inputs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [overLine, setOverLine] = useState<number | null>(null);
  const choices = MENU.filter((item) => item.id !== "columns" || menuAt === null || !insideColumns(lines, menuAt));

  useLayoutEffect(() => {
    for (const node of inputs.current) {
      if (!node) continue;
      node.style.height = "0px";
      node.style.height = `${node.scrollHeight}px`;
    }
  }, [value]);

  function write(next: NoteLine[]): void {
    const joined = joinNote(next);
    if (joined.length > 1000) return;
    onChange(joined);
  }

  function focusLine(index: number): void {
    window.setTimeout(() => inputs.current[index]?.focus(), 0);
  }

  function removeLine(index: number): void {
    const side = columnSide(lines, index);
    const onlyInSide = Boolean(side && side.length <= 1);
    const onlyInNote = lines.filter(isContent).length <= 1;
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
    for (let i = index - 1; i >= 0; i -= 1) {
      const kind = lines[i]?.kind;
      if (kind === "text" || kind === "heading" || kind === "list") {
        focusLine(i);
        break;
      }
    }
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

  function pick(id: (typeof MENU)[number]["id"], index: number): void {
    setMenuAt(null);
    if (id === "file") {
      onPhoto(index);
      return;
    }
    if (id === "link") {
      onLink();
      return;
    }
    if (id === "columns") {
      if (insideColumns(lines, index)) return;
      const current = lines[index] ?? { kind: "text" as const, body: "" };
      const left: NoteLine = isContent(current) ? current : { kind: "text", body: "" };
      const next = lines.slice();
      next.splice(index, 1, { kind: "cols", body: "" }, left, { kind: "split", body: "" }, { kind: "text", body: "" }, { kind: "endcols", body: "" });
      write(next);
      const focusAt = left.kind === "text" || left.kind === "heading" || left.kind === "list" ? index + 1 : index + 3;
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
    const next = lines.slice();
    next[index] = { kind: id === "heading" ? "heading" : "list", body: "", done: false };
    write(next);
    focusLine(index);
  }

  function renderLine(index: number): JSX.Element {
    const line = lines[index];
    const writing = line?.kind === "text" || line?.kind === "heading" || line?.kind === "list";
    const bare = lines.length === 1 && lines[0]?.kind === "text" && lines[0].body === "";
    return (
      <div
        key={index}
        data-note-line={index}
        className={`group relative flex min-w-0 items-start gap-1.5 rounded-md ${overLine === index ? "bg-primary/10" : ""}`}
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
          aria-label="Move line"
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData(LINE_DRAG, String(index));
            if (line && line.body.trim() && (line.kind === "text" || line.kind === "heading" || line.kind === "list")) {
              event.dataTransfer.setData(LIFT_DRAG, line.body.trim());
            }
            event.dataTransfer.effectAllowed = "copyMove";
          }}
          className="mt-1 inline-flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
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
        {line?.kind === "file" ? (
          <ShelfTile
            item={files.find((file) => file.id === line.body) ?? { id: line.body, preview: null }}
            onRemove={() => removeLine(index)}
            removeLabel="Remove from the note"
          />
        ) : null}
        {line?.kind === "link" ? (
          <NoteLink url={links.find((item) => item.id === line.body)?.url ?? line.body} onRemove={() => removeLine(index)} />
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
            className="my-2 w-full border-t border-border outline-none"
          />
        ) : null}
        {writing && line ? (
          <textarea
            ref={(node) => {
              inputs.current[index] = node;
            }}
            rows={1}
            aria-label={index === 0 ? "Note" : undefined}
            value={line.body}
            placeholder={bare && index === 0 ? "What's the idea" : ""}
            onChange={(event) => {
              const typed = event.target.value.replace(/\r/g, "");
              if (typed === "/") {
                setMenuAt(index);
                setActive(0);
                return;
              }
              setMenuAt(null);
              if (!typed.includes("\n")) {
                const next = lines.slice();
                next[index] = { ...line, body: typed };
                write(next);
                return;
              }
              const parts = typed.split("\n");
              const next = lines.slice();
              next[index] = { ...line, body: parts[0] };
              const extra: NoteLine[] = parts.slice(1).map((body) =>
                line.kind === "list" ? { kind: "list", body, done: false } : { kind: "text", body }
              );
              next.splice(index + 1, 0, ...extra);
              write(next);
            }}
            onFocus={() => onLine?.(index)}
            onKeyDown={(event) => {
              if (menuAt === index) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMenuAt(null);
                  return;
                }
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const next = lines.slice();
                const kind: LineKind = line.kind === "list" ? "list" : "text";
                next.splice(index + 1, 0, { kind, body: "", done: false });
                write(next);
                focusLine(index + 1);
                return;
              }
              if (event.key === "Backspace" && line.body === "") {
                event.preventDefault();
                if (line.kind !== "text") {
                  const next = lines.slice();
                  next[index] = { kind: "text", body: "" };
                  write(next);
                  return;
                }
                removeLine(index);
              }
            }}
            className={`max-w-full min-w-0 flex-1 resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none placeholder:text-muted-foreground/50 ${
              line.kind === "heading" ? "min-h-7 text-lg font-medium leading-7" : "min-h-6 text-sm leading-6"
            } ${line.kind === "list" && line.done ? "text-muted-foreground line-through" : "text-foreground"}`}
          />
        ) : null}
        {menuAt === index ? (
          <div
            role="menu"
            aria-label="Note options"
            className="absolute left-6 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg"
          >
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
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="relative mt-3 flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto"
      onDragOver={(event) => {
        if (!onDropResource || !hasResourceDrag(event)) return;
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
        if (!onDropResource || !hasResourceDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const resource = readResourceDrag(event);
        const at = lineUnder(event, lines.length);
        setOverLine(null);
        if (resource) onDropResource(resource.kind, resource.id, at);
      }}
    >
      {noteSegments(lines).map((segment) =>
        segment.type === "line" ? (
          renderLine(segment.index)
        ) : (
          <div key={`cols-${segment.at}`} className="grid min-w-0 grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1 border-r border-border pr-3">
              {segment.left.map((index) => renderLine(index))}
            </div>
            <div className="flex min-w-0 flex-col gap-1">{segment.right.map((index) => renderLine(index))}</div>
          </div>
        )
      )}
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

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-foreground hover:bg-muted"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        Tags
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-card p-2 shadow-lg">
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
        </div>
      ) : null}
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
    if (item.preview) setViewing(true);
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

function NoteLink({ url, onRemove }: { url: string; onRemove: () => void }): JSX.Element {
  const mark = linkMark(url);
  const label = mark.detail ? `${mark.host}${mark.detail}` : mark.host;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm text-foreground">
      <a href={url} target="_blank" rel="noreferrer" title={url} className="max-w-[16rem] truncate hover:underline">
        {label}
      </a>
      <button type="button" aria-label="Remove from the note" onClick={onRemove} className="text-muted-foreground">
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
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
  onPlace,
  onRemove,
}: {
  item: ResourceLink;
  onPlace: () => void;
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
                label="Place in the note"
                icon={ArrowRight}
                onClick={() => {
                  onPlace();
                  setOpen(false);
                }}
              />
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
    <div
      className={`flex cursor-grab items-center gap-0.5 rounded-md px-1 py-1 active:cursor-grabbing hover:bg-muted/60 ${
        open ? "bg-muted/60" : ""
      }`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(RESOURCE_DRAG, JSON.stringify({ kind: "link", id: item.id }));
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button
        ref={nameRef}
        type="button"
        aria-expanded={open}
        aria-label={mark.detail ? `${mark.host}${mark.detail}` : mark.host}
        onClick={() => setOpen((current) => !current)}
        className="min-w-0 flex-1 rounded text-left"
      >
        <span className="block truncate text-xs text-foreground">{mark.host}</span>
        {mark.detail ? <span className="block truncate text-[10px] leading-4 text-muted-foreground">{mark.detail}</span> : null}
      </button>
      <button type="button" aria-label={copied ? "Copied" : "Copy link"} onClick={() => void copy()} className={action}>
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open link" draggable={false} className={action}>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <button type="button" aria-label="Place" onClick={onPlace} className={action}>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
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
  asking = false,
  dropping = false,
  dropProps,
  onAdd,
  onRemove,
  onPut,
  onAddLink,
  onRemoveLink,
  onPutLink,
}: {
  items: readonly ShelfFile[];
  links?: readonly ResourceLink[];
  asking?: boolean;
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
  onAddLink?: (url: string) => void;
  onRemoveLink?: (id: string) => void;
  onPutLink?: (id: string) => void;
}): JSX.Element {
  const [group, setGroup] = useState<ResourceGroup>("all");
  const [draft, setDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [open, setOpen] = useState(() => items.length > 0 || links.length > 0);
  const known = useRef<Set<string> | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const expanded = open;
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
  useEffect(() => {
    if (!asking) return;
    setGroup("link");
    setOpen(true);
    linkRef.current?.focus();
  }, [asking]);
  const shown = group === "all" ? items : items.filter((item) => resourceGroup(item) === group);
  const pileEmpty = group === "all" ? items.length === 0 && links.length === 0 : group === "link" ? links.length === 0 : shown.length === 0;
  function addDraft(): void {
    const next = draft.trim();
    if (!next || !onAddLink) return;
    const urls = normalizeLinks(next);
    if (urls.length === 0) {
      setLinkError("Use a link");
      return;
    }
    for (const url of urls) onAddLink(url);
    setDraft("");
    setLinkError(null);
  }
  return (
    <aside
      aria-label="Resources"
      {...dropProps}
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r transition-[width,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        dropping ? "bg-primary/10 ring-2 ring-inset ring-primary" : "border-border bg-muted/30"
      } ${expanded ? "w-64" : "w-16"}`}
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
          <p className="mt-3 whitespace-nowrap text-center text-[10px] leading-3 text-muted-foreground">
            Add a file
            <br />
            or
            <br />
            drag &
            <br />
            drop
          </p>
          {items.length + links.length === 0 ? null : (
            <p className="mt-2 px-1 text-center text-[10px] leading-3 text-muted-foreground">{closedCount(items.length, links.length)}</p>
          )}
        </>
      )}
      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded ? "opacity-100" : "pointer-events-none opacity-0"
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
          {group === "link" ? (
            <div>
              <div className="flex h-8 items-center rounded-md border border-border bg-card pr-1">
                <input
                  ref={linkRef}
                  aria-label="Paste link"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setLinkError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addDraft();
                  }}
                  placeholder="Paste link"
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={addDraft}
                  className="h-6 shrink-0 rounded px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  Add
                </button>
              </div>
              {linkError ? <p className="mt-1 px-1 text-[11px] text-destructive">{linkError}</p> : null}
            </div>
          ) : null}
          {(group === "link" || group === "all") && links.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {links.map((item) => (
                <LinkRow
                  key={item.id}
                  item={item}
                  onPlace={() => onPutLink?.(item.id)}
                  onRemove={() => onRemoveLink?.(item.id)}
                />
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
