"use client";

/**
 * Content board (soc-04, soc-05, soc-15, soc-17, soc-18, soc-21).
 * A card is added from the column it belongs in. Ready asks for the file.
 * Each column filters and sorts on its own, for this sitting.
 * Expand opens that column over the board, grouped by topic.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Link2, Maximize2, MoreHorizontal, Paperclip, Plus, X } from "lucide-react";
import {
  IdeaNote,
  PhotoControl,
  ScrapShelf,
  TagPicker,
  fileFace,
  fileOpen,
  placeFile,
  placeLink,
  normalizeLink,
  stripFile,
  stripLink,
  type ResourceLink,
  FILE_ACCEPT,
  SCRAP_CAP,
  scrapKind,
  useSheetFileDrop,
  type ShelfFile,
} from "./idea-composer";
import { SocialCardPanel } from "./SocialCardPanel";
import { loadSocialBoard, peekSocialCards } from "./social-board-cache";
import {
  attachSocialCardFile,
  createReadySocialCard,
  createSocialCard,
  deleteSocialCard,
  duplicateSocialCard,
  addSocialCardScrap,
  moveSocialCard,
  socialFileIssue,
  socialFileKind,
  updateSocialCard,
  type SocialCard,
  type SocialCardFormat,
} from "./social-cards";

type ColumnSort = "latest" | "az" | "free";

type Lanes = Record<string, string[]>;

const SETTLE = "cubic-bezier(0.2, 0, 0, 1)";

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: SETTLE,
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
    className: { dragOverlay: "social-drop" },
  }),
};

function cardKey(id: UniqueIdentifier): string | null {
  const value = String(id);
  return value.startsWith("card:") ? value.slice("card:".length) : null;
}

function columnKey(id: UniqueIdentifier): string | null {
  const value = String(id);
  return value.startsWith("column:") ? value.slice("column:".length) : null;
}

export function laneOf(lanes: Lanes, cardId: string): string | null {
  return Object.keys(lanes).find((key) => lanes[key].includes(cardId)) ?? null;
}

/** Puts the card into another column, above or below the card it is over, or last. */
export function moveAcross(
  lanes: Lanes,
  cardId: string,
  toColumn: string,
  overCardId: string | null,
  below: boolean
): Lanes {
  const from = laneOf(lanes, cardId);
  if (!from || from === toColumn || !lanes[toColumn]) return lanes;
  const target = lanes[toColumn].filter((id) => id !== cardId);
  const at = overCardId ? target.indexOf(overCardId) : -1;
  target.splice(at < 0 ? target.length : at + (below ? 1 : 0), 0, cardId);
  return { ...lanes, [from]: lanes[from].filter((id) => id !== cardId), [toColumn]: target };
}

export function moveWithin(lane: readonly string[], cardId: string, overCardId: string): string[] {
  const from = lane.indexOf(cardId);
  const to = lane.indexOf(overCardId);
  if (from < 0 || to < 0 || from === to) return [...lane];
  return arrayMove([...lane], from, to);
}

const FORMAT_TAGS: readonly { id: SocialCardFormat; label: string }[] = [
  { id: "post", label: "Post" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
];

function columnTagOptions(cards: readonly SocialCard[]): { value: string; label: string }[] {
  const topics = Array.from(
    new Set(
      cards
        .map((card) => card.topic?.trim())
        .filter((topic): topic is string => Boolean(topic))
    )
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  const formats = FORMAT_TAGS.filter((format) => cards.some((card) => card.format === format.id));
  return [
    { value: "all", label: "All" },
    ...topics.map((topic) => ({ value: `topic:${topic}`, label: topic })),
    ...formats.map((format) => ({ value: `format:${format.id}`, label: format.label })),
  ];
}

function matchesTag(card: SocialCard, tag: string): boolean {
  if (tag.startsWith("topic:")) return card.topic?.trim() === tag.slice("topic:".length);
  if (tag.startsWith("format:")) return card.format === tag.slice("format:".length);
  return true;
}

function orderedCards(
  cards: readonly SocialCard[],
  sort: ColumnSort,
  manual?: readonly string[]
): SocialCard[] {
  const next = [...cards];
  if (sort === "free") {
    const rank = new Map((manual ?? next.map((card) => card.id)).map((id, index) => [id, index]));
    next.sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
    return next;
  }
  if (sort === "az") {
    next.sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
    );
    return next;
  }
  next.sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
  return next;
}

type LocalScrap = ShelfFile & { file: File };

function NewIdeaDialog({
  column,
  columns,
  topics,
  busy,
  error,
  onColumn,
  onClose,
  onAdd,
}: {
  column: BoardColumn;
  columns: readonly BoardColumn[];
  topics: readonly string[];
  busy: boolean;
  error: string | null;
  onColumn: (columnId: string) => void;
  onClose: () => void;
  onAdd: (draft: {
    title: string;
    topic: string;
    link: string;
    note: string;
    file: File | null;
    scraps: LocalScrap[];
    links: ResourceLink[];
  }) => void;
}): JSX.Element {
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [line, setLine] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [scraps, setScraps] = useState<LocalScrap[]>([]);
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [askLink, setAskLink] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const needsFile = column.kind === "ready";
  const dump = column.kind === "thoughts";
  const kind = file ? socialFileKind(file) : null;
  const { over, dropProps } = useSheetFileDrop((next) => takeFiles(next));

  useEffect(() => {
    titleRef.current?.focus();
  }, [column.id]);

  useEffect(() => {
    if (scraps.every((scrap) => scrap.preview)) return;
    setScraps((current) =>
      current.map((scrap) =>
        scrap.preview
          ? scrap
          : {
              ...scrap,
              preview: URL.createObjectURL(scrap.file),
              openAs: scrap.openAs ?? fileOpen(scrap.file.name, scrap.file.type) ?? "file",
            }
      )
    );
  }, [scraps]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!file || (kind !== "photo" && kind !== "video")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, kind]);

  useEffect(() => {
    if (!file) return;
    const issue = socialFileIssue(file, needsFile);
    if (!issue) return;
    setFile(null);
    setFileError(issue);
  }, [file, needsFile]);

  function takeFile(next: File | undefined): void {
    if (!next) return;
    const issue = socialFileIssue(next, needsFile);
    if (issue) {
      setFile(null);
      setFileError(issue);
      return;
    }
    setFileError(null);
    setFile(next);
  }

  function keepScrap(next: File): LocalScrap | null {
    const issue = socialFileIssue(next);
    if (issue) {
      setFileError(issue);
      return null;
    }
    const savedKind = socialFileKind(next);
    return {
      id: crypto.randomUUID(),
      file: next,
      preview: URL.createObjectURL(next),
      video: savedKind === "video",
      audio: savedKind === "audio",
      page: savedKind === "document",
      face: savedKind === "document" ? (fileFace(next.name, next.type) ?? "page") : null,
      openAs: savedKind === "document" ? (fileOpen(next.name, next.type) ?? "file") : null,
    };
  }

  function takeFiles(list: File[]): void {
    if (!dump) {
      takeFile(list[0]);
      return;
    }
    const held = [...scraps];
    const added: LocalScrap[] = [];
    let overflow = false;
    for (const next of list) {
      const kind = socialFileKind(next);
      if (kind && held.filter((item) => scrapKind(item) === kind).length >= SCRAP_CAP) {
        overflow = true;
        continue;
      }
      const scrap = keepScrap(next);
      if (!scrap) continue;
      held.push(scrap);
      added.push(scrap);
    }
    if (overflow) setFileError("The pile is full");
    else if (added.length > 0) setFileError(null);
    if (added.length === 0) return;
    setScraps((current) => [...current, ...added]);
    const placed = insertAt.current;
    if (placed !== null) {
      setNote((current) => placeFile(current, added[0].id, placed));
      insertAt.current = null;
    }
  }

  function removeScrap(id: string): void {
    setScraps((current) => {
      const found = current.find((item) => item.id === id);
      if (found?.preview) URL.revokeObjectURL(found.preview);
      return current.filter((item) => item.id !== id);
    });
    setNote((current) => stripFile(current, id));
  }

  function addResourceLink(url: string): void {
    setFileError((current) => (current === "Use a link" ? null : current));
    const next = normalizeLink(url);
    if (!next) return;
    setLinks((current) =>
      current.some((item) => item.url === next) ? current : [...current, { id: crypto.randomUUID(), url: next }]
    );
  }

  function removeResourceLink(id: string): void {
    setLinks((current) => current.filter((item) => item.id !== id));
    setNote((current) => stripLink(current, id));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-label={`Add to ${column.label}`}
      onMouseDown={onClose}
    >
      <div
        className="relative h-[calc(100vh-6rem)] w-[min(60rem,max(40rem,calc(100vw-34rem)))] max-w-[calc(100vw-2rem)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-xl bg-card shadow-2xl ${
          over ? "ring-2 ring-primary" : ""
        }`}
      >
      {dump ? (
        <ScrapShelf
          items={scraps}
          links={links}
          asking={askLink}
          dropping={over}
          dropProps={dropProps}
          onAdd={() => fileRef.current?.click()}
          onRemove={removeScrap}
          onPut={(id) => setNote((current) => placeFile(current, id, line))}
          onAddLink={addResourceLink}
          onRemoveLink={removeResourceLink}
          onPutLink={(id) => setNote((current) => placeLink(current, id, line))}
        />
      ) : null}
      <form
        className="flex w-[min(60rem,max(40rem,calc(100vw-34rem)))] max-w-[calc(100vw-2rem)] shrink-0 flex-col"
        {...dropProps}
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({ title, topic, link, note, file, scraps: dump ? scraps : [], links: dump ? links : [] });
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3">
          <select
            aria-label={`Column for ${column.label}`}
            value={column.id}
            onChange={(event) => onColumn(event.target.value)}
            className="h-8 max-w-[14rem] truncate bg-transparent text-sm font-medium text-foreground outline-none"
          >
            {columns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-1">
            {topic.trim() ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-foreground">
                {topic.trim()}
                <button
                  type="button"
                  aria-label="Remove tag"
                  onClick={() => setTopic("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            <TagPicker
              topic={topic}
              topics={topics}
              onChange={setTopic}
              searchLabel="Topic for the new card"
            />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-6 pb-2">
          <input
            ref={titleRef}
            aria-label={`Title for ${column.label}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A short title"
            maxLength={200}
            className="w-full bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {linkOpen ? (
            <input
              aria-label="Link for the new card"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://"
              maxLength={500}
              className="mt-3 h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          ) : null}
          <IdeaNote
            value={note}
            onChange={setNote}
            onPhoto={(index) => {
              insertAt.current = index;
              fileRef.current?.click();
            }}
            onLink={() => (dump ? setAskLink(true) : setLinkOpen(true))}
            onLine={setLine}
            onDropResource={(kind, id, at) =>
              setNote((current) => (kind === "file" ? placeFile(current, id, at) : placeLink(current, id, at)))
            }
            files={scraps}
            links={links}
          />
          {fileError || error ? (
            <p className="text-sm text-destructive" role="alert">
              {fileError || error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          {dump ? (
            <input
              ref={fileRef}
              type="file"
              multiple
              aria-label="File"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                takeFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          ) : (
          <PhotoControl
            preview={file && kind !== "document" ? previewUrl : null}
            video={kind === "video"}
            audio={kind === "audio"}
            page={kind === "document"}
            fileLabel={needsFile ? "File for Ready" : "File"}
            onPick={takeFile}
            onRemove={file ? () => setFile(null) : undefined}
            inputRef={fileRef}
          />
          )}
          <button
            type="submit"
            disabled={busy || title.trim().length === 0 || (needsFile && !file)}
            className="ml-auto h-9 shrink-0 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>
      </div>
      </div>
    </div>,
    document.body,
  );
}

function topicNames(cards: readonly SocialCard[]): string[] {
  return Array.from(
    new Set(cards.map((card) => card.topic?.trim()).filter((topic): topic is string => Boolean(topic)))
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function topicGroups(
  cards: readonly SocialCard[]
): { key: string; label: string; cards: SocialCard[] }[] {
  const buckets = new Map<string, SocialCard[]>();
  cards.forEach((card) => {
    const key = card.topic?.trim() ?? "";
    const list = buckets.get(key) ?? [];
    list.push(card);
    buckets.set(key, list);
  });
  return Array.from(buckets.keys())
    .sort((left, right) => {
      if (left === "") return -1;
      if (right === "") return 1;
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    })
    .map((key) => ({
      key,
      label: key === "" ? "No topic" : key,
      cards: buckets.get(key) ?? [],
    }));
}

type BoardColumn = {
  id: string;
  kind: "thoughts" | "chosen" | "making" | "ready";
  label: string;
};

const OPENING_COLUMNS: readonly BoardColumn[] = [
  { id: "thoughts", kind: "thoughts", label: "Thoughts and ideas" },
  { id: "chosen", kind: "chosen", label: "Chosen" },
  { id: "making", kind: "making", label: "Making" },
  { id: "ready", kind: "ready", label: "Ready" },
];

export function cardDrop(
  card: Pick<SocialCard, "stage" | "hasFile" | "postable"> & { fileKind?: SocialCard["fileKind"] },
  kind: BoardColumn["kind"],
): "stay" | "needs-file" | "needs-media" | "needs-format" | "move" {
  const home = card.stage === "custom" ? "thoughts" : card.stage;
  if (home === kind) return "stay";
  if (kind === "ready" && !card.hasFile) return "needs-file";
  if (kind === "ready" && (card.fileKind === "document" || card.fileKind === "audio")) return "needs-media";
  if (kind === "ready" && card.postable === false) return "needs-format";
  return "move";
}

function readyBlock(
  card: Pick<SocialCard, "stage" | "hasFile" | "postable"> & { fileKind?: SocialCard["fileKind"] },
  kind: BoardColumn["kind"],
): string | null {
  const drop = cardDrop(card, kind);
  if (drop === "needs-file") return "Ready needs a file";
  if (drop === "needs-media") return "Ready needs a photo or a video";
  if (drop === "needs-format") return "Ready needs a JPEG, PNG, WebP, MP4, or MOV";
  return null;
}

function placedCard(card: SocialCard, kind: BoardColumn["kind"]): SocialCard {
  return {
    ...card,
    stage: kind,
    columnId: null,
    hasFile: card.hasFile,
    scheduledAt: kind === "ready" ? card.scheduledAt : null,
  };
}

function cardsInColumn(column: BoardColumn, cards: readonly SocialCard[]): SocialCard[] {
  return cards.filter((card) => {
    if (card.stage === "posted") return false;
    if (card.stage === "custom") return column.kind === "thoughts";
    return card.stage === column.kind;
  });
}

function CardFace({
  card,
  columns,
  selecting,
  picked,
  onOpen,
  onToggle,
  onPick,
  onDelete,
  onDuplicate,
  onMove,
  dragging,
  handle,
}: {
  card: SocialCard;
  columns: readonly BoardColumn[];
  selecting: boolean;
  picked: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onPick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (columnId: string) => void;
  dragging?: boolean;
  handle?: {
    setNodeRef: (element: HTMLElement | null) => void;
    listeners: ReturnType<typeof useSortable>["listeners"];
    attributes: ReturnType<typeof useSortable>["attributes"];
    style?: CSSProperties;
  };
}): JSX.Element {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const holdStill = (event: { stopPropagation: () => void }) => event.stopPropagation();
  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent): void {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);
  const moves = columns.filter(
    (column) => column.kind !== card.stage && (column.kind !== "ready" || card.hasFile)
  );
  return (
    <li
      ref={handle?.setNodeRef}
      style={handle?.style}
      {...handle?.listeners}
      className={`group relative select-none rounded-lg border px-3.5 py-3 ${
        dragging
          ? "border-dashed border-primary/50 bg-primary/[0.06]"
          : picked
            ? "border-primary/50 bg-primary/[0.06]"
            : "border-border bg-background hover:border-primary/25"
      }`}
    >
      <div className={dragging ? "invisible" : undefined}>
        <div className="flex items-start gap-2">
          {selecting ? (
            <button
              type="button"
              aria-pressed={picked}
              aria-label={`Select ${card.title}`}
              onPointerDown={holdStill}
              onMouseDown={holdStill}
              onClick={onToggle}
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                picked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              {picked ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
            </button>
          ) : null}
          <button
            type="button"
            className={`min-w-0 flex-1 text-left text-sm font-medium leading-5 text-foreground line-clamp-2 ${
              menu ? "pr-7" : "group-hover:pr-7 group-focus-within:pr-7 [@media(hover:none)]:pr-7"
            }`}
            {...(selecting ? {} : handle?.attributes)}
            onClick={selecting ? onToggle : onOpen}
          >
            {card.title}
          </button>
          <div className="absolute right-2 top-3 z-10" ref={menuRef}>
            <button
              type="button"
              aria-label={`Card menu for ${card.title}`}
              aria-expanded={menu}
              onPointerDown={holdStill}
              onMouseDown={holdStill}
              onTouchStart={holdStill}
              onClick={() => setMenu((open) => !open)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-background text-muted-foreground transition-opacity duration-150 hover:bg-muted hover:text-foreground ${
                menu
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
              }`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menu ? (
              <div
                role="menu"
                aria-label={`Card menu for ${card.title}`}
                className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onPick();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Select
                </button>
                <div className="my-1 border-t border-border" />
                <p className="px-3 pb-1 pt-1.5 text-xs text-muted-foreground">Move to</p>
                {moves.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onMove(column.id);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {column.label}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onDuplicate();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <CardMarks card={card} />
      </div>
    </li>
  );
}

function CardMarks({ card }: { card: SocialCard }): JSX.Element | null {
  if (!card.topic && !card.hasFile && !card.sourceUrl) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {card.topic ? (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          {card.topic}
        </span>
      ) : null}
      {card.hasFile ? (
        <span role="img" aria-label="File attached" className="inline-flex text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}
      {card.sourceUrl ? (
        <span role="img" aria-label="Inspiration saved" className="inline-flex text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

function LiftedCard({ card }: { card: SocialCard }): JSX.Element {
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLifted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`h-full w-full cursor-grabbing select-none rounded-lg border bg-background px-3.5 py-3 text-sm font-medium text-foreground transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] [.social-drop_&]:scale-100 [.social-drop_&]:shadow-sm ${
        lifted
          ? "scale-[1.03] border-primary/40 shadow-[0_14px_32px_-8px_rgba(30,86,224,0.30)]"
          : "border-border shadow-sm"
      }`}
    >
      <p className="min-w-0 line-clamp-2 leading-5">{card.title}</p>
      <CardMarks card={card} />
    </div>
  );
}

function BoardCard({
  card,
  columns,
  selecting,
  picked,
  onOpen,
  onToggle,
  onPick,
  onDelete,
  onDuplicate,
  onMove,
  lifting,
}: {
  card: SocialCard;
  columns: readonly BoardColumn[];
  selecting: boolean;
  picked: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onPick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (columnId: string) => void;
  lifting?: boolean;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card:${card.id}`,
    animateLayoutChanges,
    transition: { duration: 220, easing: SETTLE },
    disabled: selecting,
  });
  return (
    <CardFace
      card={card}
      columns={columns}
      selecting={selecting}
      picked={picked}
      onOpen={onOpen}
      onToggle={onToggle}
      onPick={onPick}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onMove={onMove}
      dragging={lifting || isDragging}
      handle={{
        setNodeRef,
        listeners: selecting ? undefined : listeners,
        attributes: selecting ? undefined : attributes,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}

function DropColumn({
  columnId,
  label,
  state,
  children,
}: {
  columnId: string;
  label: string;
  state: "idle" | "target" | "blocked";
  children: ReactNode;
}): JSX.Element {
  const { setNodeRef } = useDroppable({ id: `column:${columnId}` });
  const tone =
    state === "target"
      ? "bg-primary/[0.05] ring-1 ring-inset ring-primary/25"
      : state === "blocked"
        ? "bg-muted/40 ring-1 ring-inset ring-destructive/30"
        : "bg-muted/40";
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`relative flex h-full min-h-[22rem] flex-col rounded-lg transition-[background-color,box-shadow] duration-200 md:min-h-0 ${tone}`}
    >
      {children}
      {state === "blocked" ? (
        <p className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-destructive/30 bg-background px-3 py-1 text-xs text-destructive shadow-sm">
          Ready needs a file
        </p>
      ) : null}
    </section>
  );
}

function sameBoard(current: readonly SocialCard[], baseline: readonly SocialCard[]): boolean {
  if (current.length !== baseline.length) return false;
  return current.every((card, index) => {
    const other = baseline[index];
    return (
      other !== undefined &&
      card.id === other.id &&
      card.stage === other.stage &&
      card.title === other.title &&
      card.updatedAt === other.updatedAt
    );
  });
}

function BoardSkeleton(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <p className="sr-only" role="status">
        Loading cards.
      </p>
      <div
        aria-hidden="true"
        className="grid min-h-[22rem] flex-1 grid-cols-1 gap-3 md:min-h-0 md:grid-cols-2 md:grid-rows-2 xl:grid-cols-4 xl:grid-rows-1"
      >
        {OPENING_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex h-full min-h-[22rem] flex-col rounded-lg bg-muted/40 md:min-h-0"
          >
            <div className="flex items-center gap-1 px-2 py-2">
              <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
                {column.label}
              </p>
              <span className="h-5 w-5 motion-safe:animate-pulse rounded-full bg-background" />
            </div>
            <div className="flex flex-col gap-2 px-2 py-1">
              <div className="h-14 motion-safe:animate-pulse rounded-lg border border-border bg-background/80" />
              <div className="h-14 w-4/5 motion-safe:animate-pulse rounded-lg border border-border bg-background/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SocialBoard({
  token,
  openCardId = null,
  revision = 0,
}: {
  token: string;
  openCardId?: string | null;
  revision?: number;
}): JSX.Element {
  const [cards, setCards] = useState<SocialCard[]>([]);
  const columns = OPENING_COLUMNS;
  const [adding, setAdding] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(openCardId);
  const panelRef = useRef<HTMLDivElement>(null);
  const moveTicket = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<Partial<Record<string, string>>>({});
  const [sorts, setSorts] = useState<Partial<Record<string, ColumnSort>>>({});
  const [orders, setOrders] = useState<Partial<Record<string, string[]>>>({});
  const [lanes, setLanes] = useState<Lanes | null>(null);
  const lanesRef = useRef<Lanes | null>(null);
  const lastOverRef = useRef<UniqueIdentifier | null>(null);
  const itemCache = useRef<Record<string, string[]>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const collide = useCallback<CollisionDetection>((args) => {
    const current = lanesRef.current;
    const columnHit = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((item) => columnKey(item.id) !== null),
    })[0];
    if (!columnHit || !current) {
      return lastOverRef.current ? [{ id: lastOverRef.current }] : [];
    }
    const ids = current[columnKey(columnHit.id) ?? ""] ?? [];
    const keys = new Set(ids.map((id) => `card:${id}`));
    const nearest =
      ids.length > 0
        ? closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((item) => keys.has(String(item.id))),
          })[0]
        : undefined;
    const hit = nearest ?? columnHit;
    lastOverRef.current = hit.id;
    return [hit];
  }, []);

  const load = useCallback(async () => {
    const next = await loadSocialBoard(token, { fresh: true });
    setCards(next);
  }, [token]);

  useLayoutEffect(() => {
    let cancelled = false;
    const known = peekSocialCards(token);
    const baseline = known ?? [];
    if (known) {
      setCards(known);
      setLoading(false);
    } else {
      setLoading(true);
    }
    loadSocialBoard(token, { fresh: revision > 0 })
      .then((next) => {
        if (cancelled) return;
        if (revision > 0) {
          setCards(next);
          return;
        }
        setCards((current) => (sameBoard(current, baseline) ? next : current));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load cards");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, revision]);

  function openAdd(columnId: string) {
    setAdding(columnId);
    setOpenId(null);
    setError(null);
  }

  async function addCard(
    column: BoardColumn,
    draft: {
      title: string;
      topic: string;
      link: string;
      note: string;
      file: File | null;
      scraps: LocalScrap[];
      links: ResourceLink[];
    }
  ) {
    const nextTitle = draft.title.trim();
    const nextTopic = draft.topic.trim();
    const typedLink = draft.link.trim();
    const nextLink = typedLink ? normalizeLink(typedLink) ?? "" : "";
    const nextNote = draft.note.trim();
    if (!nextTitle || busy) return;
    if (column.kind === "ready" && !draft.file) return;
    if (typedLink && !nextLink) {
      setError("Use a link");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created =
        column.kind === "ready" && draft.file
          ? await createReadySocialCard(token, nextTitle, draft.file)
          : column.kind === "thoughts" || column.kind === "chosen" || column.kind === "making"
            ? await createSocialCard(token, nextTitle, column.kind)
            : null;
      let savedNote = nextNote;
      if (created && column.kind === "thoughts") {
        for (const scrap of draft.scraps) {
          const saved = await addSocialCardScrap(token, created.id, scrap.file);
          savedNote = savedNote.split(`!file:${scrap.id}`).join(`!file:${saved.id}`);
        }
      } else if (created && draft.file && column.kind !== "ready") {
        await attachSocialCardFile(token, created.id, draft.file);
      }
      const savedLinks = column.kind === "thoughts" ? draft.links : [];
      if (created && (nextTopic || nextLink || savedNote || savedLinks.length > 0)) {
        await updateSocialCard(token, created.id, {
          ...(nextTopic ? { topic: nextTopic } : {}),
          ...(savedLinks.length > 0 ? { links: savedLinks } : nextLink ? { sourceUrl: nextLink } : {}),
          ...(savedNote ? { words: { note: savedNote } } : {}),
        });
      }
      setAdding(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the idea");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, columnId: string): Promise<boolean> {
    const column = columns.find((item) => item.id === columnId);
    const previous = cards.find((item) => item.id === id);
    if (!column || !previous) return false;
    const ticket = (moveTicket.current[id] ?? 0) + 1;
    moveTicket.current[id] = ticket;
    setError(null);
    setCards((current) =>
      current.map((item) => (item.id === id ? placedCard(item, column.kind) : item))
    );
    try {
      const saved = await moveSocialCard(token, id, column.kind);
      if (moveTicket.current[id] !== ticket) return true;
      setCards((current) =>
        current.map((item) =>
          item.id === id
            ? { ...saved, scraps: saved.scraps?.length ? saved.scraps : item.scraps }
            : item
        )
      );
      return true;
    } catch (err: unknown) {
      if (moveTicket.current[id] !== ticket) return true;
      setCards((current) => current.map((item) => (item.id === id ? previous : item)));
      setError(err instanceof Error ? err.message : "Could not move the card");
      return false;
    }
  }

  async function removeCard(id: string) {
    const previous = cards.find((item) => item.id === id);
    if (!previous) return;
    setError(null);
    setCards((current) => current.filter((item) => item.id !== id));
    setPicked((current) => current?.filter((item) => item !== id) ?? null);
    if (openId === id) setOpenId(null);
    try {
      await deleteSocialCard(token, id);
    } catch (err: unknown) {
      setCards((current) => [previous, ...current.filter((item) => item.id !== id)]);
      setPicked((current) => (current ? Array.from(new Set([...current, id])) : current));
      setError(err instanceof Error ? err.message : "Could not delete the card");
    }
  }

  async function copyCard(id: string) {
    setError(null);
    try {
      await duplicateSocialCard(token, id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not duplicate the card");
    }
  }

  function startSelect(id: string): void {
    setOpenId(null);
    setPicked((current) => Array.from(new Set([...(current ?? []), id])));
  }

  function togglePick(id: string): void {
    setPicked((current) => {
      if (!current) return current;
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function selectVisible(): void {
    const source = expanded ? columns.filter((column) => column.id === expanded) : columns;
    setPicked(source.flatMap((column) => viewFor(column).shown.map((card) => card.id)));
  }

  async function movePicked(columnId: string): Promise<void> {
    const column = columns.find((item) => item.id === columnId);
    if (!column || !picked?.length) return;
    const chosen = cards.filter((card) => picked.includes(card.id));
    const blocked = chosen.filter((card) => readyBlock(card, column.kind));
    const moving = chosen.filter((card) => cardDrop(card, column.kind) === "move");
    const pending = moving.map((card) => move(card.id, columnId));
    if (blocked.length > 0) {
      setPicked(blocked.map((card) => card.id));
      setError(readyBlock(blocked[0], column.kind));
    } else {
      setPicked(null);
    }
    const results = await Promise.all(pending);
    const failed = moving.filter((_, index) => results[index] === false);
    if (failed.length === 0) return;
    setPicked((current) =>
      Array.from(new Set([...(current ?? []), ...failed.map((card) => card.id)]))
    );
  }

  async function deletePicked(): Promise<void> {
    if (!picked?.length) return;
    const ids = [...picked];
    setPicked(null);
    await Promise.all(ids.map((id) => removeCard(id)));
  }

  function restingShown(column: BoardColumn): SocialCard[] {
    const inColumn = cardsInColumn(column, cards);
    const selectedTag = tags[column.id] ?? "all";
    const tagOptions = columnTagOptions(inColumn);
    const activeTag = tagOptions.some((option) => option.value === selectedTag) ? selectedTag : "all";
    return orderedCards(
      inColumn.filter((card) => matchesTag(card, activeTag)),
      sorts[column.id] ?? "latest",
      orders[column.id]
    );
  }

  function overColumn(current: Lanes, overId: UniqueIdentifier): string | null {
    const overCardId = cardKey(overId);
    return overCardId ? laneOf(current, overCardId) : columnKey(overId);
  }

  function endDrag(): void {
    lanesRef.current = null;
    lastOverRef.current = null;
    setLanes(null);
    setDraggingId(null);
    setBlocked(null);
  }

  function onDragStart(event: DragStartEvent): void {
    const cardId = cardKey(event.active.id);
    if (!cardId) return;
    const start: Lanes = Object.fromEntries(
      columns.map((column) => [column.id, restingShown(column).map((card) => card.id)])
    );
    lanesRef.current = start;
    lastOverRef.current = event.active.id;
    setLanes(start);
    setDraggingId(cardId);
  }

  function onDragOver({ active, over }: DragOverEvent): void {
    const cardId = cardKey(active.id);
    const current = lanesRef.current;
    if (!cardId || !over || !current) return;
    const toColumn = overColumn(current, over.id);
    const fromColumn = laneOf(current, cardId);
    const card = cards.find((item) => item.id === cardId);
    const target = columns.find((column) => column.id === toColumn);
    if (!toColumn || !fromColumn || !card || !target) return;
    if (readyBlock(card, target.kind)) {
      setBlocked(toColumn);
      return;
    }
    setBlocked(null);
    if (toColumn === fromColumn) return;
    const overCardId = cardKey(over.id);
    const moving = active.rect.current.translated;
    const below = Boolean(
      overCardId && moving && moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2
    );
    const next = moveAcross(current, cardId, toColumn, overCardId, below);
    lanesRef.current = next;
    setLanes(next);
  }

  function onDragEnd({ active, over }: DragEndEvent): void {
    const cardId = cardKey(active.id);
    const current = lanesRef.current;
    endDrag();
    if (!cardId || !current) return;
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const dropColumn = over ? columns.find((column) => column.id === overColumn(current, over.id)) : null;
    if (dropColumn) {
      const block = readyBlock(card, dropColumn.kind);
      if (block) {
        setError(block);
        return;
      }
    }
    const columnId = laneOf(current, cardId);
    const target = columns.find((column) => column.id === columnId);
    if (!columnId || !target) return;
    const overCardId = over ? cardKey(over.id) : null;
    const next =
      overCardId && current[columnId].includes(overCardId)
        ? moveWithin(current[columnId], cardId, overCardId)
        : current[columnId];
    const drop = cardDrop(card, target.kind);
    if (drop === "needs-file" || drop === "needs-media" || drop === "needs-format") return;
    const resting = restingShown(target).map((item) => item.id);
    const sameOrder =
      next.length === resting.length && next.every((id, index) => id === resting[index]);
    if (drop === "stay" && sameOrder) return;
    setSorts((value) => ({ ...value, [target.id]: "free" }));
    setOrders((value) => ({ ...value, [target.id]: next }));
    setError(null);
    if (drop === "move") void move(card.id, target.id);
  }

  function sortableItems(columnId: string, shown: readonly SocialCard[]): string[] {
    const keys = shown.map((card) => `card:${card.id}`);
    const cached = itemCache.current[columnId];
    if (cached && cached.length === keys.length && cached.every((key, index) => key === keys[index])) {
      return cached;
    }
    itemCache.current[columnId] = keys;
    return keys;
  }

  const dragging = cards.find((card) => card.id === draggingId) ?? null;
  const landingColumn = lanes && draggingId ? laneOf(lanes, draggingId) : null;

  function viewFor(column: BoardColumn): {
    tagOptions: { value: string; label: string }[];
    activeTag: string;
    sort: ColumnSort;
    shown: SocialCard[];
  } {
    const inColumn = cardsInColumn(column, cards);
    const tagOptions = columnTagOptions(inColumn);
    const selectedTag = tags[column.id] ?? "all";
    const activeTag = tagOptions.some((option) => option.value === selectedTag)
      ? selectedTag
      : "all";
    const sort = sorts[column.id] ?? "latest";
    const shown = lanes
      ? (lanes[column.id] ?? []).flatMap((id) => {
          const found = cards.find((item) => item.id === id);
          return found ? [found] : [];
        })
      : restingShown(column);
    return {
      tagOptions,
      activeTag,
      sort,
      shown,
    };
  }

  function toggleGroup(key: string): void {
    setOpenGroups((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  const open = cards.find((card) => card.id === openId) ?? null;
  const addingColumn = columns.find((column) => column.id === adding) ?? null;
  const expandedColumn = columns.find((column) => column.id === expanded) ?? null;
  const expandedView = expandedColumn ? viewFor(expandedColumn) : null;
  const pickedCards = picked ? cards.filter((card) => picked.includes(card.id)) : [];
  const readyNeedsFile = pickedCards.some((card) => !card.hasFile);
  const selectionBar = picked ? (
    <div
      role="toolbar"
      aria-label="Selected cards"
      className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <span className="text-sm font-medium text-foreground">{`${pickedCards.length} selected`}</span>
      <button
        type="button"
        onClick={selectVisible}
        className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Select all
      </button>
      {pickedCards.length > 0 ? (
        <>
          <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Move to</span>
          {columns.map((column) => {
            const readyBlocked = column.kind === "ready" && readyNeedsFile;
            const nothingToMove = pickedCards.every(
              (card) => cardDrop(card, column.kind) !== "move"
            );
            if (nothingToMove && !readyBlocked) return null;
            return (
              <button
                key={column.id}
                type="button"
                aria-label={
                  readyBlocked ? "Ready needs a file" : `Move selected to ${column.label}`
                }
                disabled={readyBlocked}
                onClick={() => void movePicked(column.id)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground hover:bg-muted disabled:opacity-40"
              >
                {column.label}
              </button>
            );
          })}
          {readyNeedsFile ? (
            <span className="text-xs text-muted-foreground">Ready needs a file</span>
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        disabled={pickedCards.length === 0}
        onClick={() => void deletePicked()}
        className="rounded-md px-2 py-1 text-sm text-destructive hover:bg-muted disabled:opacity-40"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={() => setPicked(null)}
        className="ml-auto rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Done
      </button>
    </div>
  ) : null;

  useEffect(() => {
    if (!picked) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setPicked(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  useEffect(() => {
    if (openCardId) setOpenId(openCardId);
  }, [openCardId]);

  useEffect(() => {
    if (!openId) return;
    panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId, cards]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && !addingColumn ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {addingColumn ? (
        <NewIdeaDialog
          column={addingColumn}
          columns={columns}
          topics={topicNames(cards)}
          busy={busy}
          error={error}
          onColumn={setAdding}
          onClose={() => {
            setAdding(null);
            setError(null);
          }}
          onAdd={(draft) => void addCard(addingColumn, draft)}
        />
      ) : null}

      {loading && cards.length === 0 ? (
        <BoardSkeleton />
      ) : (
        <>
          {open && !expandedColumn ? (
            <div ref={panelRef}>
              <SocialCardPanel
                key={open.id}
                token={token}
                card={open}
                columns={columns}
                topics={topicNames(cards)}
                readyDrop={cardDrop(open, "ready")}
                onMove={(columnId) => void move(open.id, columnId)}
                onDelete={() => void removeCard(open.id)}
                onClose={() => setOpenId(null)}
                onSaved={load}
              />
            </div>
          ) : null}
          {expandedColumn && expandedView
            ? createPortal(
            <div className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/40 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-label={expandedColumn.label}
                className="my-8 w-full max-w-3xl rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-foreground">{expandedColumn.label}</h2>
                  <button
                    type="button"
                    onClick={() => setExpanded(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Close column
                  </button>
                </div>
                {selectionBar}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="text-xs text-muted-foreground">
                    Tags
                    <select
                      aria-label={`Tags for ${expandedColumn.label}`}
                      value={expandedView.activeTag}
                      onChange={(event) =>
                        setTags((current) => ({
                          ...current,
                          [expandedColumn.id]: event.target.value,
                        }))
                      }
                      className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                      {expandedView.tagOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Sort
                    <select
                      aria-label={`Sort for ${expandedColumn.label}`}
                      value={expandedView.sort}
                      onChange={(event) => {
                        const value = event.target.value as ColumnSort;
                        if (value === "free") {
                          setOrders((current) => ({
                            ...current,
                            [expandedColumn.id]: expandedView.shown.map((card) => card.id),
                          }));
                        }
                        setSorts((current) => ({ ...current, [expandedColumn.id]: value }));
                      }}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                      <option value="latest">Latest</option>
                      <option value="az">A to Z</option>
                      <option value="free">Free</option>
                    </select>
                  </label>
                </div>
                {open ? (
                  <div ref={panelRef} className="mt-3">
                    <SocialCardPanel
                      key={open.id}
                      token={token}
                      card={open}
                      columns={columns}
                      topics={topicNames(cards)}
                      readyDrop={cardDrop(open, "ready")}
                      onMove={(columnId) => void move(open.id, columnId)}
                      onDelete={() => void removeCard(open.id)}
                      onClose={() => setOpenId(null)}
                      onSaved={load}
                    />
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  {topicGroups(expandedView.shown).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Empty.</p>
                  ) : (
                    topicGroups(expandedView.shown).map((group) => {
                      const groupOpen = openGroups.includes(group.key);
                      return (
                        <section key={group.key} className="rounded-md border border-border">
                          <button
                            type="button"
                            aria-expanded={groupOpen}
                            aria-label={group.label}
                            onClick={() => toggleGroup(group.key)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground"
                          >
                            <span>{group.label}</span>
                            <span aria-hidden="true">{group.cards.length}</span>
                          </button>
                          {groupOpen ? (
                            <ul className="flex flex-col gap-2 border-t border-border p-3">
                              {group.cards.map((card) => (
                                <CardFace
                                  key={card.id}
                                  card={card}
                                  columns={columns}
                                  selecting={picked !== null}
                                  picked={picked?.includes(card.id) ?? false}
                                  onOpen={() => setOpenId(card.id)}
                                  onToggle={() => togglePick(card.id)}
                                  onPick={() => startSelect(card.id)}
                                  onDelete={() => void removeCard(card.id)}
                                  onDuplicate={() => void copyCard(card.id)}
                                  onMove={(columnId) => void move(card.id, columnId)}
                                />
                              ))}
                            </ul>
                          ) : null}
                        </section>
                      );
                    })
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
            : null}
          {expandedColumn ? null : (
          <>
          {selectionBar}
          <DndContext
            sensors={sensors}
            collisionDetection={collide}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragCancel={endDrag}
            onDragEnd={onDragEnd}
          >
          <div className="grid min-h-[22rem] flex-1 grid-cols-1 gap-3 md:min-h-0 md:grid-cols-2 md:grid-rows-2 xl:grid-cols-4 xl:grid-rows-1">
          {columns.map((column) => {
            const view = viewFor(column);
            return (
              <DropColumn
                key={column.id}
                columnId={column.id}
                label={column.label}
                state={
                  blocked === column.id ? "blocked" : landingColumn === column.id ? "target" : "idle"
                }
              >
                <div className="flex items-center gap-1 px-2 py-2">
                  <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
                    {column.label}
                  </h2>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs text-muted-foreground">
                    {view.shown.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Expand ${column.label}`}
                    onClick={() => {
                      setExpanded(column.id);
                      setOpenGroups([]);
                      setMenuId(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Add to ${column.label}`}
                    aria-expanded={adding === column.id}
                    onClick={() => openAdd(column.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Column menu for ${column.label}`}
                    aria-expanded={menuId === column.id}
                    onClick={() =>
                      setMenuId((current) => (current === column.id ? null : column.id))
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {menuId === column.id ? (
                  <div className="space-y-2 border-t border-border/60 px-3 py-2">
                    <label className="block text-xs text-muted-foreground">
                      Tags
                      <select
                        aria-label={`Tags for ${column.label}`}
                        value={view.activeTag}
                        onChange={(event) =>
                          setTags((current) => ({ ...current, [column.id]: event.target.value }))
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      >
                        {view.tagOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      Sort
                      <select
                        aria-label={`Sort for ${column.label}`}
                        value={view.sort}
                        onChange={(event) => {
                          const value = event.target.value as ColumnSort;
                          if (value === "free") {
                            setOrders((current) => ({
                              ...current,
                              [column.id]: view.shown.map((card) => card.id),
                            }));
                          }
                          setSorts((current) => ({ ...current, [column.id]: value }));
                        }}
                        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      >
                        <option value="latest">Latest</option>
                        <option value="az">A to Z</option>
                        <option value="free">Free</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                <SortableContext
                  id={column.id}
                  items={sortableItems(column.id, view.shown)}
                  strategy={verticalListSortingStrategy}
                >
                <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1">
                  {view.shown.map((card) => (
                    <BoardCard
                      key={card.id}
                      card={card}
                      columns={columns}
                      selecting={picked !== null}
                      picked={picked?.includes(card.id) ?? false}
                      lifting={draggingId === card.id}
                      onOpen={() => setOpenId(card.id)}
                      onToggle={() => togglePick(card.id)}
                      onPick={() => startSelect(card.id)}
                      onDelete={() => void removeCard(card.id)}
                      onDuplicate={() => void copyCard(card.id)}
                      onMove={(columnId) => void move(card.id, columnId)}
                    />
                  ))}
                  <li className="flex justify-center px-2 py-1">
                    <button
                      type="button"
                      onClick={() => openAdd(column.id)}
                      className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      Add new
                    </button>
                  </li>
                </ul>
                </SortableContext>
              </DropColumn>
            );
          })}
          </div>
          <DragOverlay dropAnimation={dropAnimation}>
            {dragging ? <LiftedCard card={dragging} /> : null}
          </DragOverlay>
          </DndContext>
          </>
          )}
        </>
      )}
    </div>
  );
}
