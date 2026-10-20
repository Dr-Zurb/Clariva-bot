"use client";

/**
 * One card (soc-05, soc-16). A thought can take a topic.
 * Chosen uses the same notebook. Start making asks for the format. Ready is where the file sits.
 */

import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, EllipsisVertical, Heart, ImagePlus, MessageCircle, Play, Plus, Repeat2, Send, VolumeX, X } from "lucide-react";
import { getInstagramStatus } from "@/lib/api";
import {
  FILE_ACCEPT,
  IdeaNote,
  SCRAP_CAP,
  ScrapShelf,
  TagPicker,
  fileOpenFromUrl,
  placeFile,
  placeLink,
  normalizeLink,
  LIFT_DRAG,
  RESOURCE_DRAG,
  readResourceDrag,
  stripFile,
  stripLink,
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
  orderSocialCardFrames,
  removeSocialCardFile,
  removeSocialCardFrame,
  removeSocialCardScrap,
  socialFileIssue,
  socialFileKind,
  updateSocialCard,
  type SocialCard,
  type SocialFrame,
  type SocialScrap,
  type SocialCardFormat,
  type SocialCardWords,
} from "./social-cards";

const FORMATS: readonly { id: SocialCardFormat; label: string }[] = [
  { id: "post", label: "Post" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
];

type PanelColumn = {
  id: string;
  kind: string;
  label: string;
};

type ReadyDrop = "stay" | "needs-file" | "needs-media" | "needs-format" | "move";

function stillMissing(format: SocialCardFormat | "", drop: ReadyDrop): string[] {
  const gaps: string[] = [];
  if (!format) gaps.push("A format");
  if (drop === "needs-file") gaps.push("A file");
  if (drop === "needs-media" || drop === "needs-format") gaps.push("A file that cannot post");
  return gaps;
}

export function SocialCardPanel({
  token,
  card,
  columns,
  topics = [],
  readyDrop,
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
  const [askLink, setAskLink] = useState(false);
  const [words, setWords] = useState<SocialCardWords>(wordsFromCard(card));
  const [note, setNote] = useState(card.words.note ?? "");
  const [extra, setExtra] = useState<SocialScrap[]>(card.scraps ?? []);
  const [frames, setFrames] = useState<SocialFrame[]>(card.frames ?? []);
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(0);
  const [pictureTick, setPictureTick] = useState(0);
  const [scrapUrls, setScrapUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [postAt, setPostAt] = useState(toLocalInput(card.scheduledAt));
  const [postUrl, setPostUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMark, setSaveMark] = useState<"idle" | "saving" | "saved">("idle");
  const savedKey = useRef<string | null>(null);
  const saveChain = useRef(Promise.resolve());
  const wordsRef = useRef(words);
  wordsRef.current = words;
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
    setWords((current) => {
      if (current.firstComment || !card.pagePath?.includes("?c=")) return current;
      return { ...current, firstComment: card.pagePath };
    });
  }, [card.pagePath]);
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
          if (!cancelled) setScrapUrls((current) => ({ ...current, [scrap.id]: url }));
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
  }, [card.frames]);
  useEffect(() => {
    if (!isStudio || frames.length === 0) return;
    let cancelled = false;
    for (const frame of frames) {
      void getSocialCardFrameUrl(token, card.id, frame.id)
        .then((url) => {
          if (!cancelled) setFrameUrls((current) => ({ ...current, [frame.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [isStudio, frameKey, card.id, token, frames, pictureTick]);
  const asksForWords =
    card.stage === "making" || card.stage === "ready" || card.stage === "posted";
  const currentColumnId =
    card.stage === "custom"
      ? (card.columnId ?? "")
      : (columns.find((column) => column.kind === card.stage)?.id ?? "");

  function setWord(key: keyof SocialCardWords, value: string): void {
    setWords((current) => ({ ...current, [key]: value }));
  }

  function setFlag(key: "aiGenerated" | "shareToFeed", value: boolean): void {
    setWords((current) => ({ ...current, [key]: value }));
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

  function thoughtKey(snap: { title: string; topic: string; note: string; links: ResourceLink[] }): string {
    return JSON.stringify({
      title: snap.title.trim() || "untitled",
      topic: snap.topic,
      note: snap.note,
      links: snap.links.map((item) => `${item.id}|${item.url}`),
    });
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

  function pasteLink(url: string, at: number): void {
    const next = normalizeLink(url);
    if (!next) return;
    const id = links.find((item) => item.url === next)?.id ?? crypto.randomUUID();
    setLinks((current) => (current.some((item) => item.url === next) ? current : [...current, { id, url: next }]));
    setNote((current) => placeLink(current, id, at));
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
      onClose();
      return;
    }
    void saveThought().then((ok) => {
      if (!ok) return;
      onMove(columnId);
      onClose();
    });
  }

  async function startMaking(nextFormat: SocialCardFormat): Promise<void> {
    const flushed = await saveThought();
    if (!flushed) return;
    const making = columns.find((column) => column.kind === "making");
    const nextTitle = title.trim() || "untitled";
    const typedLink = link.trim();
    const nextLink = typedLink ? normalizeLink(typedLink) ?? "" : "";
    if (!making || busy) return;
    if (typedLink && !nextLink) {
      setError("Use a link");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keepLinks = links.length > 0 || Boolean(card.sourceUrl) || (card.links?.length ?? 0) > 0;
      await updateSocialCard(token, card.id, {
        title: nextTitle,
        format: nextFormat,
        topic: topic.trim() || null,
        ...(keepLinks ? { links, sourceUrl: links[0]?.url ?? null } : { sourceUrl: nextLink || null }),
        words: withNote(words, note),
      });
      onMove(making.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the card");
    } finally {
      setBusy(false);
    }
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
      onClose();
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
    const issue = socialFileIssue(file, card.stage === "ready");
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await attachSocialCardFile(token, card.id, file);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not attach the file");
    } finally {
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
    if (format === "post" && card.hasFile && scrap.fileKind === "photo") {
      if (frames.length + 1 >= 10) {
        setError("A post holds ten pictures");
        return;
      }
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
        setFrames(saved.frames ?? []);
        setSeen(saved.frames?.length ?? 0);
        setPictureTick((current) => current + 1);
        await onSaved();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not use the file");
      } finally {
        setBusy(false);
      }
      return;
    }
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
      await attachSocialCardFile(token, card.id, file);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not use the file");
    } finally {
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
      setError("A post holds ten pictures");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await addSocialCardFrame(token, card.id, file);
      setFrames(saved.frames ?? []);
      setSeen(saved.frames?.length ?? 0);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the picture");
    } finally {
      setBusy(false);
    }
  }

  async function removeFrame(frameId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await removeSocialCardFrame(token, card.id, frameId);
      setFrames(saved.frames ?? []);
      setSeen(0);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not remove the picture");
    } finally {
      setBusy(false);
    }
  }

  async function reorderSlides(ids: string[], nextSeen: number): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await orderSocialCardFrames(token, card.id, ids);
      setFrames(saved.frames ?? []);
      setSeen(nextSeen);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reorder the pictures");
    } finally {
      setBusy(false);
    }
  }

  async function saveTime(): Promise<void> {
    if (!postAt || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, { scheduledAt: fromLocalInput(postAt) });
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the time");
    } finally {
      setBusy(false);
    }
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

  async function markPosted(): Promise<void> {
    const next = postUrl.trim();
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSocialCard(token, card.id, { instagramUrl: next });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the link");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await removeSocialCardFile(token, card.id);
      setFrames(saved.frames ?? []);
      setSeen(0);
      setPictureTick((current) => current + 1);
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not remove the file");
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(list: File[], at: number | null): Promise<void> {
    if (busy) return;
    const counts = { photo: 0, video: 0, audio: 0, document: 0 };
    if (card.hasFile) counts[card.fileKind ?? "photo"] += 1;
    for (const scrap of extra) counts[scrap.fileKind ?? "photo"] += 1;
    const accepted: File[] = [];
    let overflow = false;
    for (const file of list) {
      const kind = socialFileKind(file);
      if (kind && counts[kind] >= SCRAP_CAP) {
        overflow = true;
        continue;
      }
      if (kind) counts[kind] += 1;
      accepted.push(file);
    }
    if (accepted.length === 0) {
      setError(overflow ? "The pile is full" : "Use a photo, a video, audio, or a document");
      return;
    }
    if (overflow) setError("The pile is full");
    setBusy(true);
    try {
      let nextNote = note;
      const saved: SocialScrap[] = [];
      for (const file of accepted) {
        const issue = socialFileIssue(file);
        if (issue) {
          setError(issue);
          continue;
        }
        const scrap = await addSocialCardScrap(token, card.id, file);
        saved.push(scrap);
        if (at !== null && saved.length === 1) nextNote = placeFile(nextNote, scrap.id, at);
      }
      if (saved.length > 0) {
        setExtra((current) => [...current, ...saved]);
        if (nextNote !== note) setNote(nextNote);
        if (accepted.length === saved.length && !overflow) setError(null);
      }
      await onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add the file");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string): Promise<void> {
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

  function addResourceLink(url: string): void {
    setError((current) => (current === "Use a link" ? null : current));
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

  const pieceKind = card.fileKind;
  const pile: ShelfFile[] = [
    ...(card.hasFile
      ? [
          {
            id: "piece",
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
  ];

  const chosen = columns.find((column) => column.kind === "chosen");

  if (isThought) {
    return (
      <ThoughtSheet
        card={card}
        title={title}
        topic={topic}
        link={link}
        note={note}
        busy={busy}
        error={error}
        chosenId={chosen?.id ?? null}
        topics={topics}
        onTitle={setTitle}
        onTopic={setTopic}
        onLink={setLink}
        onNote={setNote}
        files={pile}
        links={links}
        askLink={askLink}
        onAskLink={() => setAskLink(true)}
        onAddLink={addResourceLink}
        onRemoveLink={removeResourceLink}
        onAddFiles={(list, at) => void addFiles(list, at)}
        onRemoveItem={(id) => void removeItem(id)}
        onPut={(id, at) => setNote((current) => placeFile(current, id, at))}
        onPutLink={(id, at) => setNote((current) => placeLink(current, id, at))}
        saveMark={saveMark}
        columns={columns}
        currentColumnId={currentColumnId}
        onPasteLink={pasteLink}
        onRelocate={relocateThought}
        onWarn={setError}
        onChoose={relocateThought}
        onStartMaking={(nextFormat) => void startMaking(nextFormat)}
        onDelete={onDelete}
        onClose={dismissThought}
        onSubmit={() => void saveThought()}
      />
    );
  }

  if (isStudio) {
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
        files={pile.filter((item) => item.id !== "piece")}
        links={links}
        askLink={askLink}
        columns={columns}
        currentColumnId={currentColumnId}
        readyDrop={readyDrop}
        postAt={postAt}
        postUrl={postUrl}
        onTitle={setTitle}
        onTopic={setTopic}
        onNote={setNote}
        onAskLink={() => setAskLink(true)}
        onPasteLink={pasteLink}
        onAddLink={addResourceLink}
        onRemoveLink={removeResourceLink}
        onPutLink={(id, at) => setNote((current) => placeLink(current, id, at))}
        onAddFiles={(list, at) => void addFiles(list, at)}
        onRemoveItem={(id) => void removeItem(id)}
        onPut={(id, at) => setNote((current) => placeFile(current, id, at))}
        onFormat={setFormat}
        onChooseFormat={(next) => void chooseFormat(next)}
        onWord={setWord}
        onFlag={setFlag}
        onMove={onMove}
        onMarkReady={() => void markReady()}
        onAttach={(file) => void attach(file)}
        frames={frames}
        frameUrls={frameUrls}
        seen={seen}
        onSee={setSeen}
        onAddPicture={(file) => void addPicture(file)}
        onRemoveFrame={(id) => {
          if (id === "piece") void removeFile();
          else void removeFrame(id);
        }}
        onReorder={(ids, index) => void reorderSlides(ids, index)}
        onUseReference={(id) => void placeReference(id)}
        onRemoveFile={() => void removeFile()}
        onPostAt={setPostAt}
        onPostUrl={setPostUrl}
        onSaveTime={() => void saveTime()}
        onClearTime={() => void clearTime()}
        onMarkPosted={() => void markPosted()}
        onDelete={onDelete}
        onClose={onClose}
        onSubmit={() => void persist()}
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
            className="w-full bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/50"
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
              <WordFields format={format} words={words} onWord={setWord} onFlag={setFlag} />
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
                accept={FILE_ACCEPT}
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
              <label className="block text-xs text-muted-foreground">
                Instagram link
                <input
                  aria-label="Instagram link"
                  value={postUrl}
                  onChange={(event) => setPostUrl(event.target.value)}
                  placeholder="https://www.instagram.com/p/…"
                  maxLength={500}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>
              <p className="text-sm text-foreground">Paste the link after you post from your phone.</p>
              <button
                type="button"
                onClick={() => void markPosted()}
                disabled={busy || postUrl.trim().length === 0}
                className="text-sm text-foreground disabled:opacity-50"
              >
                This is posted
              </button>
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
  if (format === "reel") {
    return [
      { key: "hook", label: "Hook" },
      { key: "coverLine", label: "Cover line" },
      { key: "caption", label: "Caption" },
    ];
  }
  if (format === "story") return [{ key: "line", label: "Line" }];
  return [];
}

function WordFields({
  format,
  words,
  onWord,
  onFlag,
}: {
  format: SocialCardFormat | "";
  words: SocialCardWords;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed", value: boolean) => void;
}): JSX.Element | null {
  if (!format) return null;
  const byHand = Boolean(words.music?.trim() || words.stickers?.trim() || words.productTag?.trim());
  return (
    <div className="space-y-3">
      {format === "reel" ? (
        <>
          <WordInput label="Hook" value={words.hook ?? ""} onChange={(value) => onWord("hook", value)} onLift={(value) => onWord("hook", value)} />
          <WordInput
            label="Cover line"
            value={words.coverLine ?? ""}
            onChange={(value) => onWord("coverLine", value)}
            onLift={(value) => onWord("coverLine", value)}
          />
        </>
      ) : null}
      {format === "story" ? (
        <WordInput label="Line" value={words.line ?? ""} onChange={(value) => onWord("line", value)} onLift={(value) => onWord("line", value)} />
      ) : (
        <CaptionField value={words.caption ?? ""} onChange={(value) => onWord("caption", value)} onLift={(value) => onWord("caption", value)} />
      )}
      <WordInput label="First comment" value={words.firstComment ?? ""} onChange={(value) => onWord("firstComment", value)} />
      <div className="rounded-xl bg-muted/40 px-3 py-2">
        <p className="text-sm font-medium text-foreground">{byHand ? "Notify me" : "Automatic"}</p>
        <p className="text-xs text-muted-foreground">
          {byHand ? "You'll get a reminder to post this from your phone." : "This can go out on its own."}
        </p>
      </div>
      <MoreFields format={format} words={words} onWord={onWord} onFlag={onFlag} />
    </div>
  );
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
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Caption</span>
        <span>{remaining}</span>
      </span>
      <textarea
        aria-label="Caption"
        value={value}
        rows={4}
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
        className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function MoreFields({
  format,
  words,
  onWord,
  onFlag,
}: {
  format: SocialCardFormat;
  words: SocialCardWords;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed", value: boolean) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between rounded-xl px-1 text-sm text-foreground"
      >
        More
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="space-y-3 pt-1">
          <WordInput label="Alt text" value={words.altText ?? ""} onChange={(value) => onWord("altText", value)} onLift={(value) => onWord("altText", value)} />
          <WordInput label="Location" value={words.location ?? ""} onChange={(value) => onWord("location", value)} />
          <WordInput label="Collaborators" value={words.collaborator ?? ""} onChange={(value) => onWord("collaborator", value)} />
          <FlagRow label="AI-generated" on={Boolean(words.aiGenerated)} onToggle={() => onFlag("aiGenerated", !words.aiGenerated)} />
          {format === "reel" ? (
            <FlagRow label="Share to the feed" on={Boolean(words.shareToFeed)} onToggle={() => onFlag("shareToFeed", !words.shareToFeed)} />
          ) : null}
          <WordInput label="Music" value={words.music ?? ""} onChange={(value) => onWord("music", value)} />
          <WordInput label="Stickers" value={words.stickers ?? ""} onChange={(value) => onWord("stickers", value)} />
          <WordInput label="Product" value={words.productTag ?? ""} onChange={(value) => onWord("productTag", value)} />
        </div>
      ) : null}
    </div>
  );
}

function FlagRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left"
    >
      <span className="text-sm text-foreground">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function WordInput({
  label,
  value,
  onChange,
  onLift,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onLift?: (value: string) => void;
  multiline?: boolean;
}): JSX.Element {
  const className =
    "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
  const drop = onLift
    ? {
        onDragOver: (event: DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (Array.from(event.dataTransfer.types).includes(LIFT_DRAG)) event.preventDefault();
        },
        onDrop: (event: DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          const text = event.dataTransfer.getData(LIFT_DRAG);
          if (!text) return;
          event.preventDefault();
          onLift(text);
        },
      }
    : {};
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          className={className}
          {...drop}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${className} h-9`}
          {...drop}
        />
      )}
    </label>
  );
}

function wordsFromCard(card: SocialCard): SocialCardWords {
  const words = card.words ?? {};
  if (words.firstComment || !card.pagePath?.includes("?c=")) return words;
  return { ...words, firstComment: card.pagePath };
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
  const stickers = keep(words.stickers);
  const productTag = keep(words.productTag);
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
  if (words.aiGenerated) next.aiGenerated = true;
  if (words.shareToFeed) next.shareToFeed = true;
  if (music) next.music = music;
  if (stickers) next.stickers = stickers;
  if (productTag) next.productTag = productTag;
  if (shots.length > 0) next.shots = shots;
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
  slides,
  seen,
  onSee,
  onAddPicture,
  onRemoveSlide,
  onReorder,
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
  onCrop: (crop: "portrait" | "square" | "original") => void;
  slides: readonly { id: string; url: string | null }[];
  seen: number;
  onSee: (index: number) => void;
  onAddPicture: (file: File | undefined) => void;
  onRemoveSlide: (id: string) => void;
  onReorder: (ids: string[], index: number) => void;
}): JSX.Element {
  const name = handle || "Your account";
  const aspect = tall
    ? "aspect-[9/16]"
    : words.crop === "square"
      ? "aspect-square"
      : words.crop === "original"
        ? "aspect-[3/2]"
        : "aspect-[4/5]";
  const media = preview ? (
    video ? (
      <video src={preview} className="h-full w-full object-cover" muted playsInline />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt={words.altText ?? ""} className="h-full w-full object-cover" />
    )
  ) : hasFile ? (
    <p className="flex h-full items-center justify-center px-4 text-center text-sm text-white">The file is on this card.</p>
  ) : (
    <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center text-white">
      <ImagePlus className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm">Add the file</span>
      <input
        type="file"
        accept={FILE_ACCEPT}
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
    <div className={`relative bg-black ${aspect}`}>
      {media}
      {video ? (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-200/95">
              <Play className="ml-0.5 h-5 w-5 fill-neutral-800 text-neutral-800" aria-hidden="true" />
            </span>
          </span>
          {format === "post" ? (
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          ) : null}
        </>
      ) : null}
      {format === "reel" || format === "story" ? (
        <span className="pointer-events-none absolute left-3 top-3">
          <AccountMark name={name} photo={photo} light />
        </span>
      ) : null}
      {format === "reel" && words.hook?.trim() ? (
        <p className="pointer-events-none absolute inset-x-3 top-14 text-sm font-medium text-white drop-shadow">{words.hook.trim()}</p>
      ) : null}
      {format === "reel" && words.caption?.trim() ? (
        <p className="pointer-events-none absolute inset-x-3 bottom-3 text-sm text-white drop-shadow">{words.caption.trim()}</p>
      ) : null}
      {format === "story" && words.line?.trim() ? (
        <p className="pointer-events-none absolute inset-x-3 bottom-10 text-center text-sm text-white drop-shadow">{words.line.trim()}</p>
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
    return <div className={`mx-auto w-full shrink-0 overflow-hidden rounded-xl ${tall ? "max-w-[16rem]" : "max-w-[18rem]"}`}>{frame}</div>;
  }
  return (
    <div className="mx-auto flex w-full shrink-0 flex-col gap-2">
      <CropRow crop={words.crop ?? "portrait"} onCrop={onCrop} />
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <AccountMark name={name} photo={photo} square />
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
      {words.caption?.trim() ? (
        <p className="line-clamp-3 px-3 pb-2 text-xs text-foreground">
          <span className="font-semibold">{name}</span> {words.caption.trim()}
        </p>
      ) : null}
      {words.firstComment?.trim() ? (
        <p className="line-clamp-2 px-3 pb-3 text-xs text-muted-foreground">{words.firstComment.trim()}</p>
      ) : null}
      </div>
      {hasFile ? (
        <Filmstrip
          slides={slides}
          seen={seen}
          onSee={onSee}
          onAdd={onAddPicture}
          onRemove={onRemoveSlide}
          onReorder={onReorder}
        />
      ) : null}
    </div>
  );
}

const SLIDE_DRAG = "application/x-clariva-slide";

function Filmstrip({
  slides,
  seen,
  onSee,
  onAdd,
  onRemove,
  onReorder,
}: {
  slides: readonly { id: string; url: string | null }[];
  seen: number;
  onSee: (index: number) => void;
  onAdd: (file: File | undefined) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[], index: number) => void;
}): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function measure(): void {
    const box = scroller.current;
    if (!box) return;
    setCanLeft(box.scrollLeft > 1);
    setCanRight(box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
  }

  useEffect(() => {
    measure();
    const box = scroller.current;
    const thumb = box?.children[seen] as HTMLElement | undefined;
    if (box && thumb) {
      const left = thumb.offsetLeft;
      const right = left + thumb.offsetWidth;
      if (left < box.scrollLeft) box.scrollTo({ left, behavior: "smooth" });
      else if (right > box.scrollLeft + box.clientWidth) {
        box.scrollTo({ left: right - box.clientWidth, behavior: "smooth" });
      }
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

  const overflow = canLeft || canRight;
  return (
    <div className="flex w-full min-w-0 items-center gap-1 pt-1.5">
      {overflow ? (
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
      <div
        ref={scroller}
        onScroll={measure}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-0.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className="relative shrink-0"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(SLIDE_DRAG, slide.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const from = event.dataTransfer.getData(SLIDE_DRAG);
            if (!from || from === slide.id) return;
            event.preventDefault();
            event.stopPropagation();
            const ids = slides.map((item) => item.id);
            const fromIndex = ids.indexOf(from);
            if (fromIndex < 0) return;
            ids.splice(fromIndex, 1);
            ids.splice(index, 0, from);
            onReorder(ids, index);
          }}
        >
          <button
            type="button"
            aria-label={`Picture ${index + 1}`}
            aria-pressed={index === seen}
            onClick={() => onSee(index)}
            className={`h-12 w-12 overflow-hidden rounded-md bg-neutral-200 ${
              index === seen ? "ring-2 ring-neutral-900" : ""
            }`}
          >
            {slide.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slide.url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </button>
          <button
            type="button"
            aria-label={`Remove picture ${index + 1}`}
            onClick={() => onRemove(slide.id)}
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-white"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </div>
      ))}
      {slides.length < 10 ? (
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
      {overflow ? (
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

function CropRow({
  crop,
  onCrop,
}: {
  crop: "portrait" | "square" | "original";
  onCrop: (crop: "portrait" | "square" | "original") => void;
}): JSX.Element {
  const crops = [
    { id: "portrait", label: "4:5" },
    { id: "square", label: "1:1" },
    { id: "original", label: "Original" },
  ] as const;
  const index = Math.max(0, crops.findIndex((item) => item.id === crop));
  return (
      <div className="relative grid grid-cols-3 rounded-full bg-neutral-100 p-1" role="group" aria-label="Crop">
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc((100%-8px)/3)] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {crops.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={crop === item.id}
            onClick={() => onCrop(item.id)}
            className={`relative z-10 h-7 rounded-full text-xs font-medium ${
              crop === item.id ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
  );
}

function AccountMark({
  name,
  photo,
  light,
  square,
}: {
  name: string;
  photo: string | null;
  light?: boolean;
  square?: boolean;
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
      <span className={`font-semibold ${square ? "text-sm text-neutral-900" : "text-xs"} ${light ? "text-white drop-shadow" : ""}`}>{name}</span>
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
  askLink,
  columns,
  currentColumnId,
  readyDrop,
  postAt,
  postUrl,
  onTitle,
  onTopic,
  onNote,
  onAskLink,
  onPasteLink,
  onAddLink,
  onRemoveLink,
  onPutLink,
  onAddFiles,
  onRemoveItem,
  onPut,
  onFormat,
  onChooseFormat,
  onWord,
  onFlag,
  onMove,
  onMarkReady,
  onAttach,
  frames,
  frameUrls,
  seen,
  onSee,
  onAddPicture,
  onRemoveFrame,
  onReorder,
  onUseReference,
  onRemoveFile,
  onPostAt,
  onPostUrl,
  onSaveTime,
  onClearTime,
  onMarkPosted,
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
  askLink: boolean;
  columns: readonly PanelColumn[];
  currentColumnId: string;
  readyDrop: ReadyDrop;
  postAt: string;
  postUrl: string;
  onTitle: (value: string) => void;
  onTopic: (value: string) => void;
  onNote: (value: string) => void;
  onAskLink: () => void;
  onPasteLink: (url: string, line: number) => void;
  onAddLink: (url: string) => void;
  onRemoveLink: (id: string) => void;
  onPutLink: (id: string, at: number) => void;
  onAddFiles: (files: File[], at: number | null) => void;
  onRemoveItem: (id: string) => void;
  onPut: (id: string, at: number) => void;
  onFormat: (value: SocialCardFormat | "") => void;
  onChooseFormat: (format: SocialCardFormat) => void;
  onWord: (key: keyof SocialCardWords, value: string) => void;
  onFlag: (key: "aiGenerated" | "shareToFeed", value: boolean) => void;
  onMove: (columnId: string) => void;
  onMarkReady: () => void;
  onAttach: (file: File | undefined) => void;
  frames: SocialFrame[];
  frameUrls: Record<string, string>;
  seen: number;
  onSee: (index: number) => void;
  onAddPicture: (file: File | undefined) => void;
  onRemoveFrame: (id: string) => void;
  onReorder: (ids: string[], index: number) => void;
  onUseReference: (id: string) => void;
  onRemoveFile: () => void;
  onPostAt: (value: string) => void;
  onPostUrl: (value: string) => void;
  onSaveTime: () => void;
  onClearTime: () => void;
  onMarkPosted: () => void;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element {
  const noteRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const [line, setLine] = useState(0);
  const [offer, setOffer] = useState<{ text: string; top: number; left: number } | null>(null);
  const targets = liftTargets(format);
  const { over, dropProps } = useSheetFileDrop((next) => onAddFiles(next, null));
  const tall = format === "reel" || format === "story";
  const video = card.fileKind === "video" || (preview ? looksLikeVideo(preview) : false);
  const slides = [
    ...(card.hasFile ? [{ id: "piece", url: preview }] : []),
    ...frames.map((frame) => ({ id: frame.id, url: frameUrls[frame.id] ?? null })),
  ];
  const safeSeen = slides.length === 0 ? 0 : Math.min(seen, slides.length - 1);
  const currentSlide = slides[safeSeen];
  const shown = currentSlide?.url ?? (card.hasFile ? null : preview);
  const shownVideo = !currentSlide || currentSlide.id === "piece" ? video : false;

  function onSelect(): void {
    const box = noteRef.current;
    if (!box) return;
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && box.contains(active)) {
      const typed = active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0).trim();
      if (typed) {
        const rect = active.getBoundingClientRect();
        setOffer({ text: typed, top: rect.bottom + 6, left: rect.left });
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
    setOffer({ text, top: rect.bottom + 6, left: rect.left });
  }

  function takeReference(event: DragEvent<HTMLElement>): void {
    if (!Array.from(event.dataTransfer.types).includes(RESOURCE_DRAG)) return;
    event.preventDefault();
    const resource = readResourceDrag(event);
    if (resource?.kind === "file") onUseReference(resource.id);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-label={`Card ${card.title}`}
      onMouseDown={onClose}
    >
      <form
        aria-label={`Card ${card.title}`}
        className="flex h-[calc(100vh-6rem)] w-[min(76rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex min-w-0 flex-[2]">
          <ScrapShelf
            items={files}
            links={links}
            asking={askLink}
            dropping={over}
            dropProps={dropProps}
            onAdd={() => {
              insertAt.current = null;
              fileRef.current?.click();
            }}
            onRemove={onRemoveItem}
            onPut={(id) => onPut(id, line)}
            onAddLink={onAddLink}
            onRemoveLink={onRemoveLink}
            onPutLink={(id) => onPutLink(id, line)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-5 py-3">
              <p className="text-sm font-medium text-foreground">Thought</p>
              <div className="ml-auto flex items-center gap-1">
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
                <select
                  aria-label={`Move ${card.title}`}
                  className="h-8 max-w-[11rem] rounded-full border border-border bg-background px-3 text-sm text-foreground"
                  value={currentColumnId}
                  onChange={(event) => {
                    if (!event.target.value || event.target.value === currentColumnId) return;
                    onMove(event.target.value);
                  }}
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-6 pb-2">
              <input
                aria-label="Title"
                value={title}
                onChange={(event) => onTitle(event.target.value)}
                placeholder="A short title"
                maxLength={200}
                className="w-full bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <div ref={noteRef} aria-label="Thought note" onMouseUp={onSelect} onKeyUp={onSelect}>
                <IdeaNote
                  value={note}
                  onChange={onNote}
                  onPhoto={(index) => {
                    insertAt.current = index;
                    fileRef.current?.click();
                  }}
                  onLink={onAskLink}
                  onPasteLink={onPasteLink}
                  onLine={setLine}
                  onDropFiles={(list, at) => onAddFiles(list, at)}
                  onDropResource={(kind, id, at) => (kind === "file" ? onPut(id, at) : onPutLink(id, at))}
                  files={files}
                  links={links}
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
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-3">
              <button type="button" onClick={onDelete} className="text-sm text-destructive">
                Delete
              </button>
              <span className="text-xs text-muted-foreground">Kept in the bin for 30 days.</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                aria-label="Add a reference"
                className="sr-only"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  const at = insertAt.current;
                  insertAt.current = null;
                  if (picked.length > 0) onAddFiles(picked, at);
                  event.target.value = "";
                }}
              />
              <button
                type="submit"
                disabled={busy || title.trim().length === 0}
                className="ml-auto h-9 rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
        <aside
          aria-label="Preview"
          className="flex w-[min(22rem,34%)] shrink-0 flex-col border-l border-border bg-muted/20"
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer.types).includes(RESOURCE_DRAG)) event.preventDefault();
          }}
          onDrop={takeReference}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
            <div className="flex gap-1" role="group" aria-label="Format">
              {FORMATS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={format === item.id}
                  disabled={busy}
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
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            <InstaPreview
              format={format}
              words={words}
              preview={shown}
              video={shownVideo}
              hasFile={card.hasFile}
              title={card.title}
              handle={handle}
              photo={photo}
              tall={tall}
              onAttach={onAttach}
              onCrop={(crop) => onWord("crop", crop)}
              slides={slides}
              seen={safeSeen}
              onSee={onSee}
              onAddPicture={onAddPicture}
              onRemoveSlide={onRemoveFrame}
              onReorder={onReorder}
            />
              {card.hasFile && format !== "post" ? (
                <div className="mt-2 flex justify-end">
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onRemoveFile}>
                    Remove file
                  </button>
                </div>
              ) : null}
              {format === "reel" && card.hasFile && !video ? (
                <p className="mt-2 text-sm text-muted-foreground">Needs a video</p>
              ) : null}
            {format ? <WordFields format={format} words={words} onWord={onWord} onFlag={onFlag} /> : null}
            {card.stage === "making" && stillMissing(format, readyDrop).length > 0 ? (
              <ul aria-label="Still missing" className="space-y-1 text-sm text-muted-foreground">
                {stillMissing(format, readyDrop).map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            ) : null}
            {card.stage === "making" ? (
              <button
                type="button"
                disabled={busy || readyDrop !== "move"}
                className="h-10 rounded-md bg-primary text-sm text-primary-foreground disabled:opacity-50"
                onClick={onMarkReady}
              >
                Mark ready
              </button>
            ) : null}
            {card.stage === "ready" && card.hasFile ? (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-sm text-foreground">Post this from your phone at this time.</p>
                <label className="block text-xs text-muted-foreground">
                  Post at
                  <input
                    type="datetime-local"
                    aria-label="Post at"
                    value={postAt}
                    onChange={(event) => onPostAt(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
                <div className="flex items-center gap-3">
                  {card.scheduledAt ? (
                    <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={onClearTime}>
                      Clear time
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || postAt.length === 0}
                    className="ml-auto h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
                    onClick={onSaveTime}
                  >
                    Schedule
                  </button>
                </div>
                {card.pagePath ? <p className="text-sm text-muted-foreground">Page link {card.pagePath}</p> : null}
                <label className="block text-xs text-muted-foreground">
                  Instagram link
                  <input
                    aria-label="Instagram link"
                    value={postUrl}
                    onChange={(event) => onPostUrl(event.target.value)}
                    placeholder="https://www.instagram.com/p/…"
                    maxLength={500}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
                <p className="text-sm text-foreground">Paste the link after you post from your phone.</p>
                <button
                  type="button"
                  disabled={busy || postUrl.trim().length === 0}
                  className="text-sm text-foreground disabled:opacity-50"
                  onClick={onMarkPosted}
                >
                  This is posted
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </form>
    </div>,
    document.body,
  );
}

function ThoughtSheet({
  card,
  title,
  topic,
  link,
  note,
  busy,
  error,
  chosenId,
  topics,
  files,
  links,
  askLink,
  onAskLink,
  onAddLink,
  onRemoveLink,
  onPutLink,
  onTitle,
  onTopic,
  onNote,
  onAddFiles,
  onRemoveItem,
  onPut,
  saveMark,
  columns,
  currentColumnId,
  onPasteLink,
  onRelocate,
  onWarn,
  onChoose,
  onStartMaking,
  onDelete,
  onClose,
  onSubmit,
}: {
  card: SocialCard;
  title: string;
  topic: string;
  link: string;
  note: string;
  busy: boolean;
  error: string | null;
  chosenId: string | null;
  topics: readonly string[];
  files: ShelfFile[];
  links: ResourceLink[];
  askLink: boolean;
  onAskLink: () => void;
  onAddLink: (url: string) => void;
  onRemoveLink: (id: string) => void;
  onPutLink: (id: string, at: number) => void;
  onTitle: (value: string) => void;
  onTopic: (value: string) => void;
  onLink: (value: string) => void;
  onNote: (value: string) => void;
  onAddFiles: (files: File[], at: number | null) => void;
  onRemoveItem: (id: string) => void;
  onPut: (id: string, at: number) => void;
  saveMark: "idle" | "saving" | "saved";
  columns: readonly PanelColumn[];
  currentColumnId: string;
  onPasteLink: (url: string, line: number) => void;
  onRelocate: (columnId: string) => void;
  onWarn: (message: string) => void;
  onChoose: (columnId: string) => void;
  onStartMaking: (format: SocialCardFormat) => void;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef<number | null>(null);
  const [line, setLine] = useState(0);
  const [picking, setPicking] = useState(false);
  const [actions, setActions] = useState(false);
  function chooseColumn(columnId: string): void {
    const column = columns.find((item) => item.id === columnId);
    if (!column || column.id === currentColumnId) return;
    if (column.kind === "making") {
      setPicking(true);
      return;
    }
    if (column.kind === "ready" && !card.hasFile) {
      onWarn("Ready needs a file");
      return;
    }
    if (
      column.kind === "ready" &&
      (card.fileKind === "document" || card.fileKind === "audio" || card.postable === false)
    ) {
      onWarn(card.postable === false ? "Ready needs a JPEG, PNG, WebP, MP4, or MOV" : "Ready needs a photo or a video");
      return;
    }
    onRelocate(columnId);
  }
  const making = card.stage === "chosen";
  const { over, dropProps } = useSheetFileDrop((next) => onAddFiles(next, null));
  useEffect(() => {
    if (!picking) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPicking(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picking]);
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-label={`Card ${card.title}`}
      onMouseDown={onClose}
    >
      <div
        className="relative h-[calc(100vh-6rem)] w-[min(60rem,max(40rem,calc(100vw-34rem)))] max-w-[calc(100vw-2rem)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div
        className={`absolute inset-y-0 right-0 flex overflow-hidden rounded-xl bg-card shadow-[0_24px_80px_-24px_rgba(0,0,0,0.45)] ${
          over ? "ring-2 ring-primary" : ""
        }`}
      >
      <ScrapShelf
        items={files}
        links={links}
        asking={askLink}
        dropping={over}
        dropProps={dropProps}
        onAdd={() => fileRef.current?.click()}
        onRemove={onRemoveItem}
        onPut={(id) => onPut(id, line)}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onPutLink={(id) => onPutLink(id, line)}
      />
      <form
        aria-label={`Card ${card.title}`}
        className="flex w-[min(60rem,max(40rem,calc(100vw-34rem)))] max-w-[calc(100vw-2rem)] shrink-0 flex-col"
        {...dropProps}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-center gap-2 px-5 py-3">
          <select
            aria-label="Column"
            value={currentColumnId}
            onChange={(event) => chooseColumn(event.target.value)}
            className="h-8 max-w-[14rem] truncate bg-transparent text-sm font-medium text-foreground outline-none"
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
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
                  onClick={() => onTopic("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            <TagPicker topic={topic} topics={topics} onChange={onTopic} searchLabel="Topic" />
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
          <div className="mx-auto flex min-h-0 w-full max-w-[43.75rem] flex-1 flex-col">
          <input
            aria-label="Title"
            value={title}
            onChange={(event) => onTitle(event.target.value)}
            placeholder="A short title"
            maxLength={200}
            className="w-full bg-transparent text-2xl text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <IdeaNote
            value={note}
            onChange={onNote}
            onPhoto={(index) => {
              insertAt.current = index;
              fileRef.current?.click();
            }}
            onLink={onAskLink}
            onPasteLink={onPasteLink}
            onLine={setLine}
            onDropFiles={(list, at) => onAddFiles(list, at)}
            onDropResource={(kind, id, at) => (kind === "file" ? onPut(id, at) : onPutLink(id, at))}
            files={files}
            links={links}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground" role="status">
            {saveMark === "saving" ? "Saving" : saveMark === "saved" ? "Saved" : ""}
          </p>
          <div className="relative">
            <button
              type="button"
              aria-label="Card actions"
              aria-expanded={actions}
              onClick={() => setActions((open) => !open)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            {actions ? (
              <div role="menu" aria-label="Card actions" className="absolute bottom-10 left-0 z-20 w-36 rounded-lg border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  onClick={onDelete}
                  className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            aria-label={`Attach the file for ${card.title}`}
            accept={FILE_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const at = insertAt.current;
              insertAt.current = null;
              onAddFiles(Array.from(event.target.files ?? []), at);
              event.target.value = "";
            }}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {making && picking ? (
              <>
                {FORMATS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onStartMaking(item.id)}
                    className="h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : making ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPicking(true)}
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
        </div>
      </form>
      </div>
      </div>
    </div>,
    document.body,
  );
}
