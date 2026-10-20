"use client";

/**
 * On-the-go capture for Thoughts and ideas.
 * One title, an optional note, and one file or link. The board studio stays on the desktop Add dialog.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FILE_ACCEPT, normalizeLink } from "./idea-composer";
import { seedIdeaCapture } from "./idea-capture";
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
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotRef = useRef<File | null>(null);
  const prepared = useRef<{ file: File; path: Promise<string> } | null>(null);
  const [draftTitle, setDraftTitle] = useState(seeded.title);
  const [draftNote, setDraftNote] = useState(seeded.note);
  const [draftLink, setDraftLink] = useState(seeded.link);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [camera, setCamera] = useState<"closed" | "live" | "review">("closed");
  const [shotUrl, setShotUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (camera !== "live" || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    const playing = videoRef.current.play();
    if (playing) void playing.catch(() => undefined);
  }, [camera]);

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
    if (!file) {
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

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    shotRef.current = null;
    setShotUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setCamera("closed");
  }

  async function openCamera() {
    setError(null);
    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      },
      { audio: false, video: true },
    ];
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        setCamera("live");
        return;
      } catch {
        // The back camera can be missing. The next attempt uses any camera.
      }
    }
    setError("Camera is unavailable");
  }

  function takePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const scale = Math.min(
      1,
      1280 / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        shotRef.current = new File([blob], "photo.jpg", { type: "image/jpeg" });
        setShotUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        setCamera("review");
      },
      "image/jpeg",
      0.7
    );
  }

  function keepPhoto() {
    const photo = shotRef.current;
    shotRef.current = null;
    stopCamera();
    if (!photo) return;
    const issue = socialFileIssue(photo);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setFile(photo);
  }

  function clearDraft() {
    setDraftTitle("");
    setDraftNote("");
    setDraftLink("");
    setFile(null);
    if (galleryRef.current) galleryRef.current.value = "";
    if (filesRef.current) filesRef.current.value = "";
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
    setFile(next);
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
            : shrinkIdeaPhoto(file).then((small) =>
                prepareSocialCardFile(token, small)
              ))
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
    <div ref={rootRef} data-idea-capture className="mx-auto w-full max-w-md">
      <form
        className="space-y-3"
        autoComplete="off"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="space-y-3">
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
          {camera !== "closed" ? (
            <div className="space-y-3">
              {camera === "review" && shotUrl ? (
                <div
                  role="img"
                  aria-label="Photo"
                  className="h-64 w-full rounded-md bg-black bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${shotUrl}")` }}
                />
              ) : (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="max-h-64 w-full rounded-md bg-black object-contain"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-11 flex-1 rounded-md border border-border text-sm font-medium text-foreground"
                  onClick={stopCamera}
                >
                  Back
                </button>
                {camera === "review" ? (
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground"
                    onClick={keepPhoto}
                  >
                    Use photo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground"
                    onClick={takePhoto}
                  >
                    Take photo
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {camera === "closed" ? (
            <>
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
                <p className="mb-2 text-sm font-medium text-foreground">Add a file</p>
                <input
                  ref={galleryRef}
                  id="idea-gallery"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null, event.target)}
                />
                <input
                  ref={filesRef}
                  id="idea-files"
                  type="file"
                  accept={FILE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null, event.target)}
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
                        if (galleryRef.current) galleryRef.current.value = "";
                        if (filesRef.current) filesRef.current.value = "";
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-md border border-border px-2 text-sm text-foreground"
                      onClick={() => void openCamera()}
                    >
                      Camera
                    </button>
                    <label
                      htmlFor="idea-gallery"
                      className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-sm text-foreground"
                    >
                      Gallery
                    </label>
                    <label
                      htmlFor="idea-files"
                      className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-sm text-foreground"
                    >
                      Files
                    </label>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
        {error ? (
          <p className="shrink-0 pt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {camera === "closed" ? (
          <div className="shrink-0 bg-background pt-3">
            <button
              type="submit"
              disabled={busy || draftTitle.trim().length === 0}
              className="h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
