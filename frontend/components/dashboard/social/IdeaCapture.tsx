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
  attachSocialCardFile,
  createSocialCard,
  socialFileIssue,
  updateSocialCard,
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
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(seeded.title);
  const [draftNote, setDraftNote] = useState(seeded.note);
  const [draftLink, setDraftLink] = useState(seeded.link);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      const card = await createSocialCard(token, nextTitle, "thoughts");
      try {
        if (nextNote || sourceUrl) {
          await updateSocialCard(token, card.id, {
            ...(nextNote ? { words: { note: nextNote } } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
          });
        }
        if (file) await attachSocialCardFile(token, card.id, file);
        const keys = parseShareTargetKeys(fileKeys);
        if (keys.length > 0) await clearShareStaging(keys);
      } catch (followUp) {
        setSaved(true);
        setError(
          followUp instanceof Error && followUp.message
            ? `Saved to Thoughts. ${followUp.message}`
            : "Saved to Thoughts. The note or file did not attach."
        );
        clearDraft();
        window.history.replaceState(null, "", "/dashboard/social/idea");
        titleRef.current?.focus();
        return;
      }
      setSaved(true);
      clearDraft();
      window.history.replaceState(null, "", "/dashboard/social/idea");
      titleRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not save this idea.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-xl font-semibold text-foreground">New idea</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        It goes to Thoughts and ideas. You can shape it on the board later.
      </p>
      {saved ? (
        <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" role="status">
          Saved to Thoughts.{" "}
          <Link href="/dashboard/social" className="font-medium text-primary underline-offset-2 hover:underline">
            Open the board
          </Link>
        </p>
      ) : null}
      <form className="mt-4 space-y-3" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm font-medium text-foreground" htmlFor="idea-title">
          Title
        </label>
        <input
          ref={titleRef}
          id="idea-title"
          value={draftTitle}
          maxLength={200}
          required
          autoFocus
          placeholder="A short title"
          className={fieldClass}
          onChange={(event) => {
            setDraftTitle(event.target.value);
            if (saved) setSaved(false);
          }}
        />
        <label className="block text-sm font-medium text-foreground" htmlFor="idea-note">
          Note
        </label>
        <textarea
          id="idea-note"
          value={draftNote}
          rows={4}
          maxLength={2000}
          placeholder="A note, if you want one"
          className={fieldClass}
          onChange={(event) => setDraftNote(event.target.value)}
        />
        <label className="block text-sm font-medium text-foreground" htmlFor="idea-link">
          Link
        </label>
        <input
          id="idea-link"
          value={draftLink}
          inputMode="url"
          placeholder="A link, if you have one"
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
              <span className="min-w-0 truncate text-foreground">{file.name}</span>
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
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || draftTitle.trim().length === 0}
          className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add"}
        </button>
      </form>
    </div>
  );
}
