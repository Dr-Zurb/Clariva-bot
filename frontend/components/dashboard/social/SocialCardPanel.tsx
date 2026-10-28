"use client";

/**
 * One card (soc-05, soc-16). A thought can take a topic.
 * The stage track moves the card. Chosen keeps the notebook. Ready needs a file.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
import { ArrowLeft, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, EllipsisVertical, ExternalLink, Heart, ImagePlus, Info, Loader2, MessageCircle, Play, Plus, Repeat2, Send, Volume2, VolumeX, X } from "lucide-react";
import { getInstagramStatus } from "@/lib/api";
import {
  FILE_ACCEPT,
  IdeaNote,
  SCRAP_CAP,
  ScrapShelf,
  TagPicker,
  fileFace,
  fileOpen,
  fileOpenFromUrl,
  placeFile,
  placeOnScreen,
  scrapKind,
  splitNote,
  swapFile,
  nameFile,
  forgetLink,
  linksInNote,
  normalizeLink,
  LIFT_DRAG,
  RESOURCE_DRAG,
  readResourceDrag,
  stripFile,
  type ResourceLink,
  useSheetFileDrop,
  type ShelfFile,
} from "./idea-composer";
import {
  addSocialCardFrame,
  addSocialCardScrap,
  attachSocialCardFile,
  getSocialCardFileUrl,
  getSocialCardFrameUrl,
  getSocialCardScrapUrl,
  listSocialCards,
  orderSocialCardFrames,
  removeSocialCardFile,
  removeSocialCardFrame,
  removeSocialCardScrap,
  socialFileIssue,
  socialFileKind,
  cardFileAccept,
  cardFileIssue,
  referenceFileIssue,
  MEDIA_FILE_ACCEPT,
  postsByHand,
  updateSocialCard,
  type SocialCard,
  type SocialFrame,
  type SocialScrap,
  type SocialCardFormat,
  type SocialCardCrop,
  type SocialCardWords,
} from "./social-cards";

const SEND_POLL_MS = 1500;
const SEND_WAIT_MS = 7 * 60 * 1000;
const STILL_SENDING = "Still sending. Once it is up, the card shows as Posted on the Schedule.";

const FORMATS: readonly { id: SocialCardFormat; label: string }[] = [
  { id: "post", label: "Post" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
];

function previewFace(format: SocialCardFormat | "", crop: string | undefined): string {
  const name = FORMATS.find((item) => item.id === format)?.label ?? "Post";
  if (format !== "post") return name;
  const ratio = crop === "square" ? "1:1" : crop === "landscape" ? "16:9" : crop === "original" ? "Original" : "4:5";
  return `${name} · ${ratio}`;
}

function previewAspect(crop: string | undefined, shot: number | null): string | undefined {
  if (crop === "square") return "1 / 1";
  if (crop === "landscape") return "16 / 9";
  if (crop === "original") {
    if (!shot || shot <= 0) return "4 / 5";
    return String(Math.min(1.91, Math.max(0.8, shot)));
  }
  return "4 / 5";
}

type PanelColumn = {
  id: string;
  kind: string;
  label: string;
};

const STAGE_KINDS = ["thoughts", "chosen", "making", "ready"];

function readyStageWarning(
  card: Pick<SocialCard, "hasFile" | "fileKind" | "postable">,
  kind: string,
): string | null {
  if (kind !== "ready") return null;
  if (!card.hasFile) return "Ready needs a file";
  if (card.fileKind === "document" || card.fileKind === "audio" || card.postable === false) {
    return card.postable === false
      ? "Ready needs a JPEG, PNG, WebP, MP4, or MOV"
      : "Ready needs a photo or a video";
  }
  return null;
}

const STAGE_GLIDE = "520ms cubic-bezier(0.22, 1, 0.36, 1)";
const MARGIN = 16;
const SHELF = 64;
const SHELF_ROOM = 192;
const MIN_LEFT = MARGIN + SHELF_ROOM;
const PREVIEW_WANT = 352;
const PREVIEW_FLOOR = 240;
const NOTE_CAP = 800;
const NOTE_FLOOR = 480;

function sheetMeasures(width: number): { note: number; preview: number } {
  if (width <= 0) return { note: 640, preview: PREVIEW_WANT };
  const room = width - MIN_LEFT - MARGIN - SHELF;
  if (room >= NOTE_FLOOR + PREVIEW_WANT) {
    return { note: Math.min(NOTE_CAP, room - PREVIEW_WANT), preview: PREVIEW_WANT };
  }
  if (room >= NOTE_FLOOR + PREVIEW_FLOOR) {
    return { note: NOTE_FLOOR, preview: room - NOTE_FLOOR };
  }
  const tight = Math.max(0, width - MARGIN * 2 - SHELF);
  const preview = Math.min(PREVIEW_WANT, Math.max(PREVIEW_FLOOR, Math.round(tight * 0.34)));
  return { note: Math.max(0, tight - preview), preview };
}

function placeCard(width: number, cardWidth: number): number {
  if (width <= 0) return MARGIN;
  const centered = Math.round((width - cardWidth) / 2);
  if (centered >= MIN_LEFT) return centered;
  if (MIN_LEFT + cardWidth <= width - MARGIN) return MIN_LEFT;
  return Math.max(MARGIN, width - MARGIN - cardWidth);
}

function viewWidth(): number {
  const inner = window.innerWidth;
  const client = document.documentElement?.clientWidth ?? 0;
  if (client <= 0) return inner;
  return Math.min(inner, client);
}

function arrangedSlides<T extends { id: string }>(slides: readonly T[], order: readonly string[] | null): T[] {
  if (!order) return [...slides];
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const next: T[] = [];
  for (const id of order) {
    const slide = byId.get(id);
    if (slide) next.push(slide);
  }
  return next.length === slides.length ? next : [...slides];
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type StagePlace = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

function StageTrack({
  columns,
  currentId,
  onPick,
}: {
  columns: readonly PanelColumn[];
  currentId: string;
  onPick: (columnId: string) => void;
}): JSX.Element {
  const steps = columns.filter((column) => STAGE_KINDS.includes(column.kind));
  const current = steps.findIndex((column) => column.id === currentId);
  const row = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<StagePlace | null>(null);
  const [glideOn, setGlideOn] = useState(false);
  useLayoutEffect(() => {
    const box = row.current;
    const button = box?.querySelector<HTMLElement>(`[data-stage="${currentId}"]`);
    if (!box || !button) return;
    const parent = box.getBoundingClientRect();
    const next = button.getBoundingClientRect();
    const left = next.left - parent.left + box.scrollLeft;
    const top = next.top - parent.top + box.scrollTop;
    const place = {
      left,
      top,
      width: next.width,
      height: next.height,
      right: Math.max(box.clientWidth - left - next.width, 0),
      bottom: Math.max(box.clientHeight - top - next.height, 0),
    };
    setBar((prev) =>
      prev &&
      prev.left === place.left &&
      prev.top === place.top &&
      prev.width === place.width &&
      prev.height === place.height &&
      prev.right === place.right &&
      prev.bottom === place.bottom
        ? prev
        : place
    );
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const again = box.querySelector<HTMLElement>(`[data-stage="${currentId}"]`);
      if (!again) return;
      const parent = box.getBoundingClientRect();
      const next = again.getBoundingClientRect();
      const left = next.left - parent.left + box.scrollLeft;
      const top = next.top - parent.top + box.scrollTop;
      const place = {
        left,
        top,
        width: next.width,
        height: next.height,
        right: Math.max(box.clientWidth - left - next.width, 0),
        bottom: Math.max(box.clientHeight - top - next.height, 0),
      };
      setBar((prev) =>
        prev &&
        prev.left === place.left &&
        prev.top === place.top &&
        prev.width === place.width &&
        prev.height === place.height &&
        prev.right === place.right &&
        prev.bottom === place.bottom
          ? prev
          : place
      );
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [currentId, steps.length]);
  useEffect(() => {
    if (!bar || glideOn) return;
    setGlideOn(true);
  }, [bar, glideOn]);
  const reduce =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const glide =
    glideOn && !reduce
      ? `left ${STAGE_GLIDE}, width ${STAGE_GLIDE}, top ${STAGE_GLIDE}, height ${STAGE_GLIDE}, clip-path ${STAGE_GLIDE}`
      : "none";
  function stepFace(column: PanelColumn, index: number, live: boolean): JSX.Element {
    const here = column.id === currentId;
    const done = current >= 0 && index < current;
    const className = `inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-sm ${
      live
        ? here
          ? "font-medium text-foreground"
          : done
            ? "text-foreground"
            : "text-muted-foreground"
        : here
          ? "font-medium text-primary-foreground"
          : "text-primary-foreground"
    }`;
    const body = (
      <>
        {done ? (
          <Check className={`h-3 w-3 shrink-0 ${live ? "text-primary" : ""}`} aria-hidden="true" />
        ) : null}
        {column.label}
      </>
    );
    return (
      <span key={column.id} className="flex shrink-0 items-center gap-1">
        {index > 0 ? (
          <span aria-hidden="true" className={live ? "text-muted-foreground/40" : "text-primary-foreground"}>
            ›
          </span>
        ) : null}
        {live ? (
          <button
            type="button"
            data-stage={column.id}
            aria-current={here ? "step" : undefined}
            onClick={() => onPick(column.id)}
            className={className}
          >
            {body}
          </button>
        ) : (
          <span className={className}>{body}</span>
        )}
      </span>
    );
  }
  const previous = current > 0 ? steps[current - 1] : null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
    {previous ? (
      <button
        type="button"
        aria-label={`Back to ${previous.label}`}
        onClick={() => onPick(previous.id)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : null}
    <nav ref={row} aria-label="Column" className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {steps.map((column, index) => stepFace(column, index, true))}
      {bar ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md bg-primary"
          style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height, transition: glide }}
        />
      ) : null}
      {bar ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center gap-1"
          style={{
            clipPath: `inset(${bar.top}px ${bar.right}px ${bar.bottom}px ${bar.left}px round 6px)`,
            transition: glide,
          }}
        >
          {steps.map((column, index) => stepFace(column, index, false))}
        </span>
      ) : null}
    </nav>
    </div>
  );
}

type ReadyDrop = "stay" | "needs-file" | "needs-media" | "needs-format" | "move";

function thoughtKey(snap: { title: string; topic: string; note: string; links: ResourceLink[] }): string {
  return JSON.stringify({
    title: snap.title.trim() || "untitled",
    topic: snap.topic,
    note: snap.note,
    links: snap.links.map((item) => `${item.id}|${item.url}`),
  });
}

function readyButton(format: SocialCardFormat | "", drop: ReadyDrop): string {
  if (!format) return "Choose a format";
  if (drop === "needs-file") return "Add a file to mark ready";
  if (drop === "needs-media" || drop === "needs-format") return "Needs a photo or a video";
  return "Mark ready";
}

export function SocialCardPanel({
  token,
  card,
  columns,
  topics = [],
  readyDrop,
  made = false,
  uploading = false,
  onMove,
  onDelete,
  onClose,
  onSaved,
}: {
  token: string;
  card: SocialCard;
  columns: readonly PanelColumn[];
  topics?: readonly string[];
  readyDrop: ReadyDrop;
  /** The preview column only. Set when the file was already made. */
  made?: boolean;
  /** The chosen file is still going up. */
  uploading?: boolean;
  onMove: (columnId: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState(card.title);
  const [format, setFormat] = useState<SocialCardFormat | "">(card.format ?? "");
  const [topic, setTopic] = useState(card.topic ?? "");
  const [link, setLink] = useState(card.sourceUrl ?? "");
  const [links, setLinks] = useState<ResourceLink[]>(() =>
    card.links?.length
      ? card.links
      : card.sourceUrl
        ? [{ id: crypto.randomUUID(), url: card.sourceUrl }]
        : []
  );
  const [words, setWords] = useState<SocialCardWords>(wordsFromCard(card));
  const [note, setNote] = useState(card.words.note ?? "");
  const [extra, setExtra] = useState<SocialScrap[]>(card.scraps ?? []);
  const [pending, setPending] = useState<ShelfFile[]>([]);
  const waitingFiles = useRef(new Map<string, File>());
  const droppedFiles = useRef(new Set<string>());
  const fileNames = useRef(new Map<string, string>());
  const [frames, setFrames] = useState<SocialFrame[]>(card.frames ?? []);
  const [fileId, setFileId] = useState<string | null>(card.fileId ?? null);
  const fileIdRef = useRef<string | null>(card.fileId ?? null);
  const cardIdRef = useRef(card.id);
  cardIdRef.current = card.id;
  const pieceAlias = useRef<string | null>(card.fileId ?? null);
  const orderQueue = useRef<string[] | null>(null);
  const orderBusy = useRef(false);
  const dropQueue = useRef<string[]>([]);
  const dropBusy = useRef(false);
  const [slideOrder, setSlideOrder] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const hiddenRef = useRef<string[]>([]);
  hiddenRef.current = hidden;
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(0);
  const [pictureTick, setPictureTick] = useState(0);
  const [scrapUrls, setScrapUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [postAt, setPostAt] = useState(toLocalInput(card.scheduledAt));
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sent, setSent] = useState<{ url: string | null } | null>(null);
  const [sendIssue, setSendIssue] = useState<string | null | undefined>(undefined);
  const [sendingFile, setSendingFile] = useState(false);
  const [addingPicture, setAddingPicture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMark, setSaveMark] = useState<"idle" | "saving" | "saved">("idle");
  const savedKey = useRef<string | null>(null);
  const saveChain = useRef(Promise.resolve());
  const posterTicket = useRef(0);
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const savedHandNote = useRef((card.words.handNote ?? "").trim());
  useEffect(() => {
    if (card.stage !== "ready") return;
    const value = (words.handNote ?? "").trim();
    if (value === savedHandNote.current) return;
    const id = window.setTimeout(() => {
      const latest = wordsRef.current;
      const next = (latest.handNote ?? "").trim();
      if (next === savedHandNote.current) return;
      const previous = savedHandNote.current;
      savedHandNote.current = next;
      void updateSocialCard(token, card.id, {
        words: wordsForFormat(format, withNote(latest, note)),
      }).catch((err: unknown) => {
        savedHandNote.current = previous;
        setError(err instanceof Error ? err.message : "Could not save the card");
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [card.stage, card.id, words.handNote, token, format, note]);
  const draftRef = useRef({ title, topic, note, links });
  draftRef.current = { title, topic, note, links };
  const [handle, setHandle] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const isThought =
    card.stage === "thoughts" || card.stage === "chosen" || card.stage === "custom";
  const isStudio = card.stage === "making" || card.stage === "ready";
  useEffect(() => {
    if (!isStudio) return;
    let gone = false;
    getInstagramStatus(token)
      .then((res) => {
        const name = res.data.username?.replace(/^@/, "").trim();
        const picture = res.data.pictureUrl;
        if (gone) return;
        if (name) setHandle(name);
        if (typeof picture === "string" && picture.startsWith("https://")) setPhoto(picture);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [isStudio, token]);
  useEffect(() => {
    if ((!isThought && !isStudio) || !card.hasFile) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getSocialCardFileUrl(token, card.id))
      .then((url) => {
        if (!cancelled && url) setPreview(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isThought, isStudio, card.hasFile, card.id, token, pictureTick]);
  const scrapKey = extra.map((scrap) => scrap.id).join(",");
  useEffect(() => {
    if ((!isThought && !isStudio) || extra.length === 0) return;
    let cancelled = false;
    for (const scrap of extra) {
      void getSocialCardScrapUrl(token, card.id, scrap.id)
        .then((url) => {
          if (cancelled) return;
          setScrapUrls((current) => {
            const previous = current[scrap.id];
            if (previous?.startsWith("blob:") && previous !== url) URL.revokeObjectURL(previous);
            return { ...current, [scrap.id]: url };
          });
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [isThought, isStudio, scrapKey, card.id, token, extra]);
  const frameKey = frames.map((frame) => frame.id).join(",");
  useEffect(() => {
    setFrames(card.frames ?? []);
    takeFileId(card.fileId ?? null);
    setSlideOrder(null);
    hiddenRef.current = [];
    setHidden([]);
    dropQueue.current = [];
  }, [card.id]);
  const frameUrlsRef = useRef(frameUrls);
  frameUrlsRef.current = frameUrls;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const slideOrderRef = useRef(slideOrder);
  slideOrderRef.current = slideOrder;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const localUrls = useRef<string[]>([]);
  const retried = useRef(new Map<string, number>());
  const askingFrames = useRef(new Set<string>());
  useEffect(
    () => () => {
      for (const url of localUrls.current) URL.revokeObjectURL(url);
    },
    []
  );
  useEffect(() => {
    if (!isStudio || frames.length === 0) return;
    for (const frame of frames) {
      if (frameUrlsRef.current[frame.id] || askingFrames.current.has(frame.id)) continue;
      askingFrames.current.add(frame.id);
      void getSocialCardFrameUrl(token, card.id, frame.id)
        .then((url) => {
          setFrameUrls((current) => (current[frame.id] ? current : { ...current, [frame.id]: url }));
        })
        .catch(() => undefined)
        .finally(() => askingFrames.current.delete(frame.id));
    }
  }, [isStudio, frameKey, card.id, token, frames]);
  const asksForWords =
    card.stage === "making" || card.stage === "ready" || card.stage === "posted";
  const currentColumnId =
    card.stage === "custom"
      ? (card.columnId ?? "")
      : (columns.find((column) => column.kind === card.stage)?.id ?? "");

  function setWord(key: keyof SocialCardWords, value: string): void {
    setWords((current) => ({ ...current, [key]: value }));
  }

  function setFlag(key: "aiGenerated" | "shareToFeed" | "shareToStory" | "commentsOff", value: boolean): void {
    setWords((current) => ({ ...current, [key]: value }));
  }

  async function choosePoster(byHand: boolean): Promise<void> {
    const locked = postsByHand({ ...words, byHand: false });
    const nextHand = locked || byHand;
    const next: SocialCardWords = { ...words };
    if (nextHand) next.byHand = true;
    else delete next.byHand;
    setWords(next);
    if (card.stage !== "ready") return;
    const ticket = posterTicket.current + 1;
    posterTicket.current = ticket;
    try {
      await updateSocialCard(token, card.id, { words: wordsForFormat(format, withNote(next, note)) });
    } catch (err: unknown) {
      if (posterTicket.current !== ticket) return;
      setError(err instanceof Error ? err.message : "Could not save the card");
    }
  }

  async function markPosted(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, { manualPosted: true });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not mark this posted");
    } finally {
      setBusy(false);
    }
  }

  async function persist(): Promise<boolean> {
    const nextTitle = title.trim();
    const typedLink = link.trim();
    const nextLink = typedLink ? normalizeLink(typedLink) ?? "" : "";
    if (!nextTitle || busy) return false;
    if (typedLink && !nextLink) {
      setError("Use a link");
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      if (isThought) {
        const keepLinks = links.length > 0 || Boolean(card.sourceUrl) || (card.links?.length ?? 0) > 0;
        await updateSocialCard(token, card.id, {
          title: nextTitle,
          topic: topic.trim() || null,
          ...(keepLinks ? { links, sourceUrl: links[0]?.url ?? null } : { sourceUrl: nextLink || null }),
          words: withNote(words, note),
        });
      } else if (!asksForWords) {
        await updateSocialCard(token, card.id, {
          title: nextTitle,
          topic: topic.trim() || null,
          sourceUrl: nextLink || null,
        });
      } else {
        const keepLinks = links.length > 0 || Boolean(card.sourceUrl) || (card.links?.length ?? 0) > 0;
        await updateSocialCard(token, card.id, {
          title: nextTitle,
          format: format || null,
          topic: topic.trim() || null,
          ...(keepLinks ? { links, sourceUrl: links[0]?.url ?? null } : { sourceUrl: nextLink || null }),
          words: wordsForFormat(format, withNote(words, note)),
        });
      }
      await onSaved();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the card");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function saveThought(): Promise<boolean> {
    if (!isThought) return Promise.resolve(true);
    const key = thoughtKey(draftRef.current);
    if (savedKey.current === key) return Promise.resolve(true);
    const run = saveChain.current.then(async () => {
      const latest = draftRef.current;
      const latestTitle = latest.title.trim() || "untitled";
      const latestKey = thoughtKey(latest);
      if (savedKey.current === latestKey) return true;
      setSaveMark("saving");
      try {
        const keepLinks =
          latest.links.length > 0 || Boolean(card.sourceUrl) || (card.links?.length ?? 0) > 0;
        await updateSocialCard(token, card.id, {
          title: latestTitle,
          topic: latest.topic.trim() || null,
          ...(keepLinks
            ? { links: latest.links, sourceUrl: latest.links[0]?.url ?? null }
            : { sourceUrl: null }),
          words: withNote(wordsRef.current, latest.note),
        });
        savedKey.current = latestKey;
        if (!latest.title.trim()) setTitle(latestTitle);
        setSaveMark(thoughtKey(draftRef.current) === latestKey ? "saved" : "saving");
        await onSaved();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not save the card");
        setSaveMark("idle");
        return false;
      }
    });
    saveChain.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  const saveThoughtRef = useRef(saveThought);
  saveThoughtRef.current = saveThought;

  useEffect(() => {
    if (!isThought) return;
    const key = thoughtKey(draftRef.current);
    if (savedKey.current === null) {
      savedKey.current = key;
      return;
    }
    if (key === savedKey.current) return;
    setSaveMark("saving");
    const id = window.setTimeout(() => {
      void saveThoughtRef.current();
    }, 400);
    return () => window.clearTimeout(id);
  }, [isThought, title, topic, note, links]);

  function changeNote(value: string): void {
    setNote(value);
    setLinks((current) => linksInNote(value, current));
  }

  function unchangedThought(): boolean {
    const key = thoughtKey(draftRef.current);
    return savedKey.current === null || savedKey.current === key;
  }

  function dismissThought(): void {
    if (unchangedThought()) {
      onClose();
      return;
    }
    void saveThought().then((ok) => {
      if (ok) onClose();
    });
  }

  function relocateThought(columnId: string): void {
    if (unchangedThought()) {
      onMove(columnId);
      return;
    }
    void saveThought().then((ok) => {
      if (!ok) return;
      onMove(columnId);
    });
  }

  async function markReady(): Promise<void> {
    const ready = columns.find((column) => column.kind === "ready");
    if (!ready || readyDrop !== "move" || busy) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, {
        title: nextTitle,
        format: format || null,
        words: wordsForFormat(format, withNote(words, note)),
      });
      onMove(ready.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the card");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFormat(nextFormat: SocialCardFormat): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, { format: nextFormat });
      setFormat(nextFormat);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the card");
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File | undefined): Promise<void> {
    if (!file || busy) return;
    const issue = cardFileIssue(file, format);
    if (issue) {
      setError(issue);
      return;
    }
    setSendingFile(true);
    setBusy(true);
    setError(null);
    try {
      const saved = await attachSocialCardFile(token, card.id, file);
      if (saved.fileId) takeFileId(saved.fileId);
      if (file.name.trim()) fileNames.current.set(saved.fileId ?? "piece", file.name.trim());
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not attach the file");
    } finally {
      setSendingFile(false);
      setBusy(false);
    }
  }

  async function placeReference(id: string): Promise<void> {
    if (id === "piece" || busy) return;
    const scrap = extra.find((item) => item.id === id);
    if (!scrap) return;
    if (!scrap.postable) {
      setError(
        scrap.fileKind === "photo" || scrap.fileKind === "video"
          ? "Ready needs a JPEG, PNG, WebP, MP4, or MOV"
          : "Ready needs a photo or a video"
      );
      return;
    }
    if (
      card.hasFile &&
      scrap.fileKind === "photo" &&
      (format === "post" || (format === "story" && card.fileKind !== "video"))
    ) {
      if (frames.length + 1 >= 10) {
        setError(format === "story" ? "A story holds ten pictures" : "A post holds ten pictures");
        return;
      }
      setAddingPicture(true);
      setBusy(true);
      setError(null);
      try {
        const url = await getSocialCardScrapUrl(token, card.id, id);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not use the file");
        const blob = await response.blob();
        const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/jpeg";
        const file = new File([blob], "reference.jpg", { type });
        const saved = await addSocialCardFrame(token, card.id, file);
        takeAddedFrame(saved, file);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not use the file");
      } finally {
        setAddingPicture(false);
        setBusy(false);
      }
      return;
    }
    setSendingFile(true);
    setBusy(true);
    setError(null);
    try {
      const url = await getSocialCardScrapUrl(token, card.id, id);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not use the file");
      const blob = await response.blob();
      const video = scrap.fileKind === "video";
      const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : video ? "video/mp4" : "image/jpeg";
      const file = new File([blob], video ? "reference.mp4" : "reference.jpg", { type });
      const saved = await attachSocialCardFile(token, card.id, file);
      if (saved.fileId) takeFileId(saved.fileId);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not use the file");
    } finally {
      setSendingFile(false);
      setBusy(false);
    }
  }

  function pictureIssue(file: File): string | null {
    const issue = socialFileIssue(file);
    if (issue) return issue;
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Use a JPEG, PNG, or WebP";
    }
    return null;
  }

  async function addPicture(file: File | undefined): Promise<void> {
    if (!file || busy) return;
    if (!card.hasFile) {
      await attach(file);
      return;
    }
    const issue = pictureIssue(file);
    if (issue) {
      setError(issue);
      return;
    }
    if (frames.length + 1 >= 10) {
      setError(format === "story" ? "A story holds ten pictures" : "A post holds ten pictures");
      return;
    }
    setAddingPicture(true);
    setBusy(true);
    setError(null);
    try {
      const saved = await addSocialCardFrame(token, card.id, file);
      takeAddedFrame(saved, file);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the picture");
    } finally {
      setAddingPicture(false);
      setBusy(false);
    }
  }

  function takeFileId(nextId: string | null): void {
    fileIdRef.current = nextId;
    pieceAlias.current = nextId;
    setFileId(nextId);
  }

  function takeAddedFrame(saved: SocialCard, file: File): void {
    const known = new Set(frames.map((frame) => frame.id));
    const added = (saved.frames ?? []).find((frame) => !known.has(frame.id));
    if (added && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(file);
      localUrls.current.push(url);
      setFrameUrls((current) => ({ ...current, [added.id]: url }));
    }
    if (saved.fileId) takeFileId(saved.fileId);
    setFrames(saved.frames ?? []);
    setSeen(saved.frames?.length ?? 0);
    void onSaved();
  }

  function refreshPicture(id: string): void {
    const last = retried.current.get(id) ?? 0;
    if (Date.now() - last < 20_000) return;
    retried.current.set(id, Date.now());
    const isFile = id === "piece" || id === fileIdRef.current;
    const request = isFile ? getSocialCardFileUrl(token, card.id) : getSocialCardFrameUrl(token, card.id, id);
    void request
      .then((url) => {
        if (!url) return;
        if (isFile) setPreview(url);
        setFrameUrls((current) => ({ ...current, [id]: url }));
      })
      .catch(() => undefined);
  }

  function hidePicture(id: string): void {
    const coverId = fileIdRef.current ?? "piece";
    const visible = arrangedSlides(
      [
        ...(card.hasFile ? [{ id: coverId }] : []),
        ...framesRef.current.map((frame) => ({ id: frame.id })),
      ],
      slideOrderRef.current
    ).filter((slide) => !hiddenRef.current.includes(slide.id));
    const index = visible.findIndex((slide) => slide.id === id);
    if (index < 0) return;
    const nextCount = visible.length - 1;
    setSeen((value) => {
      if (index < value) return value - 1;
      if (index === value) return Math.max(0, Math.min(value, nextCount - 1));
      return value;
    });
    const nextHidden = hiddenRef.current.includes(id) ? hiddenRef.current : [...hiddenRef.current, id];
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
    if (orderQueue.current) {
      const next = orderQueue.current.filter((slot) => slot !== id);
      orderQueue.current = next.length > 0 ? next : null;
      setSlideOrder(orderQueue.current);
      slideOrderRef.current = orderQueue.current;
    }
    dropQueue.current.push(id);
    setError(null);
    void flushDrops();
  }

  async function flushDrops(): Promise<void> {
    if (dropBusy.current) return;
    const cardId = card.id;
    dropBusy.current = true;
    try {
      while (dropQueue.current.length > 0) {
        if (orderBusy.current || orderQueue.current) break;
        const id = dropQueue.current[0];
        if (!id) break;
        try {
          if (id === "piece" || id === fileIdRef.current) {
            const saved = await removeSocialCardFile(token, cardId);
            if (cardId !== cardIdRef.current) return;
            const nextId = saved.fileId ?? null;
            const nextUrl = nextId ? (frameUrlsRef.current[nextId] ?? null) : null;
            if (nextUrl) setPreview(nextUrl);
            else if (!nextId) setPreview(null);
            else setPictureTick((current) => current + 1);
            takeFileId(nextId);
            setFrames(saved.frames ?? []);
          } else {
            const saved = await removeSocialCardFrame(token, cardId, id);
            if (cardId !== cardIdRef.current) return;
            if (saved.fileId) takeFileId(saved.fileId);
            setFrames(saved.frames ?? []);
          }
          dropQueue.current.shift();
          hiddenRef.current = hiddenRef.current.filter((item) => item !== id);
          setHidden(hiddenRef.current);
          if (dropQueue.current.length === 0) void onSaved();
        } catch (err: unknown) {
          if (cardId !== cardIdRef.current) return;
          dropQueue.current.shift();
          hiddenRef.current = hiddenRef.current.filter((item) => item !== id);
          setHidden(hiddenRef.current);
          setError(err instanceof Error ? err.message : "Could not remove the picture");
        }
      }
    } finally {
      dropBusy.current = false;
    }
  }

  function translateOrder(ids: string[]): string[] {
    const alias = pieceAlias.current;
    if (!alias) return ids;
    return ids.map((id) => (id === "piece" ? alias : id));
  }

  function settleOrder(sent: string[], saved: SocialCard): void {
    const serverIds = [saved.fileId, ...(saved.frames ?? []).map((frame) => frame.id)].filter(
      (id): id is string => Boolean(id)
    );
    const known = new Set(sent.filter((id) => id !== "piece"));
    const assigned = serverIds.find((id) => !known.has(id)) ?? null;
    const oldFileId = sent.includes("piece") ? assigned : fileIdRef.current;
    const nextFileId = saved.fileId ?? null;
    const oldUrl = previewRef.current;
    if (oldFileId && nextFileId && oldFileId !== nextFileId) {
      const nextUrl = frameUrlsRef.current[nextFileId] ?? null;
      setFrameUrls((current) => (oldUrl && !current[oldFileId] ? { ...current, [oldFileId]: oldUrl } : current));
      if (nextUrl) setPreview(nextUrl);
      else setPictureTick((current) => current + 1);
    }
    if (assigned && sent.includes("piece")) pieceAlias.current = assigned;
    fileIdRef.current = nextFileId;
    setFileId(nextFileId);
    setFrames(saved.frames ?? []);
  }

  async function flushOrder(): Promise<void> {
    if (orderBusy.current || !orderQueue.current) return;
    orderBusy.current = true;
    const ids = translateOrder(orderQueue.current);
    orderQueue.current = null;
    try {
      const saved = await orderSocialCardFrames(token, card.id, ids);
      settleOrder(ids, saved);
      if (orderQueue.current) {
        const next = translateOrder(orderQueue.current);
        orderQueue.current = next;
        setSlideOrder(next);
      } else {
        setSlideOrder(null);
        void onSaved();
      }
    } catch (err: unknown) {
      if (!orderQueue.current) {
        setSlideOrder(null);
        setError(err instanceof Error ? err.message : "Could not reorder the pictures");
      }
    } finally {
      orderBusy.current = false;
      if (orderQueue.current) void flushOrder();
      else void flushDrops();
    }
  }

  function reorderSlides(ids: string[], nextSeen: number): void {
    setSlideOrder((current) => (current && current.join("\0") === ids.join("\0") ? current : ids));
    setSeen((current) => (current === nextSeen ? current : nextSeen));
    orderQueue.current = ids;
    setError(null);
    void flushOrder();
  }

  async function saveTime(): Promise<void> {
    if (!postAt || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, {
        scheduledAt: fromLocalInput(postAt),
        words: wordsForFormat(format, withNote(words, note)),
      });
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the time");
    } finally {
      setBusy(false);
    }
  }

  async function postNow(): Promise<void> {
    if (busy || sending) return;
    if (postsByHand(words)) {
      setError("Halo Aid will not send this. You post it from the phone.");
      return;
    }
    setBusy(true);
    setStarting(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, {
        words: wordsForFormat(format, withNote(words, note)),
        postNow: true,
      });
      setSendIssue(null);
      setSending(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not post");
    } finally {
      setStarting(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!sending) return;
    const started = Date.now();
    let stopped = false;
    let timer = 0;
    async function check(): Promise<void> {
      try {
        const found = (await listSocialCards(token)).find((item) => item.id === card.id);
        if (stopped) return;
        if (found?.stage === "posted") {
          setSending(false);
          setSent({ url: found.instagramUrl });
          return;
        }
        if (found?.publishError) {
          setSending(false);
          setSendIssue(found.publishError);
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (Date.now() - started >= SEND_WAIT_MS) {
        setSending(false);
        setError(STILL_SENDING);
        return;
      }
      timer = window.setTimeout(() => void check(), SEND_POLL_MS);
    }
    timer = window.setTimeout(() => void check(), SEND_POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [sending, token, card.id]);

  function closeStudio(): void {
    onClose();
    if (sending || starting || sent) void onSaved();
  }

  async function clearTime(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, { scheduledAt: null });
      setPostAt("");
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not clear the time");
    } finally {
      setBusy(false);
    }
  }

  function removeFile(): void {
    hidePicture(fileIdRef.current ?? "piece");
  }

  function comingFile(file: File): ShelfFile {
    const id = crypto.randomUUID();
    const kind = socialFileKind(file);
    waitingFiles.current.set(id, file);
    if (file.name.trim()) fileNames.current.set(id, file.name.trim());
    return {
      id,
      name: file.name,
      preview: kind === "photo" || kind === "video" ? URL.createObjectURL(file) : null,
      pending: true,
      progress: 0,
      video: kind === "video",
      audio: kind === "audio",
      page: kind === "document",
      face: kind === "document" ? (fileFace(file.name, file.type) ?? "page") : null,
      openAs: kind === "document" ? (fileOpen(file.name, file.type) ?? "file") : null,
    };
  }

  function dropPending(id: string): void {
    droppedFiles.current.add(id);
    waitingFiles.current.delete(id);
    setPending((current) => {
      const found = current.find((item) => item.id === id);
      if (found?.preview?.startsWith("blob:")) URL.revokeObjectURL(found.preview);
      return current.filter((item) => item.id !== id);
    });
    setNote((current) => stripFile(current, id));
  }

  async function addFiles(list: File[], at: number | null): Promise<void> {
    if (busy) return;
    const counts = { photo: 0, video: 0, audio: 0, document: 0 };
    if (card.hasFile) counts[card.fileKind ?? "photo"] += 1;
    for (const scrap of extra) counts[scrap.fileKind ?? "photo"] += 1;
    for (const item of pending) counts[scrapKind(item)] += 1;
    const accepted: File[] = [];
    let overflow = false;
    let refused: string | null = null;
    for (const file of list) {
      const issue =
        format === "post" || format === "reel" || format === "story"
          ? referenceFileIssue(file, format)
          : socialFileIssue(file);
      if (issue) {
        refused = issue;
        continue;
      }
      const kind = socialFileKind(file);
      if (kind && counts[kind] >= SCRAP_CAP) {
        overflow = true;
        continue;
      }
      if (kind) counts[kind] += 1;
      accepted.push(file);
    }
    if (accepted.length === 0) {
      setError(overflow ? "The pile is full" : refused ?? "Use a photo, a video, audio, or a document");
      return;
    }
    if (overflow) setError("The pile is full");
    else if (refused) setError(refused);
    else if (accepted.length === list.length) setError(null);
    const locals = accepted.map((file) => comingFile(file));
    setPending((current) => [...current, ...locals]);
    if (at !== null && locals[0]) setNote((current) => placeFile(current, locals[0].id, at, locals[0].name ?? undefined));
    setBusy(true);
    let savedAny = false;
    try {
      for (const local of locals) {
        const file = waitingFiles.current.get(local.id);
        if (!file) continue;
        try {
          const scrap = await addSocialCardScrap(token, card.id, file, (ratio) => {
            const next = Math.max(0, Math.min(100, Math.round(ratio * 100)));
            setPending((current) => {
              const found = current.find((item) => item.id === local.id);
              if (!found || found.progress === next) return current;
              return current.map((item) => (item.id === local.id ? { ...item, progress: next } : item));
            });
          });
          waitingFiles.current.delete(local.id);
          if (droppedFiles.current.has(local.id)) {
            droppedFiles.current.delete(local.id);
            if (local.preview?.startsWith("blob:")) URL.revokeObjectURL(local.preview);
            await removeSocialCardScrap(token, card.id, scrap.id).catch(() => undefined);
            continue;
          }
          if (file.name.trim()) fileNames.current.set(scrap.id, file.name.trim());
          fileNames.current.delete(local.id);
          setPending((current) => current.filter((item) => item.id !== local.id));
          setExtra((current) => (current.some((item) => item.id === scrap.id) ? current : [...current, scrap]));
          if (local.preview) setScrapUrls((current) => ({ ...current, [scrap.id]: local.preview as string }));
          setNote((current) => nameFile(swapFile(current, local.id, scrap.id), scrap.id, file.name));
          savedAny = true;
        } catch (err: unknown) {
          if (droppedFiles.current.has(local.id)) {
            droppedFiles.current.delete(local.id);
            continue;
          }
          setPending((current) =>
            current.map((item) => (item.id === local.id ? { ...item, pending: false, failed: true } : item))
          );
          setError(err instanceof Error ? err.message : "Could not add the file");
        }
      }
      if (savedAny) await onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string): Promise<void> {
    if (pending.some((item) => item.id === id)) {
      dropPending(id);
      return;
    }
    if (busy) return;
    const nextNote = stripFile(note, id);
    setBusy(true);
    setError(null);
    try {
      if (id === "piece") await removeSocialCardFile(token, card.id);
      else {
        await removeSocialCardScrap(token, card.id, id);
        setExtra((current) => current.filter((scrap) => scrap.id !== id));
      }
      setNote(nextNote);
      await updateSocialCard(token, card.id, { words: withNote(words, nextNote) });
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not remove the file");
    } finally {
      setBusy(false);
    }
  }

  function removeResourceLink(id: string): void {
    const found = linksInNote(note, links).find((item) => item.id === id);
    if (!found) return;
    changeNote(forgetLink(note, found));
  }

  function keptName(id: string): string | undefined {
    const remembered = fileNames.current.get(id);
    if (remembered) return remembered;
    for (const line of splitNote(note)) {
      if (line.kind === "file" && line.body === id && line.name) return line.name;
    }
    return undefined;
  }

  const pieceKind = card.fileKind;
  const pile: ShelfFile[] = [
    ...(card.hasFile
      ? [
          {
            id: "piece",
            name: keptName("piece"),
            preview,
            video: pieceKind === "video" || (preview ? looksLikeVideo(preview) : false),
            audio: pieceKind === "audio" || (preview ? looksLikeAudio(preview) : false),
            page: pieceKind === "document" || (preview ? looksLikeDocument(preview) : false),
            face: preview ? faceFromUrl(preview) : pieceKind === "document" ? "page" : null,
            openAs:
              pieceKind === "document" || (preview ? looksLikeDocument(preview) : false)
                ? (fileOpenFromUrl(preview ?? "") ?? "file")
                : null,
          },
        ]
      : []),
    ...extra.map((scrap) => ({
      id: scrap.id,
      name: keptName(scrap.id),
      preview: scrapUrls[scrap.id] ?? null,
      video: scrap.fileKind === "video",
      audio: scrap.fileKind === "audio",
      page: scrap.fileKind === "document",
      face: scrap.face ?? (scrap.fileKind === "document" ? "page" : null),
      openAs:
        scrap.fileKind === "document"
          ? (fileOpenFromUrl(scrapUrls[scrap.id] ?? "") ?? "file")
          : null,
    })),
    ...pending,
  ];

  const chosen = columns.find((column) => column.kind === "chosen");

  if (isThought || isStudio) {
    return (
      <Composer
        card={card}
        title={title}
        note={note}
        format={format}
        words={words}
        busy={busy}
        error={error}
        preview={preview}
        handle={handle}
        photo={photo}
        topic={topic}
        topics={topics}
        files={isStudio ? pile.filter((item) => item.id !== "piece") : pile}
        links={linksInNote(note, links)}
        columns={columns}
        currentColumnId={currentColumnId}
        studio={isStudio}
        made={made}
        uploading={uploading || sendingFile}
        adding={addingPicture}
        saveMark={saveMark}
        chosenId={chosen?.id ?? null}
        onChoose={relocateThought}
        onRelocate={relocateThought}
        readyDrop={readyDrop}
        postAt={postAt}
        onTitle={setTitle}
        onTopic={setTopic}
        onNote={changeNote}
        onRemoveLink={removeResourceLink}
        onAddFiles={(list, at) => void addFiles(list, at)}
        onRemoveItem={(id) => void removeItem(id)}
        onPut={(id, at) => setNote((current) => placeFile(current, id, at, keptName(id)))}
        onFormat={setFormat}
        onChooseFormat={(next) => void chooseFormat(next)}
        onWord={setWord}
        onFlag={setFlag}
        onByHand={(value) => void choosePoster(value)}
        onMarkPosted={() => void markPosted()}
        onMove={onMove}
        onWarn={setError}
        onMarkReady={() => void markReady()}
        onAttach={(file) => void attach(file)}
        frames={frames}
        frameUrls={frameUrls}
        fileId={fileId}
        slideOrder={slideOrder}
        hidden={hidden}
        seen={seen}
        onSee={setSeen}
        onAddPicture={(file) => void addPicture(file)}
        onRemoveFrame={hidePicture}
        onReorder={reorderSlides}
        onBroken={refreshPicture}
        onUseReference={(id) => void placeReference(id)}
        onRemoveFile={removeFile}
        onPostAt={setPostAt}
        onSaveTime={() => void saveTime()}
        onPostNow={() => void postNow()}
        onClearTime={() => void clearTime()}
        sending={sending || starting}
        sent={sent}
        publishIssue={sending || starting ? null : sendIssue !== undefined ? sendIssue : card.publishError}
        onDelete={onDelete}
        onClose={isThought ? dismissThought : closeStudio}
        onSubmit={() => void (isThought ? saveThought() : persist())}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-label={`Card ${card.title}`}
      onMouseDown={onClose}
    >
      <form
        aria-label={`Card ${card.title}`}
        className="flex h-[min(40rem,calc(100vh-2rem))] w-full max-w-2xl flex-col rounded-xl bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void persist();
        }}
      >
        <div className="flex items-center gap-2 px-5 pt-4">
          <h2 className="mr-auto text-sm font-medium text-foreground">Idea</h2>
          <select
            aria-label={`Move ${card.title}`}
            value={currentColumnId}
            onChange={(event) => {
              if (!event.target.value || event.target.value === currentColumnId) return;
              onMove(event.target.value);
            }}
            className="h-8 max-w-[11rem] rounded-full border border-border bg-background px-3 text-sm text-foreground"
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6">
          <input
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            maxLength={200}
            className="w-full bg-transparent text-3xl font-semibold leading-9 text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <label className="mt-6 block max-w-xs text-xs text-muted-foreground">
            Topic
            <input
              aria-label="Topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Optional tag"
              maxLength={80}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label className="mt-4 block text-xs text-muted-foreground">
            Link
            <input
              aria-label="Link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="Optional inspiration"
              maxLength={500}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>

          {asksForWords ? (
            <div className="mt-6 space-y-4">
              <label className="block text-xs text-muted-foreground">
                Format
                <select
                  aria-label="Format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as SocialCardFormat | "")}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">Choose a format</option>
                  {FORMATS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <WordFields
                format={format}
                words={words}
                busy={busy}
                onWord={setWord}
                onFlag={setFlag}
                onByHand={(value) => void choosePoster(value)}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              The format waits until Making.
            </p>
          )}

          <div className="min-h-8 flex-1" />

          {!card.hasFile ? (
            <label className="mt-6 flex w-44 cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.03]">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              Add the file
              <input
                type="file"
                aria-label={`Attach the file for ${card.title}`}
                accept={cardFileAccept(format)}
                className="sr-only"
                onChange={(event) => {
                  void attach(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          ) : (
            <div className="mt-6 flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-4 py-3">
              <p className="text-sm text-foreground">The file is on this card.</p>
              <button
                type="button"
                onClick={() => void removeFile()}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Remove file
              </button>
            </div>
          )}

          {card.stage === "ready" && card.hasFile ? (
            <div className="mt-4 space-y-3 rounded-md border border-dashed border-border p-4">
              <label className="block text-xs text-muted-foreground">
                Post at
                <input
                  type="datetime-local"
                  aria-label="Post at"
                  value={postAt}
                  onChange={(event) => setPostAt(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>
              <p className="text-sm text-foreground">Post this from your phone at this time.</p>
              {card.pagePath ? (
                <p className="text-sm text-muted-foreground">Page link {card.pagePath}</p>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void saveTime()}
                  disabled={busy || postAt.length === 0}
                  className="text-sm text-foreground disabled:opacity-50"
                >
                  Save time
                </button>
                {card.scheduledAt ? (
                  <button
                    type="button"
                    onClick={() => void clearTime()}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Clear time
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <button type="button" onClick={onDelete} className="text-sm text-destructive">
            Delete
          </button>
          <span className="text-xs text-muted-foreground">Kept in the bin for 30 days.</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || title.trim().length === 0}
              className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function liftTargets(format: SocialCardFormat | ""): { key: keyof SocialCardWords; label: string }[] {
  if (format === "post") {
    return [
      { key: "caption", label: "Caption" },
      { key: "altText", label: "Alt text" },
    ];
  }
  if (format === "reel") return [{ key: "caption", label: "Caption" }];
  if (format === "story") return [{ key: "line", label: "Line" }];
  return [];
}

function PostingChoice({
  byHand,
  locked,
  busy,
  onChange,
}: {
  byHand: boolean;
  locked: boolean;
  busy: boolean;
  onChange: (byHand: boolean) => void;
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Who posts">
        <button
          type="button"
          aria-pressed={!byHand}
          disabled={busy || locked}
          onClick={() => onChange(false)}
          className={`h-8 rounded-md text-sm disabled:opacity-50 ${byHand ? "text-muted-foreground" : "bg-primary text-primary-foreground"}`}
        >
          Post for me
        </button>
        <button
          type="button"
          aria-pressed={byHand}
          disabled={busy}
          onClick={() => onChange(true)}
          className={`h-8 rounded-md text-sm disabled:opacity-50 ${byHand ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          I&apos;ll post it
        </button>
    </div>
  );
}

function WordFields({
  format,
  words,
  busy,
  onWord,
  onFlag,
  onByHand,
  pinMore = false,
}: {
  format: SocialCardFormat | "";
  words: SocialCardWords;
  busy: boolean;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed" | "shareToStory" | "commentsOff", value: boolean) => void;
  onByHand: (byHand: boolean) => void;
  /** Making leaves who-posts for the time screen. */
  pinMore?: boolean;
}): JSX.Element | null {
  const locked = postsByHand({ ...words, byHand: false });
  const byHand = postsByHand(words);
  if (!format) return null;
  return (
    <div className="space-y-2">
      {format === "story" ? (
        <WordInput label="Line" hint="The words on the story. A story has no caption." value={words.line ?? ""} onChange={(value) => onWord("line", value)} onLift={(value) => onWord("line", value)} />
      ) : (
        <CaptionField value={words.caption ?? ""} onChange={(value) => onWord("caption", value)} onLift={(value) => onWord("caption", value)} />
      )}
      {pinMore ? null : (
        <PostingChoice byHand={byHand} locked={locked} busy={busy} onChange={onByHand} />
      )}
      <SendableFields format={format} words={words} onWord={onWord} onFlag={onFlag} />
      {byHand && !pinMore ? <MoreFields format={format} words={words} onWord={onWord} /> : null}
    </div>
  );
}

function useFitField(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return ref;
}

function CaptionField({
  value,
  onChange,
  onLift,
}: {
  value: string;
  onChange: (value: string) => void;
  onLift: (value: string) => void;
}): JSX.Element {
  const remaining = 2200 - value.length;
  const fieldRef = useFitField(value);
  return (
    <div className="block">
      <span className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          Caption
          <FieldHint name="Caption" text="The words under the photo on Instagram." />
        </span>
        <span>{remaining}</span>
      </span>
      <textarea
        ref={fieldRef}
        aria-label="Caption"
        value={value}
        rows={1}
        maxLength={2200}
        onChange={(event) => onChange(event.target.value)}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes(LIFT_DRAG)) event.preventDefault();
        }}
        onDrop={(event) => {
          const text = event.dataTransfer.getData(LIFT_DRAG);
          if (!text) return;
          event.preventDefault();
          onLift(text.slice(0, 2200));
        }}
        className="mt-1 w-full resize-none overflow-hidden rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </div>
  );
}

function SendableFields({
  format,
  words,
  onWord,
  onFlag,
}: {
  format: SocialCardFormat;
  words: SocialCardWords;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed" | "shareToStory" | "commentsOff", value: boolean) => void;
}): JSX.Element {
  return (
    <>
      {format !== "story" ? (
        <WordInput label="Collaborators" hint="Up to three Instagram usernames, separated by commas. They still accept the invite." value={words.collaborator ?? ""} onChange={(value) => onWord("collaborator", value)} />
      ) : null}
      {format !== "story" && !words.commentsOff ? (
        <WordInput label="First comment" hint="The comment under your photo. A link can go here. Halo Aid posts it after the photo is up." value={words.firstComment ?? ""} onChange={(value) => onWord("firstComment", value)} />
      ) : null}
      <FlagRow label="AI-generated" hint="Turn this on when an AI tool made the picture or the words. Instagram can show that." on={Boolean(words.aiGenerated)} onToggle={() => onFlag("aiGenerated", !words.aiGenerated)} />
      {format !== "story" ? (
        <FlagRow label="Turn off commenting" hint="Comments stay closed on this post. Halo Aid sets this after the post is up." on={Boolean(words.commentsOff)} onToggle={() => onFlag("commentsOff", !words.commentsOff)} />
      ) : null}
      {format === "reel" ? (
        <FlagRow label="Share to the feed" hint="Also place this reel on your main grid, not only in Reels." on={Boolean(words.shareToFeed)} onToggle={() => onFlag("shareToFeed", !words.shareToFeed)} />
      ) : null}
      {format === "post" || format === "reel" ? (
        <FlagRow label="Your story" hint="Also send this to your story when Halo Aid posts it. Each photo in a set goes up as its own story." on={Boolean(words.shareToStory)} onToggle={() => onFlag("shareToStory", !words.shareToStory)} />
      ) : null}
      {format === "post" ? (
        <WordInput label="Alt text" hint="For the phone's read-aloud. It is not shown under the photo. On Instagram it goes in Alt text, under Advanced." value={words.altText ?? ""} onChange={(value) => onWord("altText", value)} onLift={(value) => onWord("altText", value)} />
      ) : null}
    </>
  );
}

function MoreButton({ open, onClick }: { open: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="flex h-8 w-full items-center justify-between rounded-xl border border-border px-3 text-sm text-foreground"
    >
      More
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

function MoreExtras({
  format,
  words,
  onWord,
}: {
  format: SocialCardFormat;
  words: SocialCardWords;
  onWord: (key: keyof SocialCardWords, value: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      {format !== "post" ? (
        <WordInput label="Alt text" hint="For the phone's read-aloud. It is not shown under the photo. On Instagram it goes in Alt text, under Advanced." value={words.altText ?? ""} onChange={(value) => onWord("altText", value)} onLift={(value) => onWord("altText", value)} />
      ) : null}
      {format === "story" ? (
        <WordInput label="Collaborators" hint="Another Instagram account credited on the story. You invite them from the phone." value={words.collaborator ?? ""} onChange={(value) => onWord("collaborator", value)} />
      ) : null}
      <WordInput label="Location" hint="The place named on the post, such as the clinic. You pin it from the phone." value={words.location ?? ""} onChange={(value) => onWord("location", value)} />
      <WordInput label="Music" hint="A song you add in the Instagram app. Halo Aid cannot attach it, so you post this one yourself." value={words.music ?? ""} onChange={(value) => onWord("music", value)} />
      <WordInput label="Product" hint="A product you tag in the Instagram app. Halo Aid cannot attach it, so you post this one yourself." value={words.productTag ?? ""} onChange={(value) => onWord("productTag", value)} />
    </div>
  );
}

function MoreFields({
  format,
  words,
  onWord,
}: {
  format: SocialCardFormat;
  words: SocialCardWords;
  onWord: (key: keyof SocialCardWords, value: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      {open ? <MoreExtras format={format} words={words} onWord={onWord} /> : null}
      <MoreButton open={open} onClick={() => setOpen((current) => !current)} />
    </div>
  );
}

function FieldHint({ name, text }: { name: string; text: string }): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0 });

  function show(): void {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 224;
    setBox({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
    setOpen(true);
  }

  function hideSoon(): void {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || noteRef.current?.contains(target)) return;
      setOpen(false);
    }
    function close(): void {
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${name}`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <span
              ref={noteRef}
              role="note"
              style={{ top: box.top, left: box.left }}
              onMouseEnter={() => {
                if (hideTimer.current) window.clearTimeout(hideTimer.current);
              }}
              onMouseLeave={hideSoon}
              className="fixed z-[80] w-56 rounded-md border border-border bg-card px-2.5 py-2 text-xs font-normal leading-4 text-foreground shadow-md"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function FlagRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-border px-3 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm text-foreground">
          {label}
          {hint ? <FieldHint name={label} text={hint} /> : null}
        </span>
        <button
          type="button"
          aria-label={label}
          aria-pressed={on}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
    </div>
  );
}

function WordInput({
  label,
  hint,
  value,
  onChange,
  onLift,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onLift?: (value: string) => void;
}): JSX.Element {
  const fieldRef = useFitField(value);
  const drop = onLift
    ? {
        onDragOver: (event: DragEvent<HTMLTextAreaElement>) => {
          if (Array.from(event.dataTransfer.types).includes(LIFT_DRAG)) event.preventDefault();
        },
        onDrop: (event: DragEvent<HTMLTextAreaElement>) => {
          const text = event.dataTransfer.getData(LIFT_DRAG);
          if (!text) return;
          event.preventDefault();
          onLift(text);
        },
      }
    : {};
  return (
    <div className="block text-xs text-muted-foreground">
      <span className="flex w-full flex-wrap items-center gap-1">
        {label}
        {hint ? <FieldHint name={label} text={hint} /> : null}
      </span>
      <textarea
        ref={fieldRef}
        aria-label={label}
        value={value}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-none overflow-hidden rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        {...drop}
      />
    </div>
  );
}

function wordsFromCard(card: SocialCard): SocialCardWords {
  return card.words ?? {};
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a time");
  return date.toISOString();
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type ReadyStatus = "open" | "scheduled" | "due";

export function readyStatus(scheduledAt: string | null, now = Date.now()): ReadyStatus {
  if (!scheduledAt) return "open";
  const time = Date.parse(scheduledAt);
  if (Number.isNaN(time)) return "open";
  return time < now ? "due" : "scheduled";
}

export function readyLine(scheduledAt: string | null, now = Date.now(), byHand = false): string {
  const status = readyStatus(scheduledAt, now);
  if (status === "open" || !scheduledAt) return "Not scheduled";
  const label = new Date(scheduledAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (byHand) return status === "due" ? `Post this · ${label}` : `You post · ${label}`;
  return status === "due" ? `Due · ${label}` : label;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let date = 1; date <= count; date += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), date));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function clockFrom(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function readLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function localStamp(day: Date, time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return "";
  return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}T${match[1]}:${match[2]}`;
}

function splitClock(value: string): { hour: string; minute: string; period: "AM" | "PM" } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: "", minute: "", period: "AM" };
  const hours = Number(match[1]);
  return { hour: String(hours % 12 || 12), minute: match[2], period: hours >= 12 ? "PM" : "AM" };
}

function joinClock(hour: string, minute: string, period: "AM" | "PM"): string {
  if (!hour || !minute) return "";
  let hours = Number(hour) % 12;
  if (period === "PM") hours += 12;
  return `${pad2(hours)}:${minute}`;
}

type ClockPick = { hour: string; minute: string; period: "AM" | "PM" };

function hour24Value(hour: string, period: "AM" | "PM"): string {
  if (!hour) return "";
  let hours = Number(hour) % 12;
  if (period === "PM") hours += 12;
  return pad2(hours);
}

function dialPoint(index: number, radius: number): { x: number; y: number } {
  const rad = ((index * 30 - 90) * Math.PI) / 180;
  return { x: 100 + Math.cos(rad) * radius, y: 100 + Math.sin(rad) * radius };
}

function angleGap(left: number, right: number): number {
  const gap = Math.abs(left - right) % 360;
  return Math.min(gap, 360 - gap);
}

function ClockFace({
  hour,
  minute,
  period,
  hours24,
  onChange,
}: {
  hour: string;
  minute: string;
  period: "AM" | "PM";
  hours24: boolean;
  onChange: (next: ClockPick) => void;
}): JSX.Element {
  const faceRef = useRef<SVGSVGElement>(null);
  const held = useRef<"hour" | "minute" | null>(null);
  const [hot, setHot] = useState<"hour" | "minute" | null>(null);
  const [drag, setDrag] = useState(false);
  const ready = hour !== "" && minute !== "";
  const hourNum = hour === "" ? 12 : Number(hour);
  const minuteNum = minute === "" ? 0 : Number(minute);
  const hourAngle = (hourNum % 12) * 30 + minuteNum * 0.5;
  const minuteAngle = minuteNum * 6;
  const hoursValue = hour === "" ? null : period === "PM" ? (hourNum % 12) + 12 : hourNum % 12;
  const innerHour = hours24 && hoursValue !== null && (hoursValue === 0 || hoursValue >= 13);
  const hourTip = hours24 ? (innerHour ? 54 : 32) : 48;

  function read(event: ReactPointerEvent<SVGSVGElement>): { deg: number; radius: number } {
    const bounds = faceRef.current?.getBoundingClientRect();
    if (!bounds) return { deg: 0, radius: 0 };
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return { deg, radius: Math.hypot(dx, dy) / (bounds.width / 2) };
  }

  function handAt(deg: number, radius: number): "hour" | "minute" | null {
    const hourLen = (100 - hourTip) / 100;
    const minuteLen = 0.78;
    const onHour = angleGap(deg, hourAngle) < 26 && radius > 0.08 && radius < hourLen + 0.14;
    const onMinute = angleGap(deg, minuteAngle) < 16 && radius > 0.08 && radius < minuteLen + 0.14;
    if (onHour && onMinute) return Math.abs(radius - hourLen) <= Math.abs(radius - minuteLen) ? "hour" : "minute";
    if (onHour) return "hour";
    if (onMinute) return "minute";
    return null;
  }

  function applyHeld(kind: "hour" | "minute", event: ReactPointerEvent<SVGSVGElement>): void {
    const { deg, radius } = read(event);
    if (kind === "minute") {
      onChange({ hour: hour || "12", minute: pad2(Math.round(deg / 6) % 60), period });
      return;
    }
    const step = Math.round(deg / 30) % 12;
    const nextMinute = minute || "00";
    if (hours24 && radius < 0.58) {
      const value = step === 0 ? 0 : step + 12;
      onChange({ hour: String(value % 12 || 12), minute: nextMinute, period: value >= 12 ? "PM" : "AM" });
      return;
    }
    const value = step === 0 ? 12 : step;
    if (hours24) {
      onChange({ hour: String(value), minute: nextMinute, period: value === 12 ? "PM" : "AM" });
      return;
    }
    onChange({ hour: String(value), minute: nextMinute, period });
  }

  return (
    <svg
      ref={faceRef}
      viewBox="0 0 200 200"
      role="group"
      aria-label="Drag a hand"
      className={`h-full w-full touch-none select-none ${drag ? "cursor-grabbing" : hot ? "cursor-grab" : "cursor-default"}`}
      onPointerDown={(event) => {
        const spot = read(event);
        const kind = handAt(spot.deg, spot.radius);
        if (!kind) return;
        held.current = kind;
        setDrag(true);
        setHot(kind);
        event.currentTarget.setPointerCapture(event.pointerId);
        applyHeld(kind, event);
      }}
      onPointerMove={(event) => {
        if (held.current) {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) applyHeld(held.current, event);
          return;
        }
        const spot = read(event);
        const kind = handAt(spot.deg, spot.radius);
        setHot((current) => (current === kind ? current : kind));
      }}
      onPointerUp={() => {
        held.current = null;
        setDrag(false);
        setHot(null);
      }}
      onPointerCancel={() => {
        held.current = null;
        setDrag(false);
        setHot(null);
      }}
      onPointerLeave={() => {
        if (held.current) return;
        setHot(null);
      }}
    >
      <circle cx="100" cy="100" r="96" className="fill-muted/30 stroke-border" strokeWidth="1" />
      <g
        aria-hidden={hours24 ? true : undefined}
        className={`motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out ${hours24 ? "opacity-0" : "opacity-100"}`}
      >
        {Array.from({ length: 12 }, (_, index) => {
          const point = dialPoint(index, 74);
          const marked = ready && !innerHour && hourNum % 12 === index;
          return (
            <text
              key={`twelve-${index}`}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="13"
              fontWeight={marked ? 700 : 400}
              className={marked ? "fill-foreground" : "fill-muted-foreground"}
            >
              {index === 0 ? "12" : String(index)}
            </text>
          );
        })}
      </g>
      <g
        aria-hidden={hours24 ? undefined : true}
        className={`motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out ${hours24 ? "opacity-100" : "opacity-0"}`}
      >
        <circle cx="100" cy="100" r="58" className="fill-none stroke-border" strokeWidth="1" />
        {Array.from({ length: 12 }, (_, index) => {
          const point = dialPoint(index, 78);
          const marked = ready && !innerHour && hourNum % 12 === index;
          return (
            <text
              key={`outer-${index}`}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="13"
              fontWeight={marked ? 700 : 400}
              className={marked ? "fill-foreground" : "fill-muted-foreground"}
            >
              {index === 0 ? "12" : String(index)}
            </text>
          );
        })}
        {Array.from({ length: 12 }, (_, index) => {
          const point = dialPoint(index, 46);
          const marked = ready && innerHour && (index === 0 ? hoursValue === 0 : hoursValue === index + 12);
          return (
            <text
              key={`inner-${index}`}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10"
              fontWeight={marked ? 700 : 400}
              className={marked ? "fill-foreground" : "fill-muted-foreground"}
            >
              {index === 0 ? "00" : String(index + 12)}
            </text>
          );
        })}
      </g>
      <g transform={`rotate(${hourAngle} 100 100)`} className={ready ? "" : "opacity-40"}>
        <line
          x1="100"
          y1="100"
          x2="100"
          y2={hourTip}
          className="stroke-foreground"
          strokeWidth={hot === "hour" ? 5 : 4}
          strokeLinecap="round"
        />
        <circle
          cx="100"
          r={hot === "hour" ? 8 : 6.5}
          className="fill-card stroke-foreground"
          strokeWidth="2.5"
          style={{ cy: hourTip, transition: drag || reducedMotion() ? undefined : "cy 300ms cubic-bezier(0.22, 1, 0.36, 1)" } as CSSProperties}
        />
      </g>
      <g transform={`rotate(${minuteAngle} 100 100)`} className={ready ? "" : "opacity-40"}>
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="22"
          className="stroke-primary"
          strokeWidth={hot === "minute" ? 3.5 : 2.5}
          strokeLinecap="round"
        />
        <circle cx="100" cy="22" r={hot === "minute" ? 8 : 6.5} className="fill-card stroke-primary" strokeWidth="2.5" />
      </g>
      <circle cx="100" cy="100" r="4" className="fill-primary" />
    </svg>
  );
}

function matchesSchedule(scheduledAt: string | null, day: Date | null, time: string): boolean {
  if (!scheduledAt || !day || !time) return false;
  const saved = new Date(scheduledAt);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (Number.isNaN(saved.getTime()) || !match) return false;
  return (
    saved.getFullYear() === day.getFullYear() &&
    saved.getMonth() === day.getMonth() &&
    saved.getDate() === day.getDate() &&
    saved.getHours() === Number(match[1]) &&
    saved.getMinutes() === Number(match[2])
  );
}

function planSentence(day: Date, time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return "";
  const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2]));
  const date = when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }).replace(",", "");
  const clock = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} at ${clock}`;
}

function phoneReminders(
  format: SocialCardFormat | "",
  words: SocialCardWords,
  storyCount = 0
): { label: string; value: string }[] {
  const text = (value: string | undefined): string => value?.trim() ?? "";
  const rows: { label: string; value: string }[] = [];
  if (format === "story") {
    rows.push({ label: "Line", value: text(words.line) });
    if (storyCount > 1) rows.push({ label: "Stories", value: "Post each photo as its own story." });
    if (words.storyPlace === "fit") rows.push({ label: "Photo", value: "Show the whole photo on the story." });
  }
  else {
    rows.push({ label: "Caption", value: text(words.caption) });
    if (!words.commentsOff) rows.push({ label: "First comment", value: text(words.firstComment) });
  }
  rows.push(
    { label: "Alt text", value: text(words.altText) },
    { label: "Location", value: text(words.location) },
    { label: "Collaborators", value: text(words.collaborator) },
    { label: "Music", value: text(words.music) },
    { label: "Product", value: text(words.productTag) },
  );
  if (words.aiGenerated) rows.push({ label: "AI-generated", value: "Turn this on in Instagram" });
  if (words.commentsOff && format !== "story") rows.push({ label: "Comments", value: "Turn off commenting" });
  if (format === "reel" && words.storyPlace === "fit") rows.push({ label: "Photo", value: "Show the whole photo on the reel." });
  if (format === "reel" && words.shareToFeed) rows.push({ label: "Feed", value: "Also share this reel to your feed" });
  if ((format === "post" || format === "reel") && words.shareToStory) {
    rows.push({ label: "Story", value: "Also share this to your story" });
  }
  return rows.filter((row) => row.value);
}

function CopyFields({
  format,
  words,
  storyCount = 0,
}: {
  format: SocialCardFormat | "";
  words: SocialCardWords;
  storyCount?: number;
}): JSX.Element | null {
  const rows = phoneReminders(format, words, storyCount);
  const [copied, setCopied] = useState<string | null>(null);
  if (rows.length === 0) return null;
  return (
    <div role="region" aria-label="Copy into Instagram" className="min-w-0 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0 text-xs text-muted-foreground">
          <span className="flex items-center justify-between gap-2">
            <span>{row.label}</span>
            <button
              type="button"
              aria-label={copied === row.label ? "Copied" : "Copy"}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
              onClick={() => {
                void navigator.clipboard.writeText(row.value).then(() => setCopied(row.label));
              }}
            >
              {copied === row.label ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </span>
          <p
            className={`mt-1 min-w-0 select-text whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground [overflow-wrap:anywhere] ${
              row.label === "Caption" || row.label === "Line" ? "min-h-[4.5rem]" : "min-h-8"
            }`}
          >
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function HandNote({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  const fieldRef = useFitField(value);
  const [copied, setCopied] = useState(false);
  useLayoutEffect(() => {
    const node = fieldRef.current;
    if (!node) return;
    const scroller = node.closest(".overflow-y-auto");
    if (!(scroller instanceof HTMLElement)) return;
    const extra = node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (extra > 0) scroller.scrollTop += extra + 12;
  }, [value]);
  return (
    <div className="text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>Reminder message</span>
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy"}
          disabled={value.trim().length === 0}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </span>
      <textarea
        ref={fieldRef}
        aria-label="Reminder message"
        value={value}
        rows={1}
        maxLength={500}
        placeholder="Anything else to do before posting to Instagram."
        onChange={(event) => {
          setCopied(false);
          onChange(event.target.value);
        }}
        className="mt-1 w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

function TimeMenu({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onPick: (value: string) => void;
}): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState<{ left: number; width: number; maxHeight: number; anchor: number; above: boolean } | null>(null);
  const shown = options.find((item) => item.value === value)?.label ?? "—";

  function place(): void {
    const node = buttonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const gap = 4;
    const roomBelow = window.innerHeight - rect.bottom - gap - 8;
    const roomAbove = rect.top - gap - 8;
    const above = roomBelow < 160 && roomAbove > roomBelow;
    setBox({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(220, above ? roomAbove : roomBelow)),
      anchor: above ? rect.top - gap : rect.bottom + gap,
      above,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setCursor(Math.max(0, options.findIndex((item) => item.value === value)));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>("[data-current='true']")?.scrollIntoView?.({ block: "nearest" });
  }, [open, cursor]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setCursor((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return Math.min(options.length - 1, Math.max(0, next));
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (!open) return;
      event.preventDefault();
      const item = options[cursor];
      if (!item) return;
      onPick(item.value);
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-lg border border-border bg-background text-center text-sm text-foreground"
      >
        {shown}
      </button>
      {open && box
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              aria-label={label}
              className="fixed z-[80] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-md"
              style={{
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                top: box.above ? undefined : box.anchor,
                bottom: box.above ? window.innerHeight - box.anchor : undefined,
              }}
            >
              {options.map((item, index) => {
                const selected = item.value === value;
                const current = index === cursor;
                return (
                  <button
                    key={item.value || "blank"}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-current={current ? "true" : undefined}
                    className={`flex h-8 w-full items-center justify-center text-sm ${
                      selected ? "bg-primary text-primary-foreground" : current ? "bg-muted text-foreground" : "text-foreground hover:bg-muted"
                    }`}
                    onClick={() => {
                      onPick(item.value);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ReleasePlan({
  title,
  scheduledAt,
  postAt,
  busy,
  error,
  onPostAt,
  onSaveTime,
  onPostNow,
  onClearTime,
  publishError,
  sending,
  sent,
  onDone,
  byHand,
  handLocked,
  onByHand,
  onMarkPosted,
  onHandNote,
  format,
  words,
}: {
  title: string;
  scheduledAt: string | null;
  postAt: string;
  busy: boolean;
  error: string | null;
  publishError: string | null;
  sending: boolean;
  sent: { url: string | null } | null;
  onDone: () => void;
  byHand: boolean;
  handLocked: boolean;
  onPostAt: (value: string) => void;
  onSaveTime: () => void;
  onPostNow: () => void;
  onClearTime: () => void;
  onByHand: (byHand: boolean) => void;
  onMarkPosted: () => void;
  onHandNote: (value: string) => void;
  format: SocialCardFormat | "";
  words: SocialCardWords;
}): JSX.Element {
  const initial = readLocal(postAt);
  const opening = initial && postAt.includes("T") ? clockFrom(initial) : "";
  const openedClock = splitClock(opening);
  const [picked, setPicked] = useState<Date | null>(() => (initial ? startOfDay(initial) : null));
  const [time, setTime] = useState(opening);
  const [hour, setHour] = useState(openedClock.hour);
  const [minute, setMinute] = useState(openedClock.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(openedClock.period);
  const [hours24, setHours24] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(initial ?? new Date()));
  const [calendarFace, setCalendarFace] = useState<"days" | "months" | "years">("days");
  const [yearPage, setYearPage] = useState(() => Math.floor((initial ?? new Date()).getFullYear() / 12) * 12);
  const today = startOfDay(new Date());
  const cells = monthCells(month);
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const confirmed = matchesSchedule(scheduledAt, picked, time);
  const whenLine = time && picked ? planSentence(picked, time) : "";

  useEffect(() => {
    if (postAt) return;
    setTime("");
    setPicked(null);
    setHour("");
    setMinute("");
    setPeriod("AM");
  }, [postAt]);

  function applyClock(nextHour: string, nextMinute: string, nextPeriod: "AM" | "PM"): void {
    setHour(nextHour);
    setMinute(nextMinute);
    setPeriod(nextPeriod);
    const next = joinClock(nextHour, nextMinute, nextPeriod);
    if (next) pickTime(next);
    else setTime("");
  }

  function pickDay(next: Date): void {
    const chosen = startOfDay(next);
    setPicked(chosen);
    if (time) onPostAt(localStamp(chosen, time));
  }

  function goToday(): void {
    setMonth(startOfMonth(today));
    setYearPage(Math.floor(today.getFullYear() / 12) * 12);
    setCalendarFace("days");
    pickDay(today);
  }

  function pickTime(value: string): void {
    const base = picked ?? today;
    if (!picked) setPicked(base);
    setTime(value);
    onPostAt(value ? localStamp(base, value) : "");
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center">
        <h2 className="w-full max-w-2xl shrink-0 text-2xl font-semibold leading-7 text-foreground">{title}</h2>
        <div
          role="status"
          className="mt-6 flex w-full max-w-md flex-col items-center rounded-xl border border-border px-6 py-8 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-3 text-base font-semibold text-foreground">Posted on Instagram</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It is live. The card leaves the board and shows as Posted on the Schedule.
          </p>
          <div className="mt-5 flex items-center gap-2">
            {sent.url ? (
              <a
                href={sent.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm text-foreground hover:bg-muted"
              >
                Open on Instagram
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <div className="flex w-full flex-1 flex-col items-center">
      <h2 className="w-full max-w-2xl shrink-0 text-2xl font-semibold leading-7 text-foreground">{title}</h2>
      <div className="mt-1 flex w-full max-w-2xl flex-col">
        <h3 className="shrink-0 text-lg font-semibold leading-6 text-foreground">{byHand ? "Reminder" : "Schedule"}</h3>
        <div className="mx-auto mt-1.5 w-full max-w-sm shrink-0">
          <PostingChoice byHand={byHand} locked={handLocked} busy={busy || sending} onChange={onByHand} />
        </div>
        <div className="mx-auto mt-1.5 w-max max-w-full rounded-xl border border-border px-5 py-3">
        <div className="grid grid-cols-2 items-start gap-x-8">
        <div className="flex w-full justify-center">
        <div className="w-72">
          <p className="mb-1 text-center text-sm font-medium text-foreground">Date</p>
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={calendarFace === "years" ? "Previous years" : calendarFace === "months" ? "Previous year" : "Previous month"}
              onClick={() => {
                if (calendarFace === "years") {
                  setYearPage((current) => current - 12);
                  return;
                }
                if (calendarFace === "months") {
                  setMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1));
                  return;
                }
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={calendarFace === "days" ? "Choose a month" : "Show the days"}
              onClick={() => setCalendarFace((current) => (current === "days" ? "months" : "days"))}
              className="rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-muted"
            >
              {monthLabel}
            </button>
            <button
              type="button"
              aria-label={calendarFace === "years" ? "Next years" : calendarFace === "months" ? "Next year" : "Next month"}
              onClick={() => {
                if (calendarFace === "years") {
                  setYearPage((current) => current + 12);
                  return;
                }
                if (calendarFace === "months") {
                  setMonth((current) => new Date(current.getFullYear() + 1, current.getMonth(), 1));
                  return;
                }
                setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {calendarFace === "years" ? (
            <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label="Years">
              {Array.from({ length: 12 }, (_, index) => yearPage + index).map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={year === month.getFullYear()}
                  aria-label={`Choose ${year}`}
                  onClick={() => {
                    setMonth((current) => new Date(year, current.getMonth(), 1));
                    setCalendarFace("months");
                  }}
                  className={`h-10 rounded-md text-sm ${
                    year === month.getFullYear()
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : calendarFace === "months" ? (
            <div className="mt-2">
              <button
                type="button"
                aria-label="Choose a year"
                onClick={() => {
                  setYearPage(Math.floor(month.getFullYear() / 12) * 12);
                  setCalendarFace("years");
                }}
                className="mb-2 w-full rounded-md py-1 text-sm font-medium text-foreground hover:bg-muted"
              >
                {month.getFullYear()}
              </button>
              <div className="grid grid-cols-3 gap-1" role="group" aria-label="Months">
                {Array.from({ length: 12 }, (_, index) => index).map((index) => {
                  const name = new Date(2026, index, 1).toLocaleDateString(undefined, { month: "short" });
                  const chosen = index === month.getMonth();
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={chosen}
                      aria-label={`Choose ${new Date(2026, index, 1).toLocaleDateString(undefined, { month: "long" })}`}
                      onClick={() => {
                        setMonth((current) => new Date(current.getFullYear(), index, 1));
                        setCalendarFace("days");
                      }}
                      className={`h-10 rounded-md text-sm ${
                        chosen ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
          <>
          <div className="mt-1 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
            {["S", "M", "T", "W", "T", "F", "S"].map((letter, index) => (
              <span key={index}>{letter}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 place-items-center" role="group" aria-label={monthLabel}>
            {cells.map((item, index) =>
              item ? (
                <button
                  key={item.toDateString()}
                  type="button"
                  aria-pressed={picked ? sameDay(item, picked) : false}
                  aria-label={`Choose ${DAY_NAMES[item.getDay()]} ${item.getDate()}`}
                  onClick={() => pickDay(item)}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                    picked && sameDay(item, picked)
                      ? "bg-primary text-primary-foreground"
                      : sameDay(item, today)
                        ? "text-primary ring-1 ring-primary"
                        : "text-foreground hover:bg-muted"
                  }`}
                >
                  {item.getDate()}
                </button>
              ) : (
                <span key={`blank-${index}`} className="mx-auto block h-9 w-9" />
              )
            )}
          </div>
          </>
          )}
          <button
            type="button"
            onClick={goToday}
            className="mt-1 w-full rounded-md py-1.5 text-sm font-medium text-primary hover:bg-muted"
          >
            Today
          </button>
        </div>
        </div>
        <div className="mx-auto flex w-72 flex-col items-center">
          <p className="mb-1 text-center text-sm font-medium text-foreground">Time</p>
          <div className="relative mb-1 grid grid-cols-2 rounded-lg border border-border p-0.5" role="group" aria-label="Clock hours">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-0.125rem)] rounded-md bg-primary motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${hours24 ? "translate-x-full" : ""}`}
            />
            <button
              type="button"
              aria-pressed={!hours24}
              className={`relative h-9 rounded-md px-3 text-sm motion-safe:transition-colors motion-safe:duration-300 ${hours24 ? "text-muted-foreground" : "text-primary-foreground"}`}
              onClick={() => setHours24(false)}
            >
              12-hour
            </button>
            <button
              type="button"
              aria-pressed={hours24}
              className={`relative h-9 rounded-md px-3 text-sm motion-safe:transition-colors motion-safe:duration-300 ${hours24 ? "text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setHours24(true)}
            >
              24-hour
            </button>
          </div>
          <div className="flex w-full items-center justify-center">
            <div className="h-52 w-52">
              <ClockFace
                hour={hour}
                minute={minute}
                period={period}
                hours24={hours24}
                onChange={(next) => applyClock(next.hour, next.minute, next.period)}
              />
            </div>
          </div>
          <div className="mt-1 flex w-full items-center justify-center">
          <div className="grid w-[calc(100%-4.75rem)] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1">
            {hours24 ? (
              <TimeMenu
                label="Hour"
                value={hour24Value(hour, period)}
                options={[{ value: "", label: "—" }, ...Array.from({ length: 24 }, (_, index) => ({ value: pad2(index), label: pad2(index) }))]}
                onPick={(next) => {
                  if (!next) {
                    applyClock("", minute, period);
                    return;
                  }
                  const picked = Number(next);
                  applyClock(String(picked % 12 || 12), minute, picked >= 12 ? "PM" : "AM");
                }}
              />
            ) : (
              <TimeMenu
                label="Hour"
                value={hour}
                options={[{ value: "", label: "—" }, ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: pad2(index + 1) }))]}
                onPick={(next) => applyClock(next, minute, period)}
              />
            )}
            <span className="text-sm text-muted-foreground" aria-hidden="true">:</span>
            <TimeMenu
              label="Minute"
              value={minute}
              options={[{ value: "", label: "—" }, ...Array.from({ length: 60 }, (_, index) => ({ value: pad2(index), label: pad2(index) }))]}
              onPick={(next) => applyClock(hour, next, period)}
            />
          </div>
          <div
            className={`shrink-0 overflow-hidden motion-safe:transition-[width,margin,opacity] motion-safe:duration-300 motion-safe:ease-out ${hours24 ? "pointer-events-none ml-0 w-0 opacity-0" : "ml-1 w-[4.5rem] opacity-100"}`}
            aria-hidden={hours24 ? true : undefined}
          >
            <div className="grid h-9 w-[4.5rem] grid-cols-2 rounded-lg border border-border p-0.5" role="group" aria-label="Time of day">
              {(["AM", "PM"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={period === item}
                  tabIndex={hours24 ? -1 : undefined}
                  className={`h-full rounded-md text-xs motion-safe:transition-colors motion-safe:duration-300 ${
                    period === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => applyClock(hour, minute, item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          </div>
        </div>
        </div>
        </div>
        <div className="mt-1.5 grid w-full shrink-0 grid-cols-2 items-start gap-x-8">
        <div>
          <p className="mb-1 min-h-10 text-xs leading-5 text-muted-foreground">
            {byHand
              ? "Skip the date and time above. Mark it once it is on Instagram."
              : "Skip the date and time above. This card goes out at this minute."}
          </p>
          {byHand ? (
            <button
              type="button"
              disabled={busy}
              className="h-9 w-full rounded-md border border-border bg-background text-sm text-foreground disabled:opacity-50"
              onClick={onMarkPosted}
            >
              {"It's posted"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || sending}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm text-foreground disabled:opacity-50"
              onClick={onPostNow}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {sending ? "Posting…" : publishError ? "Try again" : "Post now"}
            </button>
          )}
          {byHand ? null : sending ? (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              Sending to Instagram. A video can take a few minutes.
            </p>
          ) : publishError === "not_connected" ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Instagram is not connected. Connect it, then try again.
            </p>
          ) : publishError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Instagram did not take it. Halo Aid tries again in 15 minutes.
            </p>
          ) : null}
        </div>
        <div>
          <p className="mb-1 min-h-10 text-xs leading-5 text-muted-foreground">
            {byHand
              ? whenLine
                ? `You'll post this ${whenLine}. The time is a reminder.`
                : "You post this. The time is a reminder."
              : whenLine
                ? `Halo Aid posts this on ${whenLine}.`
                : "Halo Aid posts this on your Instagram at the time you set."}
          </p>
          <button
            type="button"
            disabled={busy || sending || time.length === 0 || confirmed}
            className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 text-sm ${
              confirmed && !byHand
                ? "border border-border bg-background text-foreground"
                : "bg-primary text-primary-foreground disabled:opacity-50"
            }`}
            onClick={onSaveTime}
          >
            {confirmed && !byHand ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            {byHand ? "Remind me" : confirmed ? "Scheduled" : "Schedule"}
          </button>
          {scheduledAt && !sending ? (
            <button type="button" className="mt-1 text-sm text-muted-foreground hover:text-foreground" onClick={onClearTime}>
              Clear time
            </button>
          ) : null}
        </div>
        </div>
      </div>
      {error ? (
        <p
          className={`mt-3 w-full max-w-xl text-sm ${error === STILL_SENDING ? "text-muted-foreground" : "text-destructive"}`}
          role={error === STILL_SENDING ? "status" : "alert"}
        >
          {error}
        </p>
      ) : null}
      </div>
      {byHand ? (
        <div className="mx-auto mt-2 w-full max-w-2xl shrink-0">
          <HandNote value={words.handNote ?? ""} onChange={onHandNote} />
        </div>
      ) : null}
    </div>
  );
}

function wordsForFormat(format: SocialCardFormat | "", words: SocialCardWords): SocialCardWords {
  void format;
  const keep = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const shots = (words.shots ?? []).map((shot) => shot.trim()).filter(Boolean).slice(0, 3);
  const next: SocialCardWords = {};
  const note = keep(words.note);
  const caption = keep(words.caption);
  const altText = keep(words.altText);
  const firstComment = keep(words.firstComment);
  const hook = keep(words.hook);
  const script = keep(words.script);
  const coverLine = keep(words.coverLine);
  const line = keep(words.line);
  const location = keep(words.location);
  const collaborator = keep(words.collaborator);
  const music = keep(words.music);
  const productTag = keep(words.productTag);
  const handNote = keep(words.handNote);
  if (note) next.note = note;
  if (caption) next.caption = caption;
  if (altText) next.altText = altText;
  if (firstComment) next.firstComment = firstComment;
  if (hook) next.hook = hook;
  if (script) next.script = script;
  if (coverLine) next.coverLine = coverLine;
  if (line) next.line = line;
  if (location) next.location = location;
  if (collaborator) next.collaborator = collaborator;
  if (words.crop) next.crop = words.crop;
  if (words.storyPlace === "fit") next.storyPlace = "fit";
  if (words.aiGenerated) next.aiGenerated = true;
  if (words.shareToFeed) next.shareToFeed = true;
  if (words.shareToStory) next.shareToStory = true;
  if (words.commentsOff) next.commentsOff = true;
  if (music) next.music = music;
  if (productTag) next.productTag = productTag;
  if (handNote) next.handNote = handNote;
  if (shots.length > 0) next.shots = shots;
  if (words.byHand || music || productTag) next.byHand = true;
  return next;
}

function withNote(words: SocialCardWords, note: string): SocialCardWords {
  const next = { ...words };
  const trimmed = note.trim();
  if (trimmed) next.note = trimmed;
  else delete next.note;
  return next;
}

function looksLikeVideo(url: string): boolean {
  try {
    return /\.(mp4|mov|webm|m4v|3gp|avi|mkv)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function looksLikeAudio(url: string): boolean {
  try {
    return /\.(mp3|m4a|wav)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function faceFromUrl(url: string): "sheet" | "slides" | "page" | null {
  try {
    const path = new URL(url).pathname;
    if (/\.(xlsx?|csv|ods)$/i.test(path)) return "sheet";
    if (/\.(pptx?|odp)$/i.test(path)) return "slides";
    if (/\.(pdf|docx?|txt|rtf|odt)$/i.test(path)) return "page";
    return null;
  } catch {
    return null;
  }
}

function looksLikeDocument(url: string): boolean {
  try {
    return /\.(pdf|docx?|pptx?|xlsx?|txt|csv|rtf|odt|ods|odp)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function CaptionPreview({ name, text }: { name: string; text: string }): JSX.Element {
  const box = useRef<HTMLParagraphElement>(null);
  const [count, setCount] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = (): void => {
      const width = node.clientWidth;
      if (width < 8) return;
      const style = getComputedStyle(node);
      const line = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(line) || line <= 0) return;
      const limit = line * 2 + 1;
      const points = Array.from(text);
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.left = "0";
      probe.style.top = "0";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.width = `${width}px`;
      probe.style.fontSize = style.fontSize;
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontWeight = style.fontWeight;
      probe.style.fontStyle = style.fontStyle;
      probe.style.letterSpacing = style.letterSpacing;
      probe.style.lineHeight = style.lineHeight;
      probe.style.whiteSpace = "normal";
      probe.style.overflowWrap = "anywhere";
      const nameNode = document.createElement("span");
      nameNode.style.fontWeight = "600";
      nameNode.textContent = name;
      const rest = document.createTextNode("");
      probe.append(nameNode, rest);
      document.body.appendChild(probe);
      const fits = (value: string): boolean => {
        rest.textContent = ` ${value}`;
        return probe.scrollHeight <= limit;
      };
      try {
        if (fits(text)) {
          setCount((current) => (current === null ? current : null));
          return;
        }
        let low = 0;
        let high = points.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          const sample = `${points.slice(0, mid).join("").trimEnd()}\u2026 more`;
          if (fits(sample)) low = mid;
          else high = mid - 1;
        }
        setCount((current) => (current === low ? current : low));
      } finally {
        probe.remove();
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [name, text]);
  const shown = count === null ? text : Array.from(text).slice(0, count).join("").trimEnd();
  return (
    <p ref={box} className="min-w-0 px-3 pb-2 text-xs leading-4 text-foreground [overflow-wrap:anywhere]">
      <span className="sr-only">{`${name} ${text}`}</span>
      <span aria-hidden="true">
        <span className="font-semibold">{name}</span> {shown}
        {count === null ? null : (
          <>
            {"\u2026"}
            <span className="text-muted-foreground"> more</span>
          </>
        )}
      </span>
    </p>
  );
}

function InstaPreview({
  format,
  words,
  preview,
  video,
  hasFile,
  title,
  handle,
  photo,
  tall,
  onAttach,
  onCrop,
  onStoryPlace,
  slides,
  seen,
  onSee,
  onAddPicture,
  onRemoveSlide,
  onReorder,
  onBroken,
  adding = false,
  showStrip = true,
  locked = false,
  motion = "none",
}: {
  format: SocialCardFormat | "";
  words: SocialCardWords;
  preview: string | null;
  video: boolean;
  hasFile: boolean;
  title: string;
  handle: string;
  photo: string | null;
  tall: boolean;
  onAttach: (file: File | undefined) => void;
  onCrop: (crop: SocialCardCrop) => void;
  onStoryPlace: (place: "fill" | "fit") => void;
  slides: readonly { id: string; url: string | null }[];
  seen: number;
  onSee: (index: number) => void;
  onAddPicture: (file: File | undefined) => void;
  onRemoveSlide: (id: string) => void;
  onReorder: (ids: string[], index: number, commit?: boolean) => void;
  onBroken?: (id: string) => void;
  adding?: boolean;
  showStrip?: boolean;
  locked?: boolean;
  motion?: string;
}): JSX.Element {
  const [chrome, setChrome] = useState(!locked);
  const [chromeOpen, setChromeOpen] = useState(!locked);
  const [lead, setLead] = useState<number | null>(null);
  const leadUrl = slides[0]?.url ?? null;
  useEffect(() => {
    if (!leadUrl) return;
    let gone = false;
    const img = new Image();
    img.onload = () => {
      if (!gone && img.naturalWidth > 0 && img.naturalHeight > 0) setLead(img.naturalWidth / img.naturalHeight);
    };
    img.src = leadUrl;
    return () => {
      gone = true;
    };
  }, [leadUrl]);
  useLayoutEffect(() => {
    if (motion === "none") {
      setChrome(!locked);
      setChromeOpen(!locked);
      return;
    }
    if (!locked) {
      setChrome(true);
      const frame = requestAnimationFrame(() => setChromeOpen(true));
      return () => cancelAnimationFrame(frame);
    }
    setChromeOpen(false);
    const timer = window.setTimeout(() => setChrome(false), 280);
    return () => window.clearTimeout(timer);
  }, [locked, motion]);
  const name = handle || "Your account";
  const postRatio = tall ? undefined : previewAspect(words.crop, lead);
  const fitFrame = (format === "story" || format === "reel") && !video && words.storyPlace === "fit";
  const shownId = slides[seen]?.id ?? "piece";
  const clip = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [length, setLength] = useState(0);
  function paint(time: number, total: number): void {
    if (!(total > 0)) return;
    const pct = `${Math.min(100, Math.max(0, (time / total) * 100))}%`;
    if (fill.current) fill.current.style.width = pct;
    if (knob.current) knob.current.style.left = pct;
    bar.current?.setAttribute("aria-valuenow", String(Math.round(time)));
  }
  useEffect(() => {
    setPlaying(false);
    setHeard(false);
    setLength(0);
    const node = clip.current;
    if (!node) return;
    node.pause();
    node.muted = true;
  }, [preview]);
  useEffect(() => {
    if (!video || length <= 0) return;
    let frame = 0;
    const tick = () => {
      const node = clip.current;
      if (node && !node.paused && !node.ended) paint(node.currentTime, node.duration || length);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video, length, preview]);
  function togglePlay(): void {
    const node = clip.current;
    if (!node) return;
    if (node.paused) {
      void node.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }
    node.pause();
    setPlaying(false);
  }
  function toggleSound(): void {
    const node = clip.current;
    if (!node) return;
    node.muted = !node.muted;
    setHeard(!node.muted);
  }
  function skip(seconds: number): void {
    const node = clip.current;
    if (!node || !Number.isFinite(node.duration)) return;
    const next = Math.min(Math.max(0, node.currentTime + seconds), Math.max(0, node.duration - 0.05));
    node.currentTime = next;
    paint(next, node.duration);
  }
  function seekAt(event: ReactPointerEvent<HTMLDivElement>): void {
    const node = clip.current;
    const box = event.currentTarget.getBoundingClientRect();
    if (!node || !Number.isFinite(node.duration) || box.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const next = ratio * node.duration;
    node.currentTime = next;
    paint(next, node.duration);
  }
  const media = preview ? (
    video ? (
      <video
        ref={clip}
        src={preview}
        className="h-full w-full object-cover"
        muted={!heard}
        playsInline
        loop={format !== "post"}
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={() => setLength(Number.isFinite(clip.current?.duration) ? clip.current?.duration ?? 0 : 0)}
        onError={() => onBroken?.(shownId)}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview}
        alt={words.altText ?? ""}
        className={fitFrame ? "h-full w-full object-contain" : tall || postRatio ? "h-full w-full object-cover" : "h-auto w-full"}
        onError={() => onBroken?.(shownId)}
      />
    )
  ) : hasFile ? (
    <p className="flex h-full items-center justify-center px-4 text-center text-sm text-white">The file is on this card.</p>
  ) : (
    <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center text-white">
      <ImagePlus className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm">Add the file</span>
      <input
        type="file"
        accept={cardFileAccept(format)}
        className="sr-only"
        aria-label={`Attach the file for ${title}`}
        onChange={(event) => {
          onAttach(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
  const frame = (
    <div
      className={`relative w-full bg-black ${tall ? "aspect-[9/16]" : ""}`}
      style={!tall && postRatio ? { aspectRatio: postRatio } : undefined}
    >
      {media}
      {length > 0 ? (
            <div
              ref={bar}
              role="slider"
              aria-label="Video position"
              aria-valuemin={0}
              aria-valuemax={Math.round(length)}
              aria-valuenow={0}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                seekAt(event);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                seekAt(event);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") skip(-5);
                if (event.key === "ArrowRight") skip(5);
              }}
              className="group absolute inset-x-0 bottom-0 z-20 h-4 cursor-pointer"
            >
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/35">
                <span ref={fill} className="block h-full w-0 bg-white" />
              </span>
              <span
                ref={knob}
                className="absolute bottom-0 left-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white opacity-0 group-hover:opacity-100"
              />
            </div>
      ) : null}
      {video && !playing ? (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-200/95"
        >
          <Play className="ml-0.5 h-5 w-5 fill-neutral-800 text-neutral-800" aria-hidden="true" />
        </button>
      ) : null}
      {video && format === "post" ? (
        <button
          type="button"
          aria-label={heard ? "Mute" : "Turn sound on"}
          aria-pressed={heard}
          onClick={toggleSound}
          className="absolute bottom-5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
        >
          {heard ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      ) : null}
      {video && format === "reel" ? (
        <button
          type="button"
          aria-label={heard ? "Mute" : "Turn sound on"}
          aria-pressed={heard}
          onClick={toggleSound}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
        >
          {heard ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      ) : null}
      {format === "story" ? (
        <span className="pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
          <span className="absolute inset-x-2 top-2 flex gap-1">
            {Array.from({ length: Math.max(slides.length, 1) }, (_, index) => (
              <span key={index} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/40">
                <span
                  className={`block h-full rounded-full bg-white ${
                    slides.length > 1
                      ? index < seen
                        ? "w-full"
                        : index === seen
                          ? "w-2/5"
                          : "w-0"
                      : "w-2/5"
                  }`}
                />
              </span>
            ))}
          </span>
          <span className="absolute inset-x-2.5 top-5 flex items-center text-white drop-shadow">
            <AccountMark name={name} photo={photo} light ai={Boolean(words.aiGenerated)} />
            <span className="ml-1.5 text-[11px] font-normal text-white/80">Now</span>
            <span className="ml-auto flex items-center gap-1.5">
              {video ? (
                <button
                  type="button"
                  aria-label={heard ? "Mute" : "Turn sound on"}
                  aria-pressed={heard}
                  onClick={toggleSound}
                  className="pointer-events-auto"
                >
                  {heard ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                </button>
              ) : null}
              <EllipsisVertical className="h-5 w-5" />
              <X className="h-5 w-5" />
            </span>
          </span>
          <span className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-2.5">
            <span className="flex h-8 min-w-0 flex-1 items-center rounded-full border border-white px-3 text-[13px] text-white">Send message</span>
            <Heart className="h-6 w-6 shrink-0 text-white" strokeWidth={1.75} />
          </span>
        </span>
      ) : null}
      {format === "reel" ? (
        <>
          <span className="pointer-events-none absolute bottom-3 right-2 flex flex-col items-center gap-3.5 text-white drop-shadow">
            <Heart className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
            <MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
            <Repeat2 className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
            <Send className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
            <Bookmark className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="pointer-events-none absolute bottom-3 left-3 right-12 flex min-w-0 flex-col gap-1 overflow-hidden">
            <AccountMark name={name} photo={photo} light ai={Boolean(words.aiGenerated)} />
            {words.caption?.trim() ? (
              <p className="line-clamp-2 min-w-0 text-xs text-white drop-shadow [overflow-wrap:anywhere]">{words.caption.trim()}</p>
            ) : null}
          </span>
        </>
      ) : null}
      {format === "story" && words.line?.trim() ? (
        <p className="pointer-events-none absolute inset-x-6 top-1/2 line-clamp-4 min-w-0 -translate-y-1/2 text-center text-sm font-semibold text-white drop-shadow [overflow-wrap:anywhere]">{words.line.trim()}</p>
      ) : null}
      {format === "post" && slides.length > 1 ? (
        <span className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show picture ${index + 1}`}
              aria-pressed={index === seen}
              onClick={() => onSee(index)}
              className={`h-1.5 w-1.5 rounded-full ${index === seen ? "bg-white" : "bg-white/45"}`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
  if (format !== "post") {
    const shell = `mx-auto w-full min-w-0 shrink-0 ${tall ? "max-w-[16rem]" : "max-w-[18rem]"}`;
    const placeable = (format === "story" || format === "reel") && hasFile && !video;
    if (!placeable) {
      return <div className={`${shell} overflow-hidden rounded-xl`}>{frame}</div>;
    }
    return (
      <div className="w-full min-w-0">
        {locked ? null : (
          <div className="mx-auto mb-2 w-full max-w-[16rem]">
            <StoryPlaceRow place={words.storyPlace === "fit" ? "fit" : "fill"} onPlace={onStoryPlace} />
          </div>
        )}
        <div className={`${shell} overflow-hidden rounded-xl`}>{frame}</div>
        {format === "story" && showStrip ? (
          <Filmstrip
            slides={slides}
            seen={seen}
            onSee={onSee}
            onAdd={onAddPicture}
            onRemove={onRemoveSlide}
            onReorder={onReorder}
            onBroken={onBroken}
            adding={adding}
          />
        ) : null}
      </div>
    );
  }
  const chromeMotion = motion === "none" ? "none" : `grid-template-rows ${motion}, opacity ${motion}`;
  return (
    <div className="mx-auto flex w-full min-w-0 shrink-0 flex-col">
      {chrome ? (
        <div
          className="grid"
          style={{ gridTemplateRows: chromeOpen ? "1fr" : "0fr", opacity: chromeOpen ? 1 : 0, transition: chromeMotion }}
          aria-hidden={chromeOpen ? undefined : true}
          ref={(node) => {
            if (node) node.inert = !chromeOpen;
          }}
        >
          <div className="min-h-0 overflow-hidden pb-2">
            <CropRow crop={words.crop ?? "portrait"} onCrop={onCrop} />
          </div>
        </div>
      ) : null}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AccountMark name={name} photo={photo} square ai={Boolean(words.aiGenerated)} />
        <EllipsisVertical className="ml-auto h-5 w-5 text-neutral-800" aria-hidden="true" />
      </div>
      {frame}
      <div className="flex items-center gap-4 px-3 py-2.5 text-neutral-900">
        <Heart className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
        <MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
        <Repeat2 className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
        <Send className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
        <Bookmark className="ml-auto h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      {words.caption?.trim() ? <CaptionPreview name={name} text={words.caption.trim()} /> : null}
      {!words.commentsOff && words.firstComment?.trim() ? (
        <p className="line-clamp-2 min-w-0 px-3 pb-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">{words.firstComment.trim()}</p>
      ) : null}
      </div>
      {hasFile && !video && showStrip ? (
        <div className="pt-2">
          <Filmstrip
            slides={slides}
            seen={seen}
            onSee={onSee}
            onAdd={onAddPicture}
            onRemove={onRemoveSlide}
            onReorder={onReorder}
            onBroken={onBroken}
            adding={adding}
          />
        </div>
      ) : null}
    </div>
  );
}

function SortablePicture({
  slide,
  index,
  seen,
  onSee,
  onRemove,
  onBroken,
}: {
  slide: { id: string; url: string | null };
  index: number;
  seen: number;
  onSee: (index: number) => void;
  onRemove: (id: string) => void;
  onBroken?: (id: string) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative shrink-0 touch-none" {...attributes} {...listeners}>
      <button
        type="button"
        aria-label={`Picture ${index + 1}`}
        aria-pressed={index === seen}
        onClick={() => onSee(index)}
        className={`h-12 w-12 overflow-hidden rounded-md bg-neutral-200 ${
          index === seen ? "ring-2 ring-neutral-900" : ""
        } ${isDragging ? "opacity-80" : ""}`}
      >
        {slide.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.url} alt="" className="h-full w-full object-cover" onError={() => onBroken?.(slide.id)} />
        ) : null}
      </button>
      <button
        type="button"
        aria-label={`Remove picture ${index + 1}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onRemove(slide.id)}
        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white"
      >
        <X className="h-2.5 w-2.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Filmstrip({
  slides,
  seen,
  onSee,
  onAdd,
  onRemove,
  onReorder,
  onBroken,
  adding = false,
}: {
  slides: readonly { id: string; url: string | null }[];
  seen: number;
  onSee: (index: number) => void;
  onAdd: (file: File | undefined) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[], index: number, commit?: boolean) => void;
  onBroken?: (id: string) => void;
  adding?: boolean;
}): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const scrollStrip = useCallback((element: Element) => element === scroller.current, []);

  function rowEnd(box: HTMLElement): number {
    const row = box.firstElementChild as HTMLElement | null;
    if (!row) return 0;
    return Math.max(0, row.offsetWidth - box.clientWidth);
  }

  function measure(): void {
    const box = scroller.current;
    if (!box) return;
    const end = rowEnd(box);
    if (box.scrollLeft > end) box.scrollLeft = end;
    setCanLeft(box.scrollLeft > 1);
    setCanRight(box.scrollLeft < end - 1);
  }

  useEffect(() => {
    measure();
    const box = scroller.current;
    const thumb = box?.firstElementChild?.children[seen] as HTMLElement | undefined;
    if (box && thumb) {
      const view = box.getBoundingClientRect();
      const rect = thumb.getBoundingClientRect();
      if (rect.left < view.left) box.scrollBy({ left: rect.left - view.left, behavior: "auto" });
      else if (rect.right > view.right) box.scrollBy({ left: rect.right - view.right, behavior: "auto" });
    }
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(box);
    return () => observer.disconnect();
  }, [slides.length, seen]);

  function step(direction: -1 | 1): void {
    const box = scroller.current;
    if (!box) return;
    box.scrollBy({ left: direction * Math.max(box.clientWidth - 48, 54), behavior: "smooth" });
  }

  function onDragEnd(event: DragEndEvent): void {
    const overId = event.over?.id;
    if (!overId || overId === event.active.id) return;
    const ids = slides.map((slide) => slide.id);
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(overId));
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(ids, from, to);
    const viewed = next.indexOf(ids[seen] ?? "");
    onReorder(next, viewed < 0 ? to : viewed);
  }

  const overflow = canLeft || canRight;
  const showArrows = slides.length > 1;
  return (
    <div className="flex w-full min-w-0 items-center gap-3 pt-1.5">
      {showArrows ? (
        <button
          type="button"
          aria-label="Previous pictures"
          disabled={!canLeft}
          onClick={() => step(-1)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={{ canScroll: scrollStrip, threshold: { x: 0.2, y: 0 } }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={slides.map((slide) => slide.id)} strategy={horizontalListSortingStrategy}>
          <div
            ref={scroller}
            onScroll={measure}
            className={`flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${overflow ? "" : "justify-center"}`}
          >
            <div className="flex w-max shrink-0 gap-1.5 overflow-hidden px-0.5 pt-1">
            {slides.map((slide, index) => (
              <SortablePicture
                key={slide.id}
                slide={slide}
                index={index}
                seen={seen}
                onSee={onSee}
                onRemove={onRemove}
                onBroken={onBroken}
              />
            ))}
            {adding ? (
              <div
                role="status"
                aria-label="Uploading"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 text-neutral-500"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              </div>
            ) : slides.length < 10 ? (
              <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 text-neutral-500">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Add a picture</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Add a picture"
                  onChange={(event) => {
                    onAdd(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            </div>
          </div>
        </SortableContext>
      </DndContext>
      {showArrows ? (
        <button
          type="button"
          aria-label="Next pictures"
          disabled={!canRight}
          onClick={() => step(1)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function StoryPlaceRow({
  place,
  onPlace,
}: {
  place: "fill" | "fit";
  onPlace: (place: "fill" | "fit") => void;
}): JSX.Element {
  const choices: readonly { id: "fill" | "fit"; label: string }[] = [
    { id: "fill", label: "Fill" },
    { id: "fit", label: "Fit" },
  ];
  return (
    <div className="flex justify-center" role="group" aria-label="Photo in the frame">
      <div className="inline-flex rounded-full bg-neutral-100 p-1">
        {choices.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={place === item.id}
            onClick={() => onPlace(item.id)}
            className={`h-7 rounded-full px-2.5 text-xs font-medium ${
              place === item.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CropRow({
  crop,
  onCrop,
}: {
  crop: SocialCardCrop;
  onCrop: (crop: SocialCardCrop) => void;
}): JSX.Element {
  const crops: readonly { id: SocialCardCrop; label: string }[] = [
    { id: "original", label: "Original" },
    { id: "square", label: "1:1" },
    { id: "portrait", label: "4:5" },
    { id: "landscape", label: "16:9" },
  ];
  return (
    <div className="flex justify-center" role="group" aria-label="Crop">
      <div className="inline-flex rounded-full bg-neutral-100 p-1">
        {crops.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={crop === item.id}
            onClick={() => onCrop(item.id)}
            className={`h-7 rounded-full px-2.5 text-xs font-medium ${
              crop === item.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountMark({
  name,
  photo,
  light,
  square,
  ai = false,
}: {
  name: string;
  photo: string | null;
  light?: boolean;
  square?: boolean;
  ai?: boolean;
}): JSX.Element {
  const shape = square ? "h-8 w-8 rounded-lg border border-black/10" : "h-7 w-7 rounded-full";
  return (
    <span className="flex items-center gap-2.5">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" referrerPolicy="no-referrer" className={`${shape} object-cover`} />
      ) : (
        <span className={`${shape} bg-muted`} aria-hidden="true" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className={`font-semibold ${square ? "text-sm text-neutral-900" : "text-xs"} ${light ? "text-white drop-shadow" : ""}`}>{name}</span>
        {ai ? (
          <span className={`text-[11px] font-normal leading-none ${light ? "text-white/80 drop-shadow" : "text-neutral-500"}`}>AI info</span>
        ) : null}
      </span>
    </span>
  );
}

function Composer({
  card,
  title,
  topic,
  topics,
  note,
  format,
  words,
  busy,
  error,
  preview,
  handle,
  photo,
  files,
  links,
  columns,
  currentColumnId,
  studio,
  made,
  uploading,
  adding,
  saveMark,
  chosenId,
  onChoose,
  onRelocate,
  readyDrop,
  postAt,
  onTitle,
  onTopic,
  onNote,
  onRemoveLink,
  onAddFiles,
  onRemoveItem,
  onPut,
  onFormat,
  onChooseFormat,
  onWord,
  onFlag,
  onByHand,
  onMarkPosted,
  onMove,
  onWarn,
  onMarkReady,
  onAttach,
  frames,
  frameUrls,
  fileId,
  slideOrder,
  hidden,
  seen,
  onSee,
  onAddPicture,
  onRemoveFrame,
  onReorder,
  onBroken,
  onUseReference,
  onRemoveFile,
  onPostAt,
  onSaveTime,
  onPostNow,
  onClearTime,
  sending,
  sent,
  publishIssue,
  onDelete,
  onClose,
  onSubmit,
}: {
  card: SocialCard;
  title: string;
  topic: string;
  topics: readonly string[];
  note: string;
  format: SocialCardFormat | "";
  words: SocialCardWords;
  busy: boolean;
  error: string | null;
  preview: string | null;
  handle: string;
  photo: string | null;
  files: ShelfFile[];
  links: ResourceLink[];
  columns: readonly PanelColumn[];
  currentColumnId: string;
  studio: boolean;
  made: boolean;
  uploading: boolean;
  adding: boolean;
  saveMark: "idle" | "saving" | "saved";
  chosenId: string | null;
  onChoose: (columnId: string) => void;
  onRelocate: (columnId: string) => void;
  readyDrop: ReadyDrop;
  postAt: string;
  onTitle: (value: string) => void;
  onTopic: (value: string) => void;
  onNote: (value: string) => void;
  onRemoveLink: (id: string) => void;
  onAddFiles: (files: File[], at: number | null) => void;
  onRemoveItem: (id: string) => void;
  onPut: (id: string, at: number) => void;
  onFormat: (value: SocialCardFormat | "") => void;
  onChooseFormat: (format: SocialCardFormat) => void;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed" | "shareToStory" | "commentsOff", value: boolean) => void;
  onByHand: (byHand: boolean) => void;
  onMarkPosted: () => void;
  onMove: (columnId: string) => void;
  onWarn: (message: string) => void;
  onMarkReady: () => void;
  onAttach: (file: File | undefined) => void;
  frames: SocialFrame[];
  frameUrls: Record<string, string>;
  fileId: string | null;
  slideOrder: string[] | null;
  hidden: readonly string[];
  seen: number;
  onSee: (index: number) => void;
  onAddPicture: (file: File | undefined) => void;
  onRemoveFrame: (id: string) => void;
  onReorder: (ids: string[], index: number, commit?: boolean) => void;
  onBroken: (id: string) => void;
  onUseReference: (id: string) => void;
  onRemoveFile: () => void;
  onPostAt: (value: string) => void;
  onSaveTime: () => void;
  onPostNow: () => void;
  onClearTime: () => void;
  sending: boolean;
  sent: { url: string | null } | null;
  publishIssue: string | null;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element {
  const noteRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const [line, setLine] = useState(0);
  const [noteFocus, setNoteFocus] = useState(0);
  const [offer, setOffer] = useState<{ text: string; top: number; left: number } | null>(null);
  const targets = liftTargets(format);
  const { over, dropProps } = useSheetFileDrop((next) => onAddFiles(next, null));
  const release = card.stage === "ready";
  const [viewport, setViewport] = useState(0);
  const [heldNote, setHeldNote] = useState(!release);
  const [heldPlan, setHeldPlan] = useState(release);
  const [fade, setFade] = useState(release);
  const [present, setPresent] = useState(studio);
  const [revealed, setRevealed] = useState(studio);
  const glideOn = useRef(false);
  const reduce = reducedMotion();
  const makingId = columns.find((column) => column.kind === "making")?.id ?? null;
  useEffect(() => {
    if (card.title.trim().toLowerCase() !== "untitled") return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [card.id, card.title]);
  useLayoutEffect(() => {
    const measure = () => {
      const next = viewWidth();
      setViewport((current) => (current === next ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      glideOn.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    if (!glideOn.current || reduce) {
      setFade(release);
      setHeldNote(!release);
      setHeldPlan(release);
      return;
    }
    let follow = 0;
    const timer = window.setTimeout(() => {
      if (release) setHeldNote(false);
      else setHeldPlan(false);
    }, 1000);
    if (release) setHeldPlan(true);
    else setHeldNote(true);
    const frame = requestAnimationFrame(() => {
      follow = requestAnimationFrame(() => setFade(release));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(follow);
      window.clearTimeout(timer);
    };
  }, [release, reduce]);
  useLayoutEffect(() => {
    if (!studio) return;
    setPresent(true);
    if (reduce) setRevealed(true);
  }, [studio, reduce]);
  useEffect(() => {
    if (studio) {
      if (reduce || !present || revealed) return;
      const frame = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(frame);
    }
    if (!present) return;
    setRevealed(false);
    if (reduce) {
      setPresent(false);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), 540);
    return () => window.clearTimeout(timer);
  }, [studio, present, revealed, reduce]);
  function pickColumn(columnId: string): void {
    const column = columns.find((item) => item.id === columnId);
    if (!column || column.id === currentColumnId) return;
    const warning = readyStageWarning(card, column.kind);
    if (warning) {
      onWarn(warning);
      return;
    }
    if (studio) onMove(columnId);
    else onRelocate(columnId);
  }
  const tall = format === "reel" || format === "story";
  const video = card.fileKind === "video" || (preview ? looksLikeVideo(preview) : false);
  const slides = arrangedSlides(
    [
      ...(card.hasFile ? [{ id: fileId ?? "piece", url: preview }] : []),
      ...frames.map((frame) => ({ id: frame.id, url: frameUrls[frame.id] ?? null })),
    ].filter((slide) => !hidden.includes(slide.id)),
    slideOrder ? slideOrder.filter((id) => !hidden.includes(id)) : null
  );
  const safeSeen = slides.length === 0 ? 0 : Math.min(seen, slides.length - 1);
  const currentSlide = slides[safeSeen];
  const hasPictures = slides.length > 0;
  const shown = hasPictures ? (currentSlide?.url ?? null) : null;
  const shownVideo = !currentSlide || currentSlide.id === (fileId ?? "piece") ? video : false;

  function onSelect(): void {
    const box = noteRef.current;
    if (!box) return;
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && box.contains(active)) {
      const typed = active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0).trim();
      if (typed) {
        const rect = active.getBoundingClientRect();
        const placed = placeOnScreen(
          { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
          { width: 220, height: 36 },
          { width: window.innerWidth, height: window.innerHeight },
          "below"
        );
        setOffer({ text: typed, top: placed.top, left: placed.left });
        return;
      }
    }
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (
      !text ||
      !selection ||
      selection.rangeCount === 0 ||
      !selection.anchorNode ||
      !box.contains(selection.anchorNode)
    ) {
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const placed = placeOnScreen(
      { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      { width: 220, height: 36 },
      { width: window.innerWidth, height: window.innerHeight },
      "below"
    );
    setOffer({ text, top: placed.top, left: placed.left });
  }

  function takeReference(event: DragEvent<HTMLElement>): void {
    if (!Array.from(event.dataTransfer.types).includes(RESOURCE_DRAG)) return;
    event.preventDefault();
    const resource = readResourceDrag(event);
    if (resource?.kind === "file") onUseReference(resource.id);
  }

  const measures = sheetMeasures(viewport);
  const slim = made && !release;
  const previewOpen = slim || release || revealed ? measures.preview : 0;
  const noteWidth = slim ? 0 : fade ? SHELF + measures.note : measures.note;
  const cardWidth = slim ? previewOpen : (fade ? 0 : SHELF) + noteWidth + previewOpen;
  const left = placeCard(viewport, cardWidth);
  const ease = glideOn.current && !reduce ? STAGE_GLIDE : "none";
  const glide = ease === "none" ? "none" : `width ${ease}`;
  const curve = "cubic-bezier(0.22, 1, 0.36, 1)";
  const cover = ease === "none" ? "none" : `width 520ms ${curve} 200ms`;
  const shelfMotion = ease === "none"
    ? "none"
    : fade
      ? `transform 520ms ${curve} 200ms, opacity 180ms ease 720ms`
      : `transform 520ms ${curve} 200ms, opacity 200ms ease 200ms`;
  const noteMotion = ease === "none"
    ? "none"
    : fade
      ? "opacity 200ms cubic-bezier(0.4, 0, 1, 1), transform 200ms cubic-bezier(0.4, 0, 1, 1)"
      : `opacity 340ms ${curve} 560ms, transform 340ms ${curve} 560ms`;
  const planMotion = ease === "none"
    ? "none"
    : fade
      ? `opacity 340ms ${curve} 560ms, transform 340ms ${curve} 560ms`
      : "opacity 200ms cubic-bezier(0.4, 0, 1, 1), transform 200ms cubic-bezier(0.4, 0, 1, 1)";
  const clearMotion = ease === "none"
    ? "none"
    : fade
      ? "grid-template-rows 200ms cubic-bezier(0.4, 0, 1, 1), grid-template-columns 200ms cubic-bezier(0.4, 0, 1, 1), opacity 200ms cubic-bezier(0.4, 0, 1, 1)"
      : `grid-template-rows 340ms ${curve} 560ms, grid-template-columns 340ms ${curve} 560ms, opacity 340ms ${curve} 560ms`;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center bg-black/50 p-4"
      style={{
        justifyContent: "flex-start",
        paddingLeft: left,
        paddingRight: MARGIN,
        transition: ease === "none" ? "none" : `padding-left ${ease}`,
      }}
      role="dialog"
      aria-label={`Card ${card.title}`}
      onMouseDown={onClose}
    >
      <form
        aria-label={`Card ${card.title}`}
        className="relative flex h-[calc(100vh-6rem)] shrink-0 items-stretch overflow-visible [filter:drop-shadow(0_24px_48px_rgba(0,0,0,0.28))]"
        style={{ width: cardWidth, transition: glide }}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        {...dropProps}
      >
        <>
        <div
          className="relative z-0 h-full shrink-0"
          style={{ width: slim || fade ? 0 : SHELF, transition: cover }}
          aria-hidden={slim || fade ? true : undefined}
          ref={(node) => {
            if (node) node.inert = slim || fade;
          }}
        >
          <div
            className="absolute inset-y-0 right-0 overflow-hidden rounded-l-xl bg-card"
            style={{
              opacity: slim || fade ? 0 : 1,
              transform: slim || fade ? `translateX(${SHELF}px)` : undefined,
              transition: shelfMotion,
              pointerEvents: slim || fade ? "none" : undefined,
            }}
          >
            <ScrapShelf
              folded={fade}
              items={files}
              links={links}
              dropping={over}
              dropProps={dropProps}
              onAdd={() => {
                insertAt.current = null;
                fileRef.current?.click();
              }}
              onRemove={onRemoveItem}
              onPut={(id) => onPut(id, line)}
              onRemoveLink={onRemoveLink}
            />
          </div>
        </div>
        <div
          className={`relative z-10 flex h-full min-w-0 flex-1 overflow-hidden bg-card rounded-r-xl ${fade ? "rounded-l-xl" : ""} ${over ? "ring-2 ring-primary" : ""}`}
          style={{ transition: ease === "none" ? "none" : `border-radius 520ms ${curve} 200ms` }}
        >
          <div
            className="flex h-full shrink-0 flex-col overflow-hidden"
            style={{ width: noteWidth, transition: cover }}
            aria-hidden={slim ? true : undefined}
            ref={(node) => {
              if (node) node.inert = slim;
            }}
          >
            <div className="flex items-center gap-2 px-5 py-3">
              <StageTrack columns={columns} currentId={currentColumnId} onPick={pickColumn} />
              <div className="ml-auto flex items-center gap-1">
                {heldNote && !slim ? (
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: fade ? "0fr" : "1fr",
                      opacity: fade ? 0 : 1,
                      transition: clearMotion,
                    }}
                    aria-hidden={fade ? true : undefined}
                    ref={(node) => {
                      if (node) node.inert = fade;
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                      <div className="flex w-max items-center gap-1">
                      {topic.trim() ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-foreground">
                          {topic.trim()}
                          <button
                            type="button"
                            aria-label="Remove tag"
                            onClick={() => onTopic("")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      ) : null}
                      <TagPicker topic={topic} topics={topics} onChange={onTopic} searchLabel="Topic" />
                      </div>
                    </div>
                  </div>
                ) : null}
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
            <div className="relative min-h-0 flex-1">
              {heldNote && !slim ? (
              <div
                className="absolute inset-0 flex flex-col overflow-y-auto bg-card px-6 pb-2"
                style={{
                  opacity: fade ? 0 : 1,
                  transform: fade ? "translateY(8px)" : undefined,
                  transition: noteMotion,
                  pointerEvents: fade ? "none" : undefined,
                }}
                aria-hidden={fade ? true : undefined}
                ref={(node) => {
                  if (node) node.inert = fade;
                }}
              >
              <div className="mx-auto flex w-full max-w-[43.75rem] flex-1 flex-col">
              <input
                ref={titleRef}
                aria-label="Title"
                value={title}
                onChange={(event) => onTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  setNoteFocus((current) => current + 1);
                }}
                placeholder="A short title"
                maxLength={200}
                className="w-full bg-transparent text-3xl font-semibold leading-9 text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <div ref={noteRef} aria-label="Thought note" onMouseUp={onSelect} onKeyUp={onSelect}>
                <IdeaNote
                  value={note}
                  onChange={onNote}
                  onPhoto={(index) => {
                    insertAt.current = index;
                    fileRef.current?.click();
                  }}
                  onLine={setLine}
                  onDropFiles={(list, at) => onAddFiles(list, at)}
                  onDropResource={(kind, id, at) => {
                    if (kind === "file") onPut(id, at);
                  }}
                  files={files}
                  links={links}
                  focusRequest={noteFocus}
                />
              </div>
              {offer && targets.length > 0
                ? createPortal(
                    <div
                      className="fixed z-[70] flex gap-1 rounded-md border border-border bg-card p-1 shadow-lg"
                      style={{ top: offer.top, left: offer.left }}
                    >
                      {targets.map((target) => (
                        <button
                          key={target.key}
                          type="button"
                          className="rounded px-2 py-1 text-left text-sm text-foreground hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onWord(target.key, offer.text);
                            setOffer(null);
                            window.getSelection()?.removeAllRanges?.();
                          }}
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )
                : null}
              {error && !studio ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              </div>
              </div>
              ) : null}
              {heldPlan ? (
              <div
                className="absolute inset-0 overflow-y-auto bg-card px-6 pb-1"
                style={{
                  opacity: fade ? 1 : 0,
                  transform: fade ? undefined : "translateY(8px)",
                  transition: planMotion,
                  pointerEvents: fade ? undefined : "none",
                }}
                aria-hidden={fade ? undefined : true}
                ref={(node) => {
                  if (node) node.inert = !fade;
                }}
              >
                <div className="mx-auto min-h-full w-full max-w-[43.75rem]">
                  <ReleasePlan
                    title={title}
                    scheduledAt={card.scheduledAt}
                    postAt={postAt}
                    busy={busy}
                    error={error}
                    onPostAt={onPostAt}
                    onSaveTime={onSaveTime}
                    onPostNow={onPostNow}
                    onClearTime={onClearTime}
                    publishError={publishIssue}
                    sending={sending}
                    sent={sent}
                    onDone={onClose}
                    byHand={postsByHand(words)}
                    handLocked={postsByHand({ ...words, byHand: false })}
                    onByHand={onByHand}
                    onMarkPosted={onMarkPosted}
                    onHandNote={(value) => onWord("handNote", value)}
                    format={format}
                    words={words}
                  />
                </div>
              </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-3">
              <button type="button" onClick={onDelete} className="text-sm text-destructive">
                Delete
              </button>
              {studio ? (
                <span className="text-xs text-muted-foreground">Kept in the bin for 30 days.</span>
              ) : (
                <p className="text-sm text-muted-foreground" role="status">
                  {saveMark === "saving" ? "Saving" : saveMark === "saved" ? "Saved" : ""}
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={format === "post" || format === "reel" || format === "story" ? MEDIA_FILE_ACCEPT : FILE_ACCEPT}
                aria-label={studio ? "Add a reference" : `Attach the file for ${card.title}`}
                className="sr-only"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  const at = insertAt.current;
                  insertAt.current = null;
                  if (picked.length > 0) onAddFiles(picked, at);
                  event.target.value = "";
                }}
              />
              {studio && heldNote ? (
                <div
                  className="ml-auto grid"
                  style={{
                    gridTemplateColumns: fade ? "0fr" : "1fr",
                    opacity: fade ? 0 : 1,
                    transition: clearMotion,
                  }}
                  aria-hidden={fade ? true : undefined}
                  ref={(node) => {
                    if (node) node.inert = fade;
                  }}
                >
                  <div className="min-w-0 overflow-hidden">
                    <button
                      type="submit"
                      disabled={busy || fade || title.trim().length === 0}
                      className="h-9 whitespace-nowrap rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : studio ? null : (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {card.stage === "chosen" && makingId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRelocate(makingId)}
                      className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Start making
                    </button>
                  ) : chosenId ? (
                    <button
                      type="button"
                      onClick={() => onChoose(chosenId)}
                      className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                      Choose
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        {present ? (
        <aside
          aria-label="Preview"
          aria-hidden={studio ? undefined : true}
          className="h-full shrink-0 overflow-hidden"
          style={{ width: previewOpen, transition: glide }}
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer.types).includes(RESOURCE_DRAG)) event.preventDefault();
          }}
          onDrop={takeReference}
        >
          <div
            className={`flex h-full flex-col bg-muted/20 ${slim ? "overflow-hidden rounded-xl border border-border bg-card" : "border-l border-border"}`}
            style={{ width: measures.preview }}
          >
          {slim ? (
            <div className="px-3 pt-3">
              <input
                ref={titleRef}
                aria-label="Title"
                value={title}
                onChange={(event) => onTitle(event.target.value)}
                placeholder="A short title"
                maxLength={200}
                className="w-full bg-transparent text-2xl font-semibold leading-8 text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-center gap-2 border-b border-border px-3 py-3">
            {release ? (
              <p className="text-sm text-muted-foreground">{previewFace(format, words.crop)}</p>
            ) : (
            <div className="flex gap-1" role="group" aria-label="Format">
              {FORMATS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={format === item.id}
                  disabled={busy || uploading}
                  style={{ transition: ease === "none" ? "none" : `color ${ease}, background-color ${ease}, border-color ${ease}` }}
                  className={`h-8 rounded-full px-3 text-sm ${
                    format === item.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground"
                  }`}
                  onClick={() => (format ? onFormat(item.id) : onChooseFormat(item.id))}
                >
                  {item.label}
                </button>
              ))}
            </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-3">
            {uploading && !shown && !card.hasFile ? (
              <div
                role="status"
                aria-label="Uploading"
                className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
              >
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                <p className="text-sm">Uploading</p>
              </div>
            ) : (
            <div className="relative">
            <InstaPreview
              format={format}
              words={words}
              preview={shown}
              video={shownVideo}
              hasFile={hasPictures}
              title={card.title}
              handle={handle}
              photo={photo}
              tall={tall}
              locked={fade}
              motion={ease === "none" ? "none" : "200ms cubic-bezier(0.4, 0, 1, 1)"}
              onAttach={onAttach}
              onCrop={(crop) => onWord("crop", crop)}
              onStoryPlace={(place) => onWord("storyPlace", place)}
              slides={slides}
              seen={safeSeen}
              onSee={onSee}
              onAddPicture={onAddPicture}
              onRemoveSlide={onRemoveFrame}
              onReorder={onReorder}
              onBroken={onBroken}
              adding={adding}
              showStrip={!release}
            />
            {uploading ? (
              <div
                role="status"
                aria-label="Uploading"
                className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60"
              >
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : null}
            </div>
            )}
            {heldNote && !fade ? (
              <p
                className={`min-h-5 text-sm text-destructive ${
                  format === "reel" || format === "story"
                    ? "mx-auto w-full max-w-[16rem]"
                    : format === "post"
                      ? "w-full"
                      : "mx-auto w-full max-w-[18rem]"
                }`}
                role={error ? "alert" : undefined}
              >
                {error ?? ""}
              </p>
            ) : null}
              {heldNote ? (
              <div
                className="grid"
                style={{
                  gridTemplateRows: fade ? "0fr" : "1fr",
                  opacity: fade ? 0 : 1,
                  transition: clearMotion,
                }}
                aria-hidden={fade ? true : undefined}
                ref={(node) => {
                  if (node) node.inert = fade;
                }}
              >
              <div className="min-h-0 overflow-hidden pb-2">
              {hasPictures && (format === "reel" || (format === "story" && video)) ? (
                <div className="mt-2 flex justify-end">
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onRemoveFile}>
                    Remove file
                  </button>
                </div>
              ) : null}
              {format ? (
              <WordFields
                format={format}
                words={words}
                busy={busy}
                onWord={onWord}
                onFlag={onFlag}
                onByHand={onByHand}
                pinMore
              />
            ) : null}
              </div>
              </div>
              ) : null}
              {release && !heldNote ? (
                <CopyFields format={format} words={words} storyCount={format === "story" ? slides.length : 0} />
              ) : null}
          </div>
          {card.stage === "making" ? (
            <div className="px-3 py-3">
              <button
                type="button"
                disabled={busy || uploading || !format || readyDrop !== "move"}
                className="h-10 w-full rounded-md bg-primary text-sm text-primary-foreground disabled:opacity-50"
                onClick={onMarkReady}
              >
                {readyButton(format, readyDrop)}
              </button>
            </div>
          ) : null}
          </div>
          </div>
        </aside>
        ) : null}
        </div>
        </>
      </form>
    </div>,
    document.body,
  );
}

