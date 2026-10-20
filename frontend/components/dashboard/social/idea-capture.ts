/**
 * Pure helpers for the on-the-go idea capture page.
 * A shared note or link becomes the title so Add can be pressed immediately.
 */

import { normalizeLink } from "./idea-composer";

const TITLE_MAX = 200;
const NOTE_MAX = 2000;
const LINK_MAX = 500;

export function ideaCaptureHref(input: {
  title?: string;
  note?: string;
  link?: string;
  keys?: string[];
}): string {
  const q = new URLSearchParams();
  const title = (input.title ?? "").trim().slice(0, TITLE_MAX);
  const note = (input.note ?? "").trim().slice(0, NOTE_MAX);
  const link = (input.link ?? "").trim().slice(0, LINK_MAX);
  if (title) q.set("title", title);
  if (note) q.set("note", note);
  if (link) q.set("link", link);
  const keys = (input.keys ?? []).map((key) => key.trim()).filter(Boolean);
  if (keys.length > 0) q.set("keys", keys.join(","));
  const query = q.toString();
  return query ? `/dashboard/social/idea?${query}` : "/dashboard/social/idea";
}

export function seedIdeaCapture(input: {
  title?: string;
  note?: string;
  link?: string;
}): { title: string; note: string; link: string } {
  let title = (input.title ?? "").trim().slice(0, TITLE_MAX);
  let note = (input.note ?? "").trim();
  let link = (input.link ?? "").trim();

  if (!link) {
    const asLink = normalizeLink(note);
    if (asLink) {
      link = asLink;
      note = "";
    }
  }

  if (!title && link) title = link.slice(0, TITLE_MAX);
  if (!title && note) {
    title = note.slice(0, TITLE_MAX);
    if (note.length <= TITLE_MAX) note = "";
  }

  return { title, note: note.slice(0, NOTE_MAX), link };
}
