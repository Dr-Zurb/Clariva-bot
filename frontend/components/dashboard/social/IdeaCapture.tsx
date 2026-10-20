"use client";

/**
 * On-the-go capture for Thoughts and ideas.
 * One title, an optional note, and a pile of files or a link.
 * Ten of each kind. The board studio stays on the desktop Add dialog.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AudioLines, FileText, Film, Paperclip, X } from "lucide-react";
import { FILE_ACCEPT, NOTE_MAX, normalizeLink } from "./idea-composer";
import { addIdeaFiles, seedIdeaCapture } from "./idea-capture";
import {
  dropPendingIdea,
  keepPendingIdea,
  newPendingId,
  pendingIdeaDraft,
  resendPendingIdeas,
  type PendingIdea,
} from "./idea-pending";
import { shrinkIdeaPhoto } from "./idea-photo";
import {
  addSocialCardScrap,
  createSocialCard,
  socialFileIssue,
  socialFileKind,
} from "./social-cards";
import {
  clearShareStaging,
  parseShareTargetKeys,
  readIdeaStagedFiles,
} from "@/lib/text/share-target-bridge";
import { warmApi } from "@/lib/api-base";

const fieldClass =
  "w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function IdeaCapture({
  token,
  title = "",
  note = "",
  link = "",
  fileKeys = "",
}: {
  token: string;
  title?: string;
  note?: string;
  link?: string;
  fileKeys?: string;
}) {
  const seeded = seedIdeaCapture({ title, note, link });
  const rootRef = useRef<HTMLDivElement>(null);
  const savedCard = useRef<string | null>(null);
  const saving = useRef(false);
  const mounted = useRef(false);
  const [draftTitle, setDraftTitle] = useState(seeded.title);
  const [draftNote, setDraftNote] = useState(seeded.note);
  const [draftLink, setDraftLink] = useState(seeded.link);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const draft = useRef({ title: draftTitle, note: draftNote, link: draftLink, files });
  draft.current = { title: draftTitle, note: draftNote, link: draftLink, files };

  useEffect(() => {
    mounted.current = true;
    warmApi();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (token) void resendPendingIdeas(token);
  }, [token]);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = window.visualViewport;
    if (!root || !viewport) return;
    let seen = false;
    let lastHeight = viewport.height;

    function onResize() {
      const nextHeight = viewport.height;
      if (seen && nextHeight - lastHeight > 100) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active))
          active.blur();
      }
      seen = true;
      lastHeight = nextHeight;
    }

    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const keys = parseShareTargetKeys(fileKeys);
    if (keys.length === 0) return;
    let cancelled = false;
    void readIdeaStagedFiles(keys).then((staged) => {
      if (cancelled || saving.current) return;
      let issue: string | null = null;
      const accepted: File[] = [];
      for (const stagedFile of staged) {
        const problem = socialFileIssue(stagedFile);
        if (problem) {
          issue = problem;
          continue;
        }
        accepted.push(stagedFile);
      }
      setFiles((current) => {
        const result = addIdeaFiles(current, accepted, socialFileKind);
        setError(result.overflow ? "The pile is full" : issue);
        return result.files;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fileKeys]);

  function clearDraft() {
    setDraftTitle("");
    setDraftNote("");
    setDraftLink("");
    setFiles([]);
    setSourcesOpen(false);
    clearFileInputs();
  }

  function clearFileInputs() {
    rootRef.current
      ?.querySelectorAll<HTMLInputElement>('input[type="file"]')
      .forEach((input) => {
        input.value = "";
      });
  }

  function chooseFiles(incoming: File[], input: HTMLInputElement) {
    input.value = "";
    if (incoming.length === 0) return;
    let issue: string | null = null;
    const accepted: File[] = [];
    for (const item of incoming) {
      const problem = socialFileIssue(item);
      if (problem) {
        issue = problem;
        continue;
      }
      accepted.push(item);
    }
    setFiles((current) => {
      const result = addIdeaFiles(current, accepted, socialFileKind);
      setError(result.overflow ? "The pile is full" : issue);
      return result.files;
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const typedTitle = draftTitle.trim();
    const nextTitle = typedTitle || "untitled";
    if (!token) return;
    const issue = files.map((item) => socialFileIssue(item)).find(Boolean);
    if (issue) {
      setError(issue);
      return;
    }
    const typedLink = draftLink.trim();
    const sourceUrl = typedLink ? normalizeLink(typedLink) : null;
    if (typedLink && !sourceUrl) {
      setError("Use a link");
      return;
    }
    const nextNote = draftNote.trim();
    const savedFiles = files.slice();
    const idea: PendingIdea = {
      id: newPendingId(),
      title: nextTitle,
      ...(nextNote ? { note: nextNote } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      at: Date.now(),
    };
    keepPendingIdea(idea);
    saving.current = true;
    setError(null);
    setSaved(true);
    clearDraft();
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    void finishSave(idea, savedFiles, typedTitle, typedLink);
  }

  function restoreDraft(idea: PendingIdea, typedTitle: string, typedLink: string, nextFiles: File[], message: string) {
    const current = draft.current;
    const formEmpty =
      !current.title.trim() && !current.note.trim() && !current.link.trim() && current.files.length === 0;
    if (!mounted.current || !formEmpty) return;
    saving.current = false;
    if (!savedCard.current) dropPendingIdea(idea.id);
    setSaved(false);
    setDraftTitle(typedTitle);
    setDraftNote(idea.note ?? "");
    setDraftLink(typedLink);
    setFiles(nextFiles);
    setError(message);
  }

  async function finishSave(
    idea: PendingIdea,
    savedFiles: File[],
    typedTitle: string,
    typedLink: string
  ) {
    try {
      let cardId = savedCard.current;
      if (!cardId) {
        const created = await createSocialCard(token, idea.title, "thoughts", pendingIdeaDraft(idea), {
          keepalive: true,
        });
        cardId = created.id;
        savedCard.current = cardId;
      }
      dropPendingIdea(idea.id);
      const failed: File[] = [];
      for (const item of savedFiles) {
        try {
          const small = await shrinkIdeaPhoto(item);
          await addSocialCardScrap(token, cardId, small);
        } catch {
          failed.push(item);
        }
      }
      if (failed.length > 0) {
        restoreDraft(
          idea,
          typedTitle,
          typedLink,
          failed,
          failed.length === savedFiles.length
            ? "Not saved: Could not add the file"
            : "Not saved: Some files were not saved"
        );
        return;
      }
      savedCard.current = null;
      const keys = parseShareTargetKeys(fileKeys);
      if (keys.length > 0) void clearShareStaging(keys);
    } catch (err) {
      restoreDraft(
        idea,
        typedTitle,
        typedLink,
        savedFiles,
        err instanceof Error && err.message ? `Not saved: ${err.message}` : "Not saved. Tap Add again."
      );
    }
  }

  return (
    <div ref={rootRef} data-idea-capture className="mx-auto w-full min-w-0 max-w-md">
      <form
        className="space-y-3"
        autoComplete="off"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="space-y-3">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-background">
            <h1 className="text-xl font-semibold text-foreground">New idea</h1>
            <button
              type="submit"
              disabled={!token}
              className="h-9 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {saved ? (
            <p
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              Saved to Thoughts.{" "}
              <Link
                href="/dashboard/social"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Open the board
              </Link>
            </p>
          ) : null}
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="idea-title"
          >
            Title
          </label>
          <input
            id="idea-title"
            name="halo-idea-title"
            type="text"
            autoComplete="halo-idea-title"
            autoCorrect="off"
            value={draftTitle}
            maxLength={200}
            className={fieldClass}
            onChange={(event) => {
              setDraftTitle(event.target.value);
              if (saved) setSaved(false);
            }}
          />
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="idea-note"
          >
            Note
          </label>
          <textarea
            id="idea-note"
            name="halo-idea-note"
            autoComplete="halo-idea-note"
            value={draftNote}
            rows={2}
            maxLength={NOTE_MAX}
            className={fieldClass}
            onChange={(event) => setDraftNote(event.target.value)}
          />
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="idea-link"
          >
            Link
          </label>
          <input
            id="idea-link"
            name="halo-idea-link"
            type="text"
            autoComplete="halo-idea-link"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={draftLink}
            maxLength={500}
            inputMode="url"
            className={fieldClass}
            onChange={(event) => setDraftLink(event.target.value)}
          />
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-expanded={sourcesOpen}
                className="inline-flex h-9 shrink-0 items-center gap-2 text-sm font-medium text-foreground"
                onClick={() => setSourcesOpen((open) => !open)}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                </span>
                Add a file
              </button>
            </div>
            {sourcesOpen ? (
              <div className="grid grid-cols-4 gap-1.5">
                <FileSource label="Camera" accept="image/*" capture="environment" onPick={chooseFiles} />
                <FileSource label="Gallery" accept="image/*" multiple onPick={chooseFiles} />
                <FileSource label="Video" accept="video/*" multiple onPick={chooseFiles} />
                <FileSource label="Files" accept={FILE_ACCEPT} multiple onPick={chooseFiles} />
              </div>
            ) : null}
            {files.length > 0 ? (
              <ul className="space-y-2">
                {files.map((item, index) => (
                  <HeldFile
                    key={`${item.name}-${item.size}-${item.lastModified}-${index}`}
                    file={item}
                    onRemove={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="pt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function HeldFile({ file, onRemove }: { file: File; onRemove: () => void }): JSX.Element {
  const url = useObjectUrl(file);
  const [open, setOpen] = useState(false);
  const kind = socialFileKind(file);
  return (
    <li className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        aria-label={`View ${file.name}`}
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
          {kind === "photo" && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : null}
          {kind === "video" && url ? (
            <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : null}
          {kind === "video" && !url ? <Film className="h-4 w-4" aria-hidden="true" /> : null}
          {kind === "audio" ? <AudioLines className="h-4 w-4" aria-hidden="true" /> : null}
          {kind === "document" || !kind ? <FileText className="h-4 w-4" aria-hidden="true" /> : null}
        </span>
        <span className="min-w-0 truncate text-sm text-foreground">{file.name}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && url ? (
        <FileView file={file} url={url} kind={kind} onClose={() => setOpen(false)} />
      ) : null}
    </li>
  );
}

function FileView({
  file,
  url,
  kind,
  onClose,
}: {
  file: File;
  url: string;
  kind: ReturnType<typeof socialFileKind>;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-label={file.name}
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-xl bg-card p-3"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{file.name}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.name} className="max-h-[70vh] w-full object-contain" />
        ) : null}
        {kind === "video" ? <video src={url} controls playsInline className="max-h-[70vh] w-full" /> : null}
        {kind === "audio" ? <audio src={url} controls className="w-full" /> : null}
        {kind === "document" || !kind ? (
          <iframe title={file.name} src={url} className="h-[70vh] w-full rounded-md border border-border" />
        ) : null}
      </div>
    </div>
  );
}

function FileSource({
  label,
  accept,
  capture,
  multiple,
  onPick,
}: {
  label: string;
  accept: string;
  capture?: "environment";
  multiple?: boolean;
  onPick: (files: File[], input: HTMLInputElement) => void;
}) {
  return (
    <label className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center justify-center rounded-md border border-border px-1 text-sm text-foreground">
      {label}
      <input
        type="file"
        accept={accept}
        {...(capture ? { capture } : {})}
        {...(multiple ? { multiple: true } : {})}
        className="sr-only"
        onChange={(event) => {
          const list = event.target.files;
          const picked: File[] = [];
          if (list) {
            for (let index = 0; index < list.length; index += 1) {
              const item = list[index];
              if (item) picked.push(item);
            }
          }
          onPick(picked, event.target);
        }}
      />
    </label>
  );
}
