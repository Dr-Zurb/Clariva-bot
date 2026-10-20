/**
 * Where a share-sheet POST should land.
 * A link with no file opens the idea page. Files stay on the consult landing.
 */

const TITLE_MAX = 200;
const NOTE_MAX = 2000;
const LINK_MAX = 500;

export function shareFieldText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function shareLinkRedirect(origin: string, input: {
  title?: string;
  note?: string;
  link?: string;
  hasFile?: boolean;
}): string {
  const title = shareFieldText(input.title, TITLE_MAX);
  const note = shareFieldText(input.note, NOTE_MAX);
  const link = shareFieldText(input.link, LINK_MAX);
  const q = new URLSearchParams();
  if (title) q.set("title", title);
  if (note) q.set("note", note);
  if (link) q.set("link", link);
  const query = q.toString();
  const path = !input.hasFile && (title || note || link)
    ? "/c/idea"
    : "/c/share-target";
  return query ? `${origin}${path}?${query}` : `${origin}${path}`;
}
