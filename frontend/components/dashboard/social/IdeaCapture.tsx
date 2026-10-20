"use client";

/**
 * On-the-go capture for Thoughts and ideas.
 * One title, an optional note, and one photo or link. The board studio stays on the desktop Add dialog.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FILE_ACCEPT, normalizeLink } from "./idea-composer";
import { seedIdeaCapture } from "./idea-capture";
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

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const prepared = useRef<{ file: File; path: Promise<string> } | null>(null);
  const [draftTitle, setDraftTitle] = useState(seeded.title);
  const [draftNote, setDraftNote] = useState(seeded.note);
  const [draftLink, setDraftLink] = useState(seeded.link);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    const viewport = window.visualViewport;
    let seen = false;
    let lastHeight = viewport?.height ?? window.innerHeight;

    function fit() {
      const parentRect = parent.getBoundingClientRect();
      const nextViewport = window.visualViewport;
      const visibleTop = nextViewport?.offsetTop ?? 0;
      const visibleBottom = nextViewport
        ? nextViewport.offsetTop + nextViewport.height
        : window.innerHeight;
      const top = Math.max(parentRect.top, visibleTop);
      const height = Math.max(240, Math.round(visibleBottom - top));
      parent.scrollTop = 0;
      root.style.height = `${height}px`;
      root.style.maxHeight = `${height}px`;

      const nextHeight = nextViewport?.height ?? window.innerHeight;
      if (seen && nextHeight - lastHeight > 100) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active))
          active.blur();
      }
      seen = true;
      lastHeight = nextHeight;
    }

    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
    };
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
    if (!file) {
      prepared.current = null;
      return;
    }
    if (prepared.current?.file === file) return;
    const path = prepareSocialCardFile(token, file);
    prepared.current = { file, path };
    void path.catch(() => undefined);
  }, [file, token]);

  function clearDraft() {
    setDraftTitle("");
    setDraftNote("");
    setDraftLink("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = draftTitle.trim();
    if (!nextTitle || busy) return;
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
    setBusy(true);
    setError(null);
    try {
      const filePath = file
        ? await (prepared.current?.file === file
            ? prepared.current.path
            : prepareSocialCardFile(token, file))
        : undefined;
      await createSocialCard(token, nextTitle, "thoughts", {
        ...(nextNote ? { words: { note: nextNote } } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(filePath ? { filePath } : {}),
      });
      const keys = parseShareTargetKeys(fileKeys);
      if (keys.length > 0) void clearShareStaging(keys);
      setSaved(true);
      clearDraft();
      window.history.replaceState(null, "", "/dashboard/social/idea");
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not save this idea."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      data-idea-capture
      className="mx-auto flex min-h-full w-full max-w-md flex-col"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        autoComplete="off"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <h1 className="text-xl font-semibold text-foreground">New idea</h1>
          {saved ? (
            <p
              className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
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
            maxLength={2000}
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
            inputMode="url"
            className={fieldClass}
            onChange={(event) => setDraftLink(event.target.value)}
          />
          <div>
            <input
              ref={fileRef}
              id="idea-file"
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                if (!next) {
                  setFile(null);
                  return;
                }
                const fileIssue = socialFileIssue(next);
                if (fileIssue) {
                  setError(fileIssue);
                  setFile(null);
                  event.target.value = "";
                  return;
                }
                setError(null);
                setFile(next);
              }}
            />
            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-foreground">
                  {file.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label
                htmlFor="idea-file"
                className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-3 text-sm text-foreground"
              >
                Add a photo
              </label>
            )}
          </div>
        </div>
        {error ? (
          <p className="shrink-0 pt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="shrink-0 bg-background pt-3">
          <button
            type="submit"
            disabled={busy || draftTitle.trim().length === 0}
            className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
