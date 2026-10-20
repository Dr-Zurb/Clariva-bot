/**
 * Pure helpers for the on-the-go idea capture page.
 * A shared address fills the link. The doctor types the title.
 * The card is created only when Add is pressed.
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

  if (!link && note) {
    const pulled = pullLink(note);
    if (pulled) {
      link = pulled.link;
      note = pulled.note;
    }
  }

  if (!link) {
    const titleLink = normalizeLink(title);
    if (titleLink) {
      link = titleLink;
      title = "";
    }
  }

  const normalizedLink = normalizeLink(link);
  if (normalizedLink) link = normalizedLink;

  if (link) title = "";
  else if (!title && note) {
    title = note.slice(0, TITLE_MAX);
    if (note.length <= TITLE_MAX) note = "";
  }

  return { title, note: note.slice(0, NOTE_MAX), link: link.slice(0, LINK_MAX) };
}

function pullLink(note: string): { link: string; note: string } | null {
  const whole = normalizeLink(note);
  if (whole) return { link: whole, note: "" };
  const match = /https?:\/\/[^\s<>"']+/i.exec(note);
  if (!match || match.index === undefined) return null;
  const link = normalizeLink(match[0].replace(/[),.;!?]+$/g, ""));
  if (!link) return null;
  const rest = `${note.slice(0, match.index)} ${note.slice(match.index + match[0].length)}`
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { link, note: rest };
}
