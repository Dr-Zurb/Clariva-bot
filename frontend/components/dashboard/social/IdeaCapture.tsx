"use client";

/**
 * On-the-go capture for Thoughts and ideas.
 * One title, an optional note, and one file or link. The board studio stays on the desktop Add dialog.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { FILE_ACCEPT, normalizeLink } from "./idea-composer";
import { seedIdeaCapture } from "./idea-capture";
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
  createSocialCard,
  prepareSocialCardFile,
  socialFileIssue,
} from "./social-cards";
import {
  clearShareStaging,
  parseShareTargetKeys,
  readStagedFilesFromCache,
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
  const prepared = useRef<{ file: File; path: Promise<string> } | null>(null);
  const mounted = useRef(false);
  const [draftTitle, setDraftTitle] = useState(seeded.title);
  const [draftNote, setDraftNote] = useState(seeded.note);
  const [draftLink, setDraftLink] = useState(seeded.link);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const draft = useRef({ title: draftTitle, note: draftNote, link: draftLink, file });
  draft.current = { title: draftTitle, note: draftNote, link: draftLink, file };

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
    void readStagedFilesFromCache(keys).then((files) => {
      if (cancelled) return;
      const first = files[0];
      if (!first) return;
      const issue = socialFileIssue(first);
      if (issue) {
        setError(issue);
        return;
      }
      setFile(first);
    });
    return () => {
      cancelled = true;
    };
  }, [fileKeys]);

  useEffect(() => {
    if (!file || !token) {
      prepared.current = null;
      return;
    }
    if (prepared.current?.file === file) return;
    const path = shrinkIdeaPhoto(file).then((small) =>
      prepareSocialCardFile(token, small)
    );
    prepared.current = { file, path };
    void path.catch(() => undefined);
  }, [file, token]);

  function clearDraft() {
    setDraftTitle("");
    setDraftNote("");
    setDraftLink("");
    setFile(null);
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

  function chooseFile(next: File | null, input: HTMLInputElement) {
    if (!next) {
      setFile(null);
      return;
    }
    const fileIssue = socialFileIssue(next);
    if (fileIssue) {
      setError(fileIssue);
      setFile(null);
      input.value = "";
      return;
    }
    setError(null);
    setSourcesOpen(false);
    setFile(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = draftTitle.trim();
    if (!nextTitle || !token) return;
    const issue = file ? socialFileIssue(file) : null;
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
    const savedFile = file;
    const upload = savedFile
      ? prepared.current?.file === savedFile
        ? prepared.current.path
        : shrinkIdeaPhoto(savedFile).then((small) => prepareSocialCardFile(token, small))
      : null;
    const idea: PendingIdea = {
      id: newPendingId(),
      title: nextTitle,
      ...(nextNote ? { note: nextNote } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      at: Date.now(),
    };
    keepPendingIdea(idea);
    const keys = parseShareTargetKeys(fileKeys);
    if (keys.length > 0) void clearShareStaging(keys);
    setError(null);
    setSaved(true);
    clearDraft();
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    void finishSave(idea, upload, savedFile, typedLink);
  }

  async function finishSave(
    idea: PendingIdea,
    upload: Promise<string> | null,
    savedFile: File | null,
    typedLink: string
  ) {
    try {
      const filePath = upload ? await upload : undefined;
      const sent = filePath ? { ...idea, filePath } : idea;
      if (filePath) keepPendingIdea(sent);
      await createSocialCard(token, idea.title, "thoughts", pendingIdeaDraft(sent), {
        keepalive: true,
      });
      dropPendingIdea(idea.id);
    } catch (err) {
      const current = draft.current;
      const formEmpty =
        !current.title.trim() && !current.note.trim() && !current.link.trim() && !current.file;
      if (!mounted.current || !formEmpty) return;
      dropPendingIdea(idea.id);
      setSaved(false);
      setDraftTitle(idea.title);
      setDraftNote(idea.note ?? "");
      setDraftLink(typedLink);
      setFile(savedFile);
      setError(
        err instanceof Error && err.message
          ? `Not saved: ${err.message}`
          : "Not saved. Tap Add again."
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
              disabled={!token || draftTitle.trim().length === 0}
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
            required
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
            maxLength={1000}
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
              {file ? (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{file.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setFile(null);
                      clearFileInputs();
                    }}
                  >
                    Remove
                  </button>
                </span>
              ) : null}
            </div>
            {sourcesOpen ? (
              <div className="grid grid-cols-4 gap-1.5">
                <FileSource label="Camera" accept="image/*" capture="environment" onPick={chooseFile} />
                <FileSource label="Gallery" accept="image/*" onPick={chooseFile} />
                <FileSource label="Video" accept="video/*" onPick={chooseFile} />
                <FileSource label="Files" accept={FILE_ACCEPT} onPick={chooseFile} />
              </div>
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

function FileSource({
  label,
  accept,
  capture,
  onPick,
}: {
  label: string;
  accept: string;
  capture?: "environment";
  onPick: (file: File | null, input: HTMLInputElement) => void;
}) {
  return (
    <label className="inline-flex h-10 w-full min-w-0 cursor-pointer items-center justify-center rounded-md border border-border px-1 text-sm text-foreground">
      {label}
      <input
        type="file"
        accept={accept}
        {...(capture ? { capture } : {})}
        className="sr-only"
        onChange={(event) => onPick(event.target.files?.[0] ?? null, event.target)}
      />
    </label>
  );
}
