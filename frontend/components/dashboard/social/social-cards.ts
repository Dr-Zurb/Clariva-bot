/**
 * Social card API (soc-04, soc-05).
 * The file goes to social-card-files. Visit documents are a different store.
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import { authorizedFetch } from "@/lib/auth/authorized-fetch";
import { createClient } from "@/lib/supabase/client";

export type SocialCardStage = "thoughts" | "chosen" | "making" | "ready" | "custom" | "posted";
export type SocialCardFormat = "post" | "reel" | "story";
export type SocialFileKind = "photo" | "video" | "audio" | "document";

export type SocialFileFace = "sheet" | "slides" | "page";

export type SocialScrap = {
  id: string;
  fileKind: SocialFileKind | null;
  postable: boolean;
  face?: SocialFileFace | null;
};

export type SocialCardCrop = "original" | "square" | "portrait";

export type SocialCardWords = {
  note?: string;
  caption?: string;
  altText?: string;
  firstComment?: string;
  hook?: string;
  script?: string;
  coverLine?: string;
  shots?: string[];
  line?: string;
  location?: string;
  collaborator?: string;
  crop?: SocialCardCrop;
  aiGenerated?: boolean;
  shareToFeed?: boolean;
  music?: string;
  stickers?: string;
  productTag?: string;
};

export type SocialFrame = {
  id: string;
  fileKind: SocialFileKind | null;
};

export type SocialCard = {
  id: string;
  stage: SocialCardStage;
  title: string;
  format: SocialCardFormat | null;
  topic: string | null;
  words: SocialCardWords;
  hasFile: boolean;
  fileKind: SocialFileKind | null;
  postable?: boolean;
  scraps?: SocialScrap[];
  frames?: SocialFrame[];
  links?: { id: string; url: string }[];
  sourceUrl: string | null;
  scheduledAt: string | null;
  publishError: string | null;
  instagramUrl: string | null;
  visitCount: number;
  columnId: string | null;
  pagePath: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialCardPatch = {
  title?: string;
  stage?: SocialCardStage;
  format?: SocialCardFormat | null;
  topic?: string | null;
  words?: SocialCardWords;
  sourceUrl?: string | null;
  links?: { id: string; url: string }[];
  scheduledAt?: string | null;
  instagramUrl?: string;
  columnId?: string;
};

export type SocialColumnKind = "thoughts" | "chosen" | "making" | "ready" | "custom";

export type SocialColumn = {
  id: string;
  kind: SocialColumnKind;
  name: string;
  position: number;
};
const BUCKET = "social-card-files";
const PHOTO_BYTES = 8 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
const DOCUMENT_BYTES = 10 * 1024 * 1024;
const AUDIO_BYTES = 15 * 1024 * 1024;
const PHOTO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};
const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};
const DOCUMENT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};
const PHOTO_TYPES = new Set(Object.values(PHOTO_MIME));
const VIDEO_TYPES = new Set(Object.values(VIDEO_MIME));
const AUDIO_TYPES = new Set([...Object.values(AUDIO_MIME), "audio/x-wav"]);
const DOCUMENT_TYPES = new Set(Object.values(DOCUMENT_MIME));
const POSTABLE_EXT = new Set(["jpg", "jpeg", "png", "webp", "mp4", "mov"]);

type CardEnvelope = { card: SocialCard };
type ListEnvelope = { cards: SocialCard[] };
type UploadEnvelope = { path: string; token: string };

async function socialRequest<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; keepalive?: boolean }
): Promise<T> {
  const res = await authorizedFetch(`${requireApiBaseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    ...(init?.keepalive ? { keepalive: true } : {}),
    token,
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!res.ok || json.success === false) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}

function fileExtension(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function extensionKind(name: string): SocialFileKind | null {
  const ext = fileExtension(name);
  if (PHOTO_MIME[ext]) return "photo";
  if (VIDEO_MIME[ext]) return "video";
  if (AUDIO_MIME[ext]) return "audio";
  if (DOCUMENT_MIME[ext]) return "document";
  return null;
}

export function socialFileKind(file: File): SocialFileKind | null {
  if (PHOTO_TYPES.has(file.type)) return "photo";
  if (VIDEO_TYPES.has(file.type)) return "video";
  if (AUDIO_TYPES.has(file.type)) return "audio";
  if (DOCUMENT_TYPES.has(file.type)) return "document";
  return extensionKind(file.name);
}

function canPost(file: File): boolean {
  const kind = socialFileKind(file);
  if (kind !== "photo" && kind !== "video") return false;
  const ext = fileExtension(file.name);
  if (ext) return POSTABLE_EXT.has(ext);
  return ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(file.type);
}

function contentTypeFor(file: File): string {
  if (PHOTO_TYPES.has(file.type) || VIDEO_TYPES.has(file.type) || AUDIO_TYPES.has(file.type) || DOCUMENT_TYPES.has(file.type)) {
    return file.type === "audio/x-wav" ? "audio/wav" : file.type;
  }
  const ext = fileExtension(file.name);
  return PHOTO_MIME[ext] || VIDEO_MIME[ext] || AUDIO_MIME[ext] || DOCUMENT_MIME[ext] || file.type;
}

export function socialFileIssue(file: File, postable = false): string | null {
  const kind = socialFileKind(file);
  if (!kind) return "Use a photo, a video, audio, or a document";
  if (postable && !canPost(file)) {
    return kind === "photo" || kind === "video"
      ? "Ready needs a JPEG, PNG, WebP, MP4, or MOV"
      : "Ready needs a photo or a video";
  }
  if (kind === "photo" && file.size > PHOTO_BYTES) return "Photo is over 8 MB";
  if (kind === "video" && file.size > VIDEO_BYTES) return "Video is over 100 MB";
  if (kind === "audio" && file.size > AUDIO_BYTES) return "Audio is over 15 MB";
  if (kind === "document" && file.size > DOCUMENT_BYTES) return "Document is over 10 MB";
  return null;
}

function assertFile(file: File): void {
  const issue = socialFileIssue(file);
  if (issue) throw new Error(issue);
}

async function uploadFile(
  token: string,
  file: File,
  cardId?: string
): Promise<string> {
  assertFile(file);
  const minted = await socialRequest<UploadEnvelope>(
    token,
    cardId
      ? `/api/v1/social/cards/${cardId}/file/upload`
      : "/api/v1/social/cards/uploads",
    { method: "POST", body: { contentType: contentTypeFor(file) } }
  );
  const { error } = await createClient()
    .storage.from(BUCKET)
    .uploadToSignedUrl(minted.path, minted.token, file);
  if (error) throw new Error("Could not upload the file");
  return minted.path;
}

export function listSocialCards(token: string): Promise<SocialCard[]> {
  return socialRequest<ListEnvelope>(token, "/api/v1/social/cards").then(
    (data) => data.cards
  );
}

export type SocialCountPair = { value: number; previous: number };

export type SocialAnalyticsPost = {
  id: string;
  title: string;
  format: SocialCardFormat | null;
  topic: string | null;
  date: string;
  day: string;
  bookings: number;
  enquiries: number;
  instagramUrl: string | null;
  thumbUrl: string | null;
  caption: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
};

export type SocialInstagramTiles = {
  views: SocialCountPair | null;
  reach: SocialCountPair | null;
  interactions: SocialCountPair | null;
  followers: SocialCountPair | null;
};

export type SocialAnalyticsReport = {
  range: { from: string; to: string };
  previous: { from: string; to: string };
  tiles: {
    enquiries: SocialCountPair;
    bookings: SocialCountPair;
    conversion: SocialCountPair | null;
    posts: SocialCountPair;
  };
  days: { date: string; posts: number; enquiries: number; bookings: number; views?: number | null }[];
  best: SocialAnalyticsPost[];
  formats: { format: SocialCardFormat; posts: number; bookings: number; views?: number | null }[];
  instagram?: {
    tiles: SocialInstagramTiles;
  } | null;
  topics: { topic: string; posts: number; bookings: number }[];
  rhythm: {
    weeks: { label: string; posts: number }[];
    usual: { weekday: string; hour: string } | null;
  };
  posts: SocialAnalyticsPost[];
  sentence: { text: string; title: string | null } | null;
};

export function getSocialAnalytics(
  token: string,
  from: string,
  to: string
): Promise<SocialAnalyticsReport> {
  const params = new URLSearchParams({ from, to });
  return socialRequest<SocialAnalyticsReport>(token, `/api/v1/social/analytics?${params.toString()}`);
}

export function getSocialCardFileUrl(token: string, id: string): Promise<string> {
  return socialRequest<{ downloadUrl: string }>(token, `/api/v1/social/cards/${id}/file`).then(
    (data) => data.downloadUrl
  );
}

export function prepareSocialCardFile(token: string, file: File): Promise<string> {
  return uploadFile(token, file);
}

export function createSocialCard(
  token: string,
  title: string,
  stage: Exclude<SocialCardStage, "posted" | "custom"> = "thoughts",
  draft?: { words?: { note?: string }; sourceUrl?: string | null; filePath?: string },
  options?: { keepalive?: boolean }
): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, "/api/v1/social/cards", {
    method: "POST",
    body: {
      title,
      stage,
      ...(draft?.words ? { words: draft.words } : {}),
      ...(draft?.sourceUrl ? { sourceUrl: draft.sourceUrl } : {}),
      ...(draft?.filePath ? { filePath: draft.filePath } : {}),
    },
    keepalive: options?.keepalive,
  }).then((data) => data.card);
}

export function createSocialCardInColumn(
  token: string,
  title: string,
  columnId: string
): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, "/api/v1/social/cards", {
    method: "POST",
    body: { title, columnId },
  }).then((data) => data.card);
}

export async function createReadySocialCard(
  token: string,
  title: string,
  file: File
): Promise<SocialCard> {
  const filePath = await uploadFile(token, file);
  const data = await socialRequest<CardEnvelope>(token, "/api/v1/social/cards", {
    method: "POST",
    body: { title, stage: "ready", filePath },
  });
  return data.card;
}

export function updateSocialCard(
  token: string,
  id: string,
  patch: SocialCardPatch
): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}`, {
    method: "PATCH",
    body: patch,
  }).then((data) => data.card);
}

export function moveSocialCard(
  token: string,
  id: string,
  stage: Exclude<SocialCardStage, "posted" | "custom">
): Promise<SocialCard> {
  return updateSocialCard(token, id, { stage });
}

export function moveSocialCardToColumn(
  token: string,
  id: string,
  columnId: string
): Promise<SocialCard> {
  return updateSocialCard(token, id, { columnId });
}

export function listSocialColumns(token: string): Promise<SocialColumn[]> {
  return socialRequest<{ columns: SocialColumn[] }>(token, "/api/v1/social/columns").then(
    (data) => data.columns
  );
}

export function createSocialColumn(token: string, name: string): Promise<SocialColumn> {
  return socialRequest<{ column: SocialColumn }>(token, "/api/v1/social/columns", {
    method: "POST",
    body: { name },
  }).then((data) => data.column);
}

export function renameSocialColumn(
  token: string,
  id: string,
  name: string
): Promise<SocialColumn> {
  return socialRequest<{ column: SocialColumn }>(token, `/api/v1/social/columns/${id}`, {
    method: "PATCH",
    body: { name },
  }).then((data) => data.column);
}

export function deleteSocialColumn(token: string, id: string): Promise<void> {
  return socialRequest<unknown>(token, `/api/v1/social/columns/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function deleteSocialCard(token: string, id: string): Promise<void> {
  return socialRequest<unknown>(token, `/api/v1/social/cards/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function listSocialBin(token: string): Promise<SocialCard[]> {
  return socialRequest<ListEnvelope>(token, "/api/v1/social/cards/bin").then(
    (data) => data.cards
  );
}

export function restoreSocialCard(token: string, id: string): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/restore`, {
    method: "POST",
  }).then((data) => data.card);
}

export function purgeSocialCard(token: string, id: string): Promise<void> {
  return socialRequest<unknown>(token, `/api/v1/social/cards/bin/${id}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function emptySocialBin(token: string): Promise<void> {
  return socialRequest<unknown>(token, "/api/v1/social/cards/bin", {
    method: "DELETE",
  }).then(() => undefined);
}

export function duplicateSocialCard(token: string, id: string): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/duplicate`, {
    method: "POST",
  }).then((data) => data.card);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function binDaysLeft(deletedAt: string, now = Date.now()): number {
  const deleted = Date.parse(deletedAt);
  if (Number.isNaN(deleted)) return 0;
  return Math.max(0, Math.ceil((deleted + 30 * DAY_MS - now) / DAY_MS));
}

export async function addSocialCardScrap(
  token: string,
  id: string,
  file: File
): Promise<SocialScrap> {
  const path = await uploadFile(token, file, id);
  const data = await socialRequest<{ scrap: SocialScrap }>(token, `/api/v1/social/cards/${id}/scraps`, {
    method: "POST",
    body: { path },
  });
  return data.scrap;
}

export function removeSocialCardScrap(token: string, id: string, scrapId: string): Promise<void> {
  return socialRequest<unknown>(token, `/api/v1/social/cards/${id}/scraps/${scrapId}`, {
    method: "DELETE",
  }).then(() => undefined);
}

export function getSocialCardScrapUrl(token: string, id: string, scrapId: string): Promise<string> {
  return socialRequest<{ downloadUrl: string }>(
    token,
    `/api/v1/social/cards/${id}/scraps/${scrapId}`
  ).then((data) => data.downloadUrl);
}

export async function addSocialCardFrame(
  token: string,
  id: string,
  file: File
): Promise<SocialCard> {
  const path = await uploadFile(token, file, id);
  const data = await socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/frames`, {
    method: "POST",
    body: { path },
  });
  return data.card;
}

export function removeSocialCardFrame(token: string, id: string, frameId: string): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/frames/${frameId}`, {
    method: "DELETE",
  }).then((data) => data.card);
}

export function orderSocialCardFrames(token: string, id: string, ids: string[]): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/frames/order`, {
    method: "PUT",
    body: { ids },
  }).then((data) => data.card);
}

export function getSocialCardFrameUrl(token: string, id: string, frameId: string): Promise<string> {
  return socialRequest<{ downloadUrl: string }>(
    token,
    `/api/v1/social/cards/${id}/frames/${frameId}`
  ).then((data) => data.downloadUrl);
}

export async function attachSocialCardFile(
  token: string,
  id: string,
  file: File
): Promise<SocialCard> {
  const path = await uploadFile(token, file, id);
  const data = await socialRequest<CardEnvelope>(
    token,
    `/api/v1/social/cards/${id}/file`,
    { method: "POST", body: { path } }
  );
  return data.card;
}

export function reuseSocialCard(token: string, id: string): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/reuse`, {
    method: "POST",
  }).then((data) => data.card);
}

export function removeSocialCardFile(
  token: string,
  id: string
): Promise<SocialCard> {
  return socialRequest<CardEnvelope>(token, `/api/v1/social/cards/${id}/file`, {
    method: "DELETE",
  }).then((data) => data.card);
}
