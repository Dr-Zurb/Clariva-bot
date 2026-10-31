/**
 * Social cards (soc-03, soc-05, soc-07, soc-10, soc-11, soc-20). Doctor-owned marketing cards.
 * Logs ids and field names only. Never a title, the words, a file key, a link code, a post URL, or a column name.
 */

import crypto, { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { isPublicSlugShape } from '../utils/public-clinic-slug';
import { getDoctorTimezone } from './doctor-settings-service';

export const SOCIAL_CARD_STAGES = ['thoughts', 'chosen', 'making', 'ready', 'custom', 'posted'] as const;
export const SOCIAL_CARD_BOARD_STAGES = ['thoughts', 'chosen', 'making', 'ready'] as const;
export const SOCIAL_CARD_FORMATS = ['post', 'reel', 'story'] as const;
export const SOCIAL_CARD_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
  'video/x-msvideo',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const;

const CARD_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CARD_CODE_LENGTH = 10;
const BUCKET = 'social-card-files';
const PHOTO_BYTES = 10 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
const DOCUMENT_BYTES = 10 * 1024 * 1024;
const AUDIO_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_EXPIRY_SEC = 300;
const RESOURCE = 'social_card';

const FILE_EXT: Record<(typeof SOCIAL_CARD_FILE_TYPES)[number], string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/tiff': '.tif',
  'video/webm': '.webm',
  'video/x-m4v': '.m4v',
  'video/3gpp': '.3gp',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/rtf': '.rtf',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',
};

export type SocialFileKind = 'photo' | 'video' | 'audio' | 'document';

export type SocialFileFace = 'sheet' | 'slides' | 'page';

export type SocialScrap = {
  id: string;
  fileKind: SocialFileKind | null;
  postable: boolean;
  face: SocialFileFace | null;
};

export type SocialFrame = {
  id: string;
  fileKind: SocialFileKind | null;
};

export type SocialCardStage = (typeof SOCIAL_CARD_STAGES)[number];
export type SocialCardBoardStage = (typeof SOCIAL_CARD_BOARD_STAGES)[number];
export type SocialCardFormat = (typeof SOCIAL_CARD_FORMATS)[number];
export type SocialCardFileType = (typeof SOCIAL_CARD_FILE_TYPES)[number];

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
  crop?: 'original' | 'square' | 'portrait' | 'landscape';
  /** How a story or reel photo sits in the 9:16 frame. Fill is the default. */
  storyPlace?: 'fill' | 'fit';
  aiGenerated?: boolean;
  shareToFeed?: boolean;
  /** Also send this post or reel as a story. */
  shareToStory?: boolean;
  /** Comments stay closed. Set after the photo is up. */
  commentsOff?: boolean;
  music?: string;
  stickers?: string;
  productTag?: string;
  byHand?: boolean;
  /** A reminder for posting from the phone. It is not sent. */
  handNote?: string;
};

export function socialCardPostsByHand(words: SocialCardWords | null | undefined): boolean {
  if (!words) return false;
  if (words.byHand) return true;
  return ['music', 'productTag'].some((key) => {
    const value = words[key as keyof SocialCardWords];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export type SocialCard = {
  id: string;
  stage: SocialCardStage;
  title: string;
  format: SocialCardFormat | null;
  topic: string | null;
  words: SocialCardWords;
  hasFile: boolean;
  fileKind: SocialFileKind | null;
  postable: boolean;
  scraps: SocialScrap[];
  /** Stays with the card file. A reorder does not change it. */
  fileId: string | null;
  frames: SocialFrame[];
  links: { id: string; url: string }[];
  sourceUrl: string | null;
  scheduledAt: string | null;
  /** When to start making. Chosen or Making only. Not the publish time. */
  makeAt: string | null;
  publishError: string | null;
  instagramUrl: string | null;
  visitCount: number;
  columnId: string | null;
  linkCode: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSocialCardInput = {
  title: string;
  stage?: SocialCardBoardStage;
  format?: SocialCardFormat | null;
  topic?: string | null;
  words?: SocialCardWords;
  filePath?: string;
  sourceUrl?: string | null;
  links?: { id: string; url: string }[];
  columnId?: string;
};

export type UpdateSocialCardInput = {
  title?: string;
  stage?: SocialCardBoardStage;
  format?: SocialCardFormat | null;
  topic?: string | null;
  words?: SocialCardWords;
  sourceUrl?: string | null;
  links?: { id: string; url: string }[];
  scheduledAt?: string | null;
  makeAt?: string | null;
  postNow?: true;
  instagramUrl?: string;
  manualPosted?: true;
  columnId?: string;
};

type SocialCardRow = {
  id: string;
  doctor_id: string;
  stage: SocialCardStage;
  title: string;
  format: SocialCardFormat | null;
  topic: string | null;
  words: SocialCardWords;
  file_path: string | null;
  source_url: string | null;
  resource_links?: unknown;
  scheduled_at: string | null;
  make_at?: string | null;
  publish_error?: string | null;
  publish_attempt_at?: string | null;
  instagram_url: string | null;
  link_code: string | null;
  visit_count: number;
  column_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type StorageObject = {
  name: string;
  metadata?: { size?: number } | null;
};

function adminClient(): NonNullable<ReturnType<typeof getSupabaseAdminClient>> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  return admin;
}

function readLinks(row: SocialCardRow): { id: string; url: string }[] {
  if (Array.isArray(row.resource_links)) {
    return row.resource_links.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const rowItem = item as { id?: unknown; url?: unknown };
      if (typeof rowItem.id !== 'string' || typeof rowItem.url !== 'string') return [];
      return [{ id: rowItem.id, url: rowItem.url }];
    });
  }
  return row.source_url ? [{ id: row.source_url, url: row.source_url }] : [];
}

function cleanLinks(value: { id: string; url: string }[]): { id: string; url: string }[] {
  return value.map((item) => {
    const url = cleanSourceUrl(item.url);
    if (!url) throw new ValidationError('Use a link');
    return { id: item.id, url };
  });
}

function hostWithPort(value: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme || /^https?:\/\//i.test(value)) return false;
  const name = scheme[1];
  const rest = value.slice(scheme[0].length);
  return name.includes('.') || /^\d/.test(rest);
}

function missingSourceUrlColumn(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' && (error.message ?? '').includes('source_url');
}

function withoutSourceUrl<T extends Record<string, unknown>>(row: T): Omit<T, 'source_url'> {
  const { source_url, ...rest } = row;
  void source_url;
  return rest;
}

function cleanSourceUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) throw new ValidationError('Use a link');
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) &&
    !/^https?:\/\//i.test(trimmed) &&
    !hostWithPort(trimmed)
  ) {
    throw new ValidationError('Use a link');
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ValidationError('Use a link');
  }
  const host = url.hostname;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ValidationError('Use a link');
  if (!host || (host !== 'localhost' && !host.includes('.'))) throw new ValidationError('Use a link');
  return url.toString();
}

const FRAME_STORE = 'frameStore';
const FILE_ID = 'fileId';
const FRAME_CAP = 10;

type StoredFrame = { id: string; path: string };

function readFileId(words: SocialCardWords | null | undefined): string | null {
  const raw = (words as Record<string, unknown> | null | undefined)?.[FILE_ID];
  return typeof raw === 'string' && raw.length > 0 && raw !== 'piece' ? raw : null;
}

function readFrameStore(words: SocialCardWords | null | undefined): StoredFrame[] {
  const raw = (words as Record<string, unknown> | null | undefined)?.[FRAME_STORE];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is StoredFrame => {
    if (!item || typeof item !== 'object') return false;
    const row = item as { id?: unknown; path?: unknown };
    return (
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      typeof row.path === 'string' &&
      row.path.length > 0 &&
      row.path.length <= 300
    );
  });
}

function publicWords(words: SocialCardWords | null | undefined): SocialCardWords {
  if (!words) return {};
  const rest = { ...(words as Record<string, unknown>) };
  delete rest[FRAME_STORE];
  delete rest[FILE_ID];
  return rest as SocialCardWords;
}

function withPictures(
  words: SocialCardWords | null | undefined,
  frames: StoredFrame[],
  fileId: string | null
): SocialCardWords {
  const next = { ...publicWords(words) } as Record<string, unknown>;
  if (frames.length > 0) next[FRAME_STORE] = frames;
  if (fileId) next[FILE_ID] = fileId;
  return next as SocialCardWords;
}

function toCard(row: SocialCardRow): SocialCard {
  const stored = readFrameStore(row.words);
  return {
    id: row.id,
    stage: row.stage,
    title: row.title,
    format: row.format,
    topic: row.topic,
    words: publicWords(row.words),
    hasFile: Boolean(row.file_path),
    fileKind: fileKindFromPath(row.file_path),
    postable: isPostablePath(row.file_path),
    scraps: [],
    fileId: row.file_path ? readFileId(row.words) : null,
    frames: stored.map((frame) => ({
      id: frame.id,
      fileKind: fileKindFromPath(frame.path),
    })),
    links: readLinks(row),
    sourceUrl: row.source_url ?? readLinks(row)[0]?.url ?? null,
    scheduledAt: row.scheduled_at ?? null,
    makeAt: row.make_at ?? null,
    publishError: row.publish_error ?? null,
    instagramUrl: row.instagram_url ?? null,
    visitCount: row.visit_count ?? 0,
    columnId: row.column_id ?? null,
    linkCode: row.link_code ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newSocialCardCode(): string {
  const bytes = crypto.randomBytes(CARD_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CARD_CODE_LENGTH; i++) {
    code += CARD_CODE_ALPHABET[bytes[i]! % CARD_CODE_ALPHABET.length];
  }
  return code;
}

const INSTAGRAM_POST_PATH =
  /^\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$|^\/stories\/[A-Za-z0-9._]+\/[0-9]+\/?$/;

export function isInstagramPostUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'www.instagram.com' && host !== 'instagram.com') return false;
  if (parsed.username || parsed.password) return false;
  return INSTAGRAM_POST_PATH.test(parsed.pathname);
}

export function isSocialCardCode(value: string): boolean {
  return new RegExp(`^[${CARD_CODE_ALPHABET}]{${CARD_CODE_LENGTH}}$`).test(value);
}

function assertContentType(contentType: string): SocialCardFileType {
  if (!(SOCIAL_CARD_FILE_TYPES as readonly string[]).includes(contentType)) {
    throw new ValidationError('Use a photo, a video, audio, or a document');
  }
  return contentType as SocialCardFileType;
}

const EXT_KIND: Record<string, SocialFileKind> = {
  jpg: 'photo',
  jpeg: 'photo',
  png: 'photo',
  webp: 'photo',
  gif: 'photo',
  heic: 'photo',
  heif: 'photo',
  avif: 'photo',
  bmp: 'photo',
  tif: 'photo',
  tiff: 'photo',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
  '3gp': 'video',
  avi: 'video',
  mkv: 'video',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  ppt: 'document',
  pptx: 'document',
  xls: 'document',
  xlsx: 'document',
  txt: 'document',
  csv: 'document',
  rtf: 'document',
  odt: 'document',
  ods: 'document',
  odp: 'document',
};

function extensionOf(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
}

function fileKindFromPath(filePath: string | null): SocialFileKind | null {
  if (!filePath) return null;
  return EXT_KIND[extensionOf(filePath)] ?? null;
}

function faceFromPath(filePath: string | null): SocialFileFace | null {
  if (!filePath) return null;
  const ext = extensionOf(filePath);
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slides';
  if (EXT_KIND[ext] === 'document') return 'page';
  return null;
}

function isPostablePath(filePath: string | null): boolean {
  if (!filePath) return false;
  return ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'].includes(extensionOf(filePath));
}

function assertReadyFile(filePath: string | null): void {
  if (!filePath) throw new ValidationError('Ready needs a file');
  if (isPostablePath(filePath)) return;
  const kind = fileKindFromPath(filePath);
  if (kind === 'photo' || kind === 'video' || kind === 'audio') {
    throw new ValidationError('Ready needs a JPEG, PNG, WebP, MP4, or MOV');
  }
  throw new ValidationError('Ready needs a photo or a video');
}

function assertCardMedia(format: SocialCardFormat | null, filePath: string | null): void {
  if (!filePath) return;
  if (format !== 'post' && format !== 'reel' && format !== 'story') return;
  if (isPostablePath(filePath)) return;
  const kind = fileKindFromPath(filePath);
  throw new ValidationError(
    kind === 'photo' || kind === 'video' ? 'Use a JPEG, PNG, WebP, MP4, or MOV' : 'Use a photo or a video'
  );
}

function assertMediaUpload(format: SocialCardFormat | null, contentType: string): void {
  if (format !== 'post' && format !== 'reel' && format !== 'story') return;
  if (contentType.startsWith('image/') || contentType.startsWith('video/')) return;
  throw new ValidationError('Use a photo or a video');
}

function assertObjectKey(filePath: string, doctorId: string, cardId: string | null): void {
  if (filePath.includes('..') || filePath.includes('\\')) {
    throw new ValidationError('File does not belong to this doctor');
  }
  const parts = filePath.split('/');
  const name = parts[parts.length - 1] ?? '';
  const owned =
    parts[0] === doctorId &&
    (cardId === null ? parts.length === 2 : parts.length === 3 && parts[1] === cardId) &&
    new RegExp(`^[0-9a-f-]{36}\\.(${Object.keys(EXT_KIND).join('|')})$`).test(name);
  if (!owned) throw new ValidationError('File does not belong to this doctor');
}

async function loadOwned(
  id: string,
  doctorId: string,
  correlationId: string
): Promise<SocialCardRow> {
  const { data, error } = await adminClient()
    .from('social_cards')
    .select('*')
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');
  return data as SocialCardRow;
}

async function assertObjectExists(filePath: string): Promise<void> {
  const folder = filePath.slice(0, filePath.lastIndexOf('/'));
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  const { data, error } = await adminClient().storage.from(BUCKET).list(folder, {
    limit: 100,
    search: name,
  });
  if (error) throw new InternalError('Could not check the file');
  const found = ((data ?? []) as StorageObject[]).find((item) => item.name === name);
  if (!found) throw new ValidationError('File was not uploaded');
  const size = found.metadata?.size;
  const kind = fileKindFromPath(filePath);
  const cap =
    kind === 'video' ? VIDEO_BYTES : kind === 'audio' ? AUDIO_BYTES : kind === 'document' ? DOCUMENT_BYTES : PHOTO_BYTES;
  const tooBig =
    kind === 'video'
      ? 'Video is over 100 MB'
      : kind === 'audio'
        ? 'Audio is over 15 MB'
        : kind === 'document'
          ? 'Document is over 10 MB'
          : 'Photo is over 10 MB';
  if (typeof size === 'number' && size > cap) {
    await removeObject(filePath);
    throw new ValidationError(tooBig);
  }
}

async function removeObject(filePath: string): Promise<void> {
  const { error } = await adminClient().storage.from(BUCKET).remove([filePath]);
  if (error) throw new InternalError('Could not remove the file');
}

async function mintUpload(
  doctorId: string,
  cardId: string | null,
  contentType: string,
  correlationId: string
): Promise<{ path: string; token: string }> {
  const ext = FILE_EXT[assertContentType(contentType)];
  const path = cardId
    ? `${doctorId}/${cardId}/${randomUUID()}${ext}`
    : `${doctorId}/${randomUUID()}${ext}`;
  const { data, error } = await adminClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.path || !data?.token) {
    throw new InternalError('Could not start the upload');
  }
  await logDataModification(
    correlationId,
    doctorId,
    'create',
    'social_card_file',
    cardId ?? doctorId,
    ['upload']
  );
  return { path: data.path, token: data.token };
}

type SocialColumnKind = 'thoughts' | 'chosen' | 'making' | 'ready' | 'custom';

export type SocialColumn = {
  id: string;
  kind: SocialColumnKind;
  name: string;
  position: number;
};

type SocialColumnRow = SocialColumn & { doctor_id: string };

const OPENING_COLUMNS: readonly { kind: Exclude<SocialColumnKind, 'custom'>; name: string; position: number }[] =
  [
    { kind: 'thoughts', name: 'Thoughts and ideas', position: 0 },
    { kind: 'chosen', name: 'Chosen', position: 1 },
    { kind: 'making', name: 'Making', position: 2 },
    { kind: 'ready', name: 'Ready', position: 3 },
  ];

const COLUMN_RESOURCE = 'social_column';

function toColumn(row: SocialColumnRow): SocialColumn {
  return { id: row.id, kind: row.kind, name: row.name, position: row.position };
}

async function loadSocialColumn(
  id: string,
  doctorId: string,
  correlationId: string
): Promise<SocialColumnRow> {
  const { data, error } = await adminClient()
    .from('social_columns')
    .select('id, doctor_id, kind, name, position')
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social column not found');
  return data as SocialColumnRow;
}

async function readSocialColumns(
  doctorId: string,
  correlationId: string
): Promise<SocialColumnRow[]> {
  const { data, error } = await adminClient()
    .from('social_columns')
    .select('id, doctor_id, kind, name, position')
    .eq('doctor_id', doctorId)
    .order('position', { ascending: true });
  if (error) handleSupabaseError(error, correlationId);
  return (data ?? []) as SocialColumnRow[];
}

export async function listSocialColumns(
  correlationId: string,
  doctorId: string
): Promise<SocialColumn[]> {
  const existing = await readSocialColumns(doctorId, correlationId);
  const present = new Set(existing.map((column) => column.kind));
  if (existing.length === 0) {
    const { error } = await adminClient()
      .from('social_columns')
      .insert(
        OPENING_COLUMNS.map((column) => ({
          doctor_id: doctorId,
          kind: column.kind,
          name: column.name,
          position: column.position,
        }))
      );
    if (error) handleSupabaseError(error, correlationId);
    await logDataModification(correlationId, doctorId, 'create', COLUMN_RESOURCE, doctorId, [
      'kind',
      'position',
    ]);
  } else if (OPENING_COLUMNS.some((column) => !present.has(column.kind))) {
    throw new InternalError('Could not load the columns');
  }
  const columns = existing.length === 0 ? await readSocialColumns(doctorId, correlationId) : existing;
  await logDataAccess(correlationId, doctorId, COLUMN_RESOURCE);
  return columns.map(toColumn);
}

export async function createSocialColumn(
  name: string,
  correlationId: string,
  doctorId: string
): Promise<SocialColumn> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ValidationError('Name the column');
  }
  const columns = await readSocialColumns(doctorId, correlationId);
  const ready = columns.find((column) => column.kind === 'ready');
  if (!ready) throw new NotFoundError('Social column not found');
  const shifting = columns
    .filter((column) => column.position >= ready.position)
    .sort((left, right) => right.position - left.position);
  for (const column of shifting) {
    const { error } = await adminClient()
      .from('social_columns')
      .update({ position: column.position + 1 })
      .eq('id', column.id)
      .eq('doctor_id', doctorId);
    if (error) handleSupabaseError(error, correlationId);
  }
  const { data, error } = await adminClient()
    .from('social_columns')
    .insert({
      doctor_id: doctorId,
      kind: 'custom',
      name: trimmed,
      position: ready.position,
    })
    .select('id, doctor_id, kind, name, position')
    .single();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social column not found');
  const column = toColumn(data as SocialColumnRow);
  await logDataModification(correlationId, doctorId, 'create', COLUMN_RESOURCE, column.id, [
    'kind',
    'position',
  ]);
  return column;
}

export async function renameSocialColumn(
  id: string,
  name: string,
  correlationId: string,
  doctorId: string
): Promise<SocialColumn> {
  const current = await loadSocialColumn(id, doctorId, correlationId);
  if (current.kind !== 'custom') {
    throw new ValidationError('The opening columns stay');
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ValidationError('Name the column');
  }
  const { data, error } = await adminClient()
    .from('social_columns')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('id, doctor_id, kind, name, position')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social column not found');
  await logDataModification(correlationId, doctorId, 'update', COLUMN_RESOURCE, id, ['kind']);
  return toColumn(data as SocialColumnRow);
}

export async function deleteSocialColumn(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<void> {
  const current = await loadSocialColumn(id, doctorId, correlationId);
  if (current.kind !== 'custom') {
    throw new ValidationError('The opening columns stay');
  }
  const { error: moveError } = await adminClient()
    .from('social_cards')
    .update({ stage: 'thoughts', column_id: null, scheduled_at: null, make_at: null })
    .eq('doctor_id', doctorId)
    .eq('column_id', id)
    .eq('stage', 'custom');
  if (moveError) handleSupabaseError(moveError, correlationId);
  const { data, error } = await adminClient()
    .from('social_columns')
    .delete()
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('id')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social column not found');
  await logDataModification(correlationId, doctorId, 'delete', COLUMN_RESOURCE, id);
}

const BIN_MS = 30 * 24 * 60 * 60 * 1000;

async function heldForDestroy(
  id: string,
  doctorId: string
): Promise<{ words?: SocialCardWords; thumbPath: string | null }> {
  const full = await adminClient()
    .from('social_cards')
    .select('words, thumb_path')
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (full.error) {
    const wordsOnly = await adminClient()
      .from('social_cards')
      .select('words')
      .eq('id', id)
      .eq('doctor_id', doctorId)
      .maybeSingle();
    return { words: (wordsOnly.data as { words?: SocialCardWords } | null)?.words, thumbPath: null };
  }
  const row = full.data as { words?: SocialCardWords; thumb_path?: string | null } | null;
  return { words: row?.words, thumbPath: row?.thumb_path ?? null };
}

async function destroyCard(
  id: string,
  filePath: string | null,
  doctorId: string,
  correlationId: string
): Promise<void> {
  await removeScrapObjects(id);
  const held = await heldForDestroy(id, doctorId);
  await removeStoredFrames(held.words);
  if (filePath) await removeObject(filePath);
  if (held.thumbPath && held.thumbPath !== filePath) {
    try {
      await removeObject(held.thumbPath);
    } catch {
      // The row still goes. A leftover picture is not a patient file.
    }
  }
  const { error } = await adminClient()
    .from('social_cards')
    .delete()
    .eq('id', id)
    .eq('doctor_id', doctorId);
  if (error) handleSupabaseError(error, correlationId);
  await logDataModification(correlationId, doctorId, 'delete', RESOURCE, id);
}

async function purgeExpiredCards(doctorId: string, correlationId: string): Promise<void> {
  const cutoff = Date.now() - BIN_MS;
  const { data, error } = await adminClient()
    .from('social_cards')
    .select('id, file_path, deleted_at')
    .eq('doctor_id', doctorId);
  if (error || !data) return;
  for (const row of data as { id: string; file_path: string | null; deleted_at: string | null }[]) {
    if (!row.deleted_at || Date.parse(row.deleted_at) >= cutoff) continue;
    try {
      await destroyCard(row.id, row.file_path, doctorId, correlationId);
    } catch {
      // Leave the row. The next open tries again. Do not log the file path.
    }
  }
}

export async function listSocialCards(
  correlationId: string,
  doctorId: string
): Promise<SocialCard[]> {
  // Expired bin rows are not on the board. Cleanup stays off this response.
  void purgeExpiredCards(doctorId, correlationId).catch(() => undefined);
  const admin = adminClient();
  const [listed, extras] = await Promise.all([
    admin
      .from('social_cards')
      .select('*')
      .eq('doctor_id', doctorId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    scrapIndex(doctorId),
    logDataAccess(correlationId, doctorId, RESOURCE),
  ]);
  if (listed.error) handleSupabaseError(listed.error, correlationId);

  return ((listed.data ?? []) as SocialCardRow[])
    .filter((row) => !row.deleted_at)
    .map((row) => {
      const card = toCard(row);
      card.scraps = extras.get(row.id) ?? [];
      return card;
    });
}

export async function listBinnedSocialCards(
  correlationId: string,
  doctorId: string
): Promise<SocialCard[]> {
  await purgeExpiredCards(doctorId, correlationId);
  const { data, error } = await adminClient()
    .from('social_cards')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('updated_at', { ascending: false });
  if (error) handleSupabaseError(error, correlationId);
  await logDataAccess(correlationId, doctorId, RESOURCE);
  return ((data ?? []) as SocialCardRow[])
    .filter((row) => Boolean(row.deleted_at))
    .map(toCard);
}

export async function createSocialCard(
  input: CreateSocialCardInput,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  let stage: SocialCardStage = input.stage ?? 'thoughts';
  let columnId: string | null = null;
  if (input.columnId) {
    const column = await loadSocialColumn(input.columnId, doctorId, correlationId);
    stage = column.kind === 'custom' ? 'custom' : column.kind;
    columnId = column.id;
  }
  if (input.filePath) {
    assertObjectKey(input.filePath, doctorId, null);
    await assertObjectExists(input.filePath);
  }
  try {
    if (stage === 'ready') assertReadyFile(input.filePath ?? null);
    assertCardMedia(input.format ?? null, input.filePath ?? null);
  } catch (error) {
    if (input.filePath) await removeObject(input.filePath);
    throw error;
  }

  const admin = adminClient();
  const sourceUrl = cleanSourceUrl(input.sourceUrl);
  const inserted = {
    doctor_id: doctorId,
    stage,
    title: input.title,
    format: input.format ?? null,
    topic: input.topic ?? null,
    words: input.filePath ? withPictures(input.words ?? {}, [], crypto.randomUUID()) : (input.words ?? {}),
    file_path: input.filePath ?? null,
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    ...(columnId ? { column_id: columnId } : {}),
  };
  let { data, error } = await admin.from('social_cards').insert(inserted).select('*').single();
  if (error && missingSourceUrlColumn(error) && 'source_url' in inserted) {
    ({ data, error } = await admin
      .from('social_cards')
      .insert(withoutSourceUrl(inserted))
      .select('*')
      .single());
  }
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');

  const card = toCard(data as SocialCardRow);
  await logDataModification(correlationId, doctorId, 'create', RESOURCE, card.id, [
    'stage',
    'title',
    'format',
    'topic',
    'words',
    'file_path',
  ]);
  return card;
}

export async function reuseSocialCard(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (current.stage !== 'posted') {
    throw new ValidationError('Use again is for a posted card');
  }
  return createSocialCard(
    {
      title: current.title,
      stage: 'thoughts',
      format: current.format,
      topic: current.topic,
      words: publicWords(current.words),
      sourceUrl: current.source_url,
    },
    correlationId,
    doctorId
  );
}

async function updateOwnedCard(
  id: string,
  doctorId: string,
  patch: Record<string, unknown>,
  correlationId: string
): Promise<SocialCardRow | null> {
  let next = patch;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await adminClient()
      .from('social_cards')
      .update(next)
      .eq('id', id)
      .eq('doctor_id', doctorId)
      .select('*')
      .maybeSingle();
    if (!error) return (data as SocialCardRow | null) ?? null;
    if (missingSourceUrlColumn(error) && 'source_url' in next) {
      next = withoutSourceUrl(next);
      continue;
    }
    if (error.code === '23505' && typeof next.link_code === 'string') {
      next = { ...next, link_code: newSocialCardCode() };
      continue;
    }
    if (error.code === '23514' && next.stage === 'posted' && !('scheduled_at' in next)) {
      next = { ...next, scheduled_at: null };
      continue;
    }
    handleSupabaseError(error, correlationId);
  }
  throw new InternalError('Could not save the card');
}

const SENDING_MS = 10 * 60 * 1000;

/** The worker claimed this card and has not finished. A second send could post it twice. */
function socialCardSending(current: SocialCardRow, now = Date.now()): boolean {
  if (!current.publish_attempt_at || current.publish_error) return false;
  const claimed = Date.parse(current.publish_attempt_at);
  return !Number.isNaN(claimed) && now - claimed < SENDING_MS;
}

async function markSocialCardPosted(
  current: SocialCardRow,
  instagramUrl: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  if (current.stage !== 'ready' || !current.file_path) {
    throw new ValidationError('Paste the link on a Ready card');
  }
  if (!isInstagramPostUrl(instagramUrl)) {
    throw new ValidationError('Paste an Instagram post link');
  }

  const patch: Record<string, unknown> = {
    stage: 'posted',
    instagram_url: instagramUrl,
    file_path: null,
  };
  if (readFrameStore(current.words).length > 0) patch.words = publicWords(current.words);
  if (!current.link_code) patch.link_code = newSocialCardCode();

  const data = await updateOwnedCard(current.id, doctorId, patch, correlationId);
  if (!data) throw new NotFoundError('Social card not found');
  await removeStoredFrames(current.words);
  await removeObject(current.file_path);

  const card = toCard(data);
  await logDataModification(
    correlationId,
    doctorId,
    'update',
    RESOURCE,
    card.id,
    Object.keys(patch)
  );
  return card;
}

async function markSocialCardPostedByHand(
  current: SocialCardRow,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  if (current.stage !== 'ready' || !current.file_path) {
    throw new ValidationError('Mark a Ready card posted');
  }
  if (!socialCardPostsByHand(current.words)) {
    throw new ValidationError('This card is set to send itself');
  }

  const patch: Record<string, unknown> = {
    stage: 'posted',
    publish_error: null,
  };
  const data = await updateOwnedCard(current.id, doctorId, patch, correlationId);
  if (!data) throw new NotFoundError('Social card not found');

  const card = toCard(data);
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, card.id, Object.keys(patch));
  return card;
}

export async function updateSocialCard(
  id: string,
  input: UpdateSocialCardInput,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (input.manualPosted) {
    return markSocialCardPostedByHand(current, correlationId, doctorId);
  }
  if (input.instagramUrl !== undefined) {
    return markSocialCardPosted(current, input.instagramUrl, correlationId, doctorId);
  }
  let stageChange: SocialCardStage | undefined = input.stage;
  let nextColumnId: string | undefined;
  if (input.columnId) {
    if (current.stage === 'posted') {
      throw new ValidationError('A posted card stays off the board');
    }
    const column = await loadSocialColumn(input.columnId, doctorId, correlationId);
    stageChange = column.kind === 'custom' ? 'custom' : column.kind;
    nextColumnId = column.id;
  }
  if (stageChange === 'ready') {
    assertReadyFile(current.file_path);
    assertCardMedia(input.format !== undefined ? input.format : current.format, current.file_path);
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (stageChange !== undefined) patch.stage = stageChange;
  if (nextColumnId) patch.column_id = nextColumnId;
  if (input.format !== undefined) patch.format = input.format;
  if (input.topic !== undefined) patch.topic = input.topic;
  if (input.words !== undefined) {
    patch.words = withPictures(input.words, readFrameStore(current.words), readFileId(current.words));
  }
  if (input.sourceUrl !== undefined) patch.source_url = cleanSourceUrl(input.sourceUrl);
  if (input.links !== undefined) {
    const links = cleanLinks(input.links);
    patch.resource_links = links;
    patch.source_url = links[0]?.url ?? null;
  }
  if (input.postNow) {
    if (current.stage === 'posted') {
      throw new ValidationError('This card is already posted.');
    }
    if (socialCardPostsByHand(current.words)) {
      throw new ValidationError('Halo Aid will not send this. You post it from the phone.');
    }
    const nextStage = stageChange ?? current.stage;
    if (nextStage !== 'ready' || !current.file_path) {
      throw new ValidationError('A time needs a Ready card with a file');
    }
    if (socialCardSending(current)) {
      throw new ConflictError('Halo Aid is already sending this.');
    }
    patch.scheduled_at = new Date().toISOString();
    patch.publish_attempt_at = null;
    patch.publish_error = null;
    if (!current.link_code) patch.link_code = newSocialCardCode();
  } else if (input.scheduledAt) {
    const nextStage = stageChange ?? current.stage;
    if (nextStage !== 'ready' || !current.file_path) {
      throw new ValidationError('A time needs a Ready card with a file');
    }
    patch.scheduled_at = input.scheduledAt;
    if (!current.link_code) patch.link_code = newSocialCardCode();
  } else if (input.scheduledAt === null) {
    patch.scheduled_at = null;
  }
  if (stageChange && stageChange !== 'ready') {
    patch.scheduled_at = null;
  }
  const nextStage = stageChange ?? current.stage;
  const makingPlan = nextStage === 'chosen' || nextStage === 'making';
  if (input.makeAt) {
    if (!makingPlan) {
      throw new ValidationError('A start time is for a Chosen or Making card');
    }
    patch.make_at = input.makeAt;
  } else if (input.makeAt === null) {
    patch.make_at = null;
  }
  if (stageChange === 'making' && current.stage === 'chosen') {
    patch.make_at = null;
  }
  if (stageChange && !makingPlan) {
    patch.make_at = null;
  }

  const data = await updateOwnedCard(id, doctorId, patch, correlationId);
  if (!data) throw new NotFoundError('Social card not found');

  const card = toCard(data as SocialCardRow);
  await logDataModification(
    correlationId,
    doctorId,
    'update',
    RESOURCE,
    card.id,
    Object.keys(patch)
  );
  return card;
}

export async function deleteSocialCard(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<void> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (current.deleted_at) throw new NotFoundError('Social card not found');
  const { data, error } = await adminClient()
    .from('social_cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('id')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');
  await logDataModification(correlationId, doctorId, 'delete', RESOURCE, id, ['deleted_at']);
}

export async function purgeBinnedSocialCard(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<void> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.deleted_at) throw new NotFoundError('Social card not found');
  await destroyCard(current.id, current.file_path, doctorId, correlationId);
}

export async function emptySocialBin(correlationId: string, doctorId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from('social_cards')
    .select('id, file_path, deleted_at')
    .eq('doctor_id', doctorId);
  if (error) handleSupabaseError(error, correlationId);
  const binned = ((data ?? []) as { id: string; file_path: string | null; deleted_at: string | null }[]).filter(
    (row) => Boolean(row.deleted_at)
  );
  for (const row of binned) {
    await destroyCard(row.id, row.file_path, doctorId, correlationId);
  }
}

export async function restoreSocialCard(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.deleted_at) throw new NotFoundError('Social card not found');
  const data = await updateOwnedCard(id, doctorId, { deleted_at: null }, correlationId);
  if (!data) throw new NotFoundError('Social card not found');
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, id, ['deleted_at']);
  return toCard(data);
}

export async function duplicateSocialCard(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (current.deleted_at) throw new NotFoundError('Social card not found');
  const stage: SocialCardBoardStage =
    current.stage === 'chosen' || current.stage === 'making' ? current.stage : current.stage === 'ready' || current.stage === 'posted' ? 'making' : 'thoughts';
  return createSocialCard(
    {
      title: current.title,
      stage,
      format: current.format,
      topic: current.topic,
      words: publicWords(current.words),
      sourceUrl: current.source_url,
    },
    correlationId,
    doctorId
  );
}

export async function createSocialCardUpload(
  contentType: string,
  correlationId: string,
  doctorId: string
): Promise<{ path: string; token: string }> {
  return mintUpload(doctorId, null, contentType, correlationId);
}

export async function createSocialCardFileUpload(
  id: string,
  contentType: string,
  correlationId: string,
  doctorId: string
): Promise<{ path: string; token: string }> {
  const card = await loadOwned(id, doctorId, correlationId);
  assertMediaUpload(card.format, assertContentType(contentType));
  return mintUpload(doctorId, id, contentType, correlationId);
}

export async function attachSocialCardFile(
  id: string,
  filePath: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  assertObjectKey(filePath, doctorId, id);
  await assertObjectExists(filePath);
  assertCardMedia(current.format, filePath);

  const { data, error } = await adminClient()
    .from('social_cards')
    .update({
      file_path: filePath,
      words: withPictures(current.words, readFrameStore(current.words), crypto.randomUUID()),
    })
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('*')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');

  if (current.file_path && current.file_path !== filePath) {
    await removeObject(current.file_path);
  }
  const card = toCard(data as SocialCardRow);
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, card.id, ['file_path']);
  return card;
}

export async function removeSocialCardFile(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.file_path) throw new ValidationError('This card has no file');
  const stored = readFrameStore(current.words);
  const next = stored[0];
  if (next) {
    const { data, error } = await adminClient()
      .from('social_cards')
      .update({
        file_path: next.path,
        words: withPictures(current.words, stored.slice(1), next.id),
      })
      .eq('id', id)
      .eq('doctor_id', doctorId)
      .select('*')
      .maybeSingle();
    if (error) handleSupabaseError(error, correlationId);
    if (!data) throw new NotFoundError('Social card not found');
    await removeObject(current.file_path);
    const card = toCard(data as SocialCardRow);
    await logDataModification(correlationId, doctorId, 'update', RESOURCE, card.id, ['file_path']);
    return card;
  }
  const stage: SocialCardStage = current.stage === 'ready' ? 'making' : current.stage;

  const { data, error } = await adminClient()
    .from('social_cards')
    .update({
      file_path: null,
      stage,
      scheduled_at: null,
      words: withPictures(current.words, [], null),
    })
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('*')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');

  await removeObject(current.file_path);
  const card = toCard(data as SocialCardRow);
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, card.id, [
    'file_path',
    'stage',
    'scheduled_at',
  ]);
  return card;
}

export async function getSocialPagePath(
  doctorId: string,
  correlationId: string
): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('doctor_settings')
    .select('public_slug')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  const slug = (data as { public_slug?: string | null } | null)?.public_slug?.trim() ?? '';
  if (!slug || !isPublicSlugShape(slug)) return null;
  return `/d/${slug}`;
}

export async function ensureSocialCardLink(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (current.link_code) return toCard(current);
  const data = await updateOwnedCard(
    id,
    doctorId,
    { link_code: newSocialCardCode() },
    correlationId
  );
  if (!data) throw new NotFoundError('Social card not found');
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, data.id, ['link_code']);
  return toCard(data);
}

export async function findSocialCardLink(
  code: string,
  correlationId: string
): Promise<{ cardId: string; doctorId: string } | null> {
  if (!isSocialCardCode(code)) return null;
  const { data, error } = await adminClient()
    .from('social_cards')
    .select('id, doctor_id, deleted_at')
    .eq('link_code', code)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  const row = data as { id?: string; doctor_id?: string; deleted_at?: string | null } | null;
  if (!row?.id || !row.doctor_id || row.deleted_at) return null;
  return { cardId: row.id, doctorId: row.doctor_id };
}

export async function recordSocialCardVisit(
  code: string | undefined,
  doctorId: string,
  correlationId: string,
  appointmentId?: string
): Promise<void> {
  const raw = code?.trim() ?? '';
  if (!isSocialCardCode(raw)) return;
  try {
    const admin = adminClient();
    const { data, error } = await admin
      .from('social_cards')
      .select('id, visit_count')
      .eq('link_code', raw)
      .eq('doctor_id', doctorId)
      .maybeSingle();
    if (error) {
      logger.warn({ correlationId, errorCode: error.code }, 'social_card_visit_count_failed');
      return;
    }
    const found = data as { id?: string; visit_count?: number } | null;
    if (!found?.id) return;
    const { error: updateError } = await admin
      .from('social_cards')
      .update({ visit_count: (found.visit_count ?? 0) + 1 })
      .eq('id', found.id)
      .eq('doctor_id', doctorId);
    if (updateError) {
      logger.warn({ correlationId, errorCode: updateError.code }, 'social_card_visit_count_failed');
      return;
    }
    await logDataModification(correlationId, doctorId, 'update', RESOURCE, found.id, [
      'visit_count',
    ]);
    const zone = await getDoctorTimezone(doctorId);
    const bookedOn = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const row: Record<string, string> = {
      doctor_id: doctorId,
      card_id: found.id,
      booked_on: bookedOn,
    };
    if (appointmentId) row.appointment_id = appointmentId;
    const inserted = await admin.from('social_card_link_bookings').insert(row);
    if (
      inserted.error &&
      inserted.error.code !== '23505' &&
      inserted.error.code !== 'PGRST205' &&
      inserted.error.code !== '42P01'
    ) {
      logger.warn({ correlationId, errorCode: inserted.error.code }, 'social_card_visit_day_failed');
    }
  } catch {
    logger.warn({ correlationId }, 'social_card_visit_count_failed');
  }
}

export async function rememberSentPost(
  doctorId: string,
  cardId: string,
  mediaId: string,
  jpeg: Buffer | null,
  correlationId: string
): Promise<void> {
  try {
    const admin = adminClient();
    const patch: Record<string, string> = {};
    if (mediaId) patch.instagram_media_id = mediaId;
    let thumbKey = '';
    if (jpeg && jpeg.length > 0) {
      thumbKey = `${doctorId}/${cardId}/thumb.jpg`;
      const uploaded = await admin.storage.from(BUCKET).upload(thumbKey, jpeg, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (!uploaded.error) patch.thumb_path = thumbKey;
      else thumbKey = '';
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await admin.from('social_cards').update(patch).eq('id', cardId).eq('doctor_id', doctorId);
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      if (thumbKey) await admin.storage.from(BUCKET).remove([thumbKey]);
      return;
    }
    if (error) logger.warn({ correlationId, errorCode: error.code }, 'social card publish: post id not saved');
  } catch {
    logger.warn({ correlationId }, 'social card publish: post id not saved');
  }
}

const SCRAP_CAP = 10;

type ScrapRow = { id?: string; card_id?: string; file_path?: string; position?: number };

async function scrapIndex(doctorId: string): Promise<Map<string, SocialScrap[]>> {
  const map = new Map<string, SocialScrap[]>();
  const { data, error } = await adminClient()
    .from('social_card_scraps')
    .select('id, card_id, file_path, position')
    .eq('doctor_id', doctorId);
  if (error || !Array.isArray(data)) return map;
  const rows = (data as ScrapRow[])
    .filter((row): row is Required<Pick<ScrapRow, 'id' | 'card_id' | 'file_path'>> & ScrapRow =>
      Boolean(row.card_id && row.id && row.file_path)
    )
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  for (const row of rows) {
    const list = map.get(row.card_id) ?? [];
    list.push({
      id: row.id,
      fileKind: fileKindFromPath(row.file_path),
      postable: isPostablePath(row.file_path),
      face: faceFromPath(row.file_path),
    });
    map.set(row.card_id, list);
  }
  return map;
}

async function removeScrapObjects(cardId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from('social_card_scraps')
    .select('file_path, card_id')
    .eq('card_id', cardId);
  if (error || !Array.isArray(data)) return;
  for (const row of data as ScrapRow[]) {
    if (row.card_id !== cardId || !row.file_path) continue;
    try {
      await removeObject(row.file_path);
    } catch {
      // The row goes with the card. The next purge can retry the object.
    }
  }
}

function scrapMeta(id: string, filePath: string): SocialScrap {
  return {
    id,
    fileKind: fileKindFromPath(filePath),
    postable: isPostablePath(filePath),
    face: faceFromPath(filePath),
  };
}

export async function addSocialCardScrap(
  id: string,
  filePath: string,
  correlationId: string,
  doctorId: string
): Promise<SocialScrap> {
  const card = await loadOwned(id, doctorId, correlationId);
  const scrapKind = fileKindFromPath(filePath);
  if (
    (card.format === 'post' || card.format === 'reel' || card.format === 'story') &&
    scrapKind !== 'photo' &&
    scrapKind !== 'video'
  ) {
    throw new ValidationError('Use a photo or a video');
  }
  const existing = await adminClient()
    .from('social_card_scraps')
    .select('file_path')
    .eq('card_id', id)
    .eq('doctor_id', doctorId);
  const rows = Array.isArray(existing.data) ? (existing.data as ScrapRow[]) : [];
  const kind = fileKindFromPath(filePath);
  const sameKind = rows.filter((row) => fileKindFromPath(row.file_path ?? null) === kind).length;
  const piece = kind && fileKindFromPath(card.file_path) === kind ? 1 : 0;
  if (kind && sameKind + piece >= SCRAP_CAP) throw new ValidationError('The pile is full');
  assertObjectKey(filePath, doctorId, id);
  await assertObjectExists(filePath);
  const { data, error } = await adminClient()
    .from('social_card_scraps')
    .insert({
      doctor_id: doctorId,
      card_id: id,
      file_path: filePath,
      position: rows.length,
    })
    .select('id, file_path')
    .single();
  if (error || !data) throw new InternalError('Could not keep the file');
  const saved = data as { id: string; file_path: string };
  await logDataModification(correlationId, doctorId, 'create', 'social_card_scrap', saved.id, [
    'file_path',
  ]);
  return scrapMeta(saved.id, saved.file_path);
}

export async function removeSocialCardScrap(
  id: string,
  scrapId: string,
  correlationId: string,
  doctorId: string
): Promise<void> {
  await loadOwned(id, doctorId, correlationId);
  const { data, error } = await adminClient()
    .from('social_card_scraps')
    .select('id, file_path, card_id')
    .eq('id', scrapId)
    .eq('card_id', id)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  const row = data as ScrapRow | null;
  if (!row?.id || !row.file_path || row.card_id !== id) throw new NotFoundError('Social card file not found');
  const { error: deleteError } = await adminClient()
    .from('social_card_scraps')
    .delete()
    .eq('id', scrapId)
    .eq('doctor_id', doctorId);
  if (deleteError) handleSupabaseError(deleteError, correlationId);
  await removeObject(row.file_path);
  await logDataModification(correlationId, doctorId, 'delete', 'social_card_scrap', scrapId, [
    'file_path',
  ]);
}

export async function getSocialCardScrapUrl(
  id: string,
  scrapId: string,
  correlationId: string,
  doctorId: string
): Promise<{ downloadUrl: string }> {
  await loadOwned(id, doctorId, correlationId);
  const { data, error } = await adminClient()
    .from('social_card_scraps')
    .select('id, file_path, card_id')
    .eq('id', scrapId)
    .eq('card_id', id)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  const row = data as ScrapRow | null;
  if (!row?.file_path || row.card_id !== id) throw new NotFoundError('Social card file not found');
  const signed = await adminClient().storage.from(BUCKET).createSignedUrl(row.file_path, DOWNLOAD_EXPIRY_SEC);
  if (signed.error || !signed.data?.signedUrl) throw new InternalError('Could not open the file');
  await logDataAccess(correlationId, doctorId, 'social_card_scrap', scrapId);
  return { downloadUrl: signed.data.signedUrl };
}

export async function getSocialCardFileUrl(
  id: string,
  correlationId: string,
  doctorId: string
): Promise<{ downloadUrl: string }> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.file_path) throw new NotFoundError('Social card file not found');

  const { data, error } = await adminClient()
    .storage.from(BUCKET)
    .createSignedUrl(current.file_path, DOWNLOAD_EXPIRY_SEC);
  if (error || !data?.signedUrl) throw new InternalError('Could not open the file');

  await logDataAccess(correlationId, doctorId, 'social_card_file', id);
  return { downloadUrl: data.signedUrl };
}

function isCarouselPhoto(filePath: string): boolean {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(filePath));
}

async function removeStoredFrames(words: SocialCardWords | null | undefined): Promise<void> {
  for (const frame of readFrameStore(words)) {
    try {
      await removeObject(frame.path);
    } catch {
      // The card is going away. The next purge can retry the object.
    }
  }
}

async function saveFrames(
  current: SocialCardRow,
  filePath: string | null,
  frames: StoredFrame[],
  fileId: string | null,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const patch: Record<string, unknown> = {
    words: withPictures(current.words, frames, fileId),
  };
  if (filePath) patch.file_path = filePath;
  const { data, error } = await adminClient()
    .from('social_cards')
    .update(patch)
    .eq('id', current.id)
    .eq('doctor_id', doctorId)
    .select('*')
    .maybeSingle();
  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Social card not found');
  await logDataModification(correlationId, doctorId, 'update', RESOURCE, current.id, ['file_path']);
  return toCard(data as SocialCardRow);
}

export async function addSocialCardFrame(
  id: string,
  filePath: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.file_path) throw new ValidationError('Add the file');
  if (!isCarouselPhoto(filePath)) throw new ValidationError('Use a JPEG, PNG, or WebP');
  const existing = readFrameStore(current.words);
  if (existing.length + 1 >= FRAME_CAP) {
    throw new ValidationError(
      current.format === 'story' ? 'A story holds ten pictures' : 'A post holds ten pictures'
    );
  }
  const fileId = readFileId(current.words) ?? crypto.randomUUID();
  assertObjectKey(filePath, doctorId, id);
  await assertObjectExists(filePath);
  return saveFrames(
    current,
    null,
    [...existing, { id: crypto.randomUUID(), path: filePath }],
    fileId,
    correlationId,
    doctorId
  );
}

export async function removeSocialCardFrame(
  id: string,
  frameId: string,
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  const existing = readFrameStore(current.words);
  const row = existing.find((frame) => frame.id === frameId);
  if (!row) throw new NotFoundError('Social card file not found');
  const card = await saveFrames(
    current,
    null,
    existing.filter((frame) => frame.id !== frameId),
    readFileId(current.words),
    correlationId,
    doctorId
  );
  await removeObject(row.path);
  return card;
}

export async function orderSocialCardFrames(
  id: string,
  ids: string[],
  correlationId: string,
  doctorId: string
): Promise<SocialCard> {
  const current = await loadOwned(id, doctorId, correlationId);
  if (!current.file_path) throw new ValidationError('Add the file');
  const existing = readFrameStore(current.words);
  const fileId = readFileId(current.words) ?? crypto.randomUUID();
  const pictures = [{ id: fileId, path: current.file_path }, ...existing];
  const known = new Map(pictures.map((picture) => [picture.id, picture.path]));
  const canonical = ids.map((slot) => (slot === 'piece' ? fileId : slot));
  const same =
    canonical.length === pictures.length &&
    new Set(canonical).size === canonical.length &&
    canonical.every((slot) => known.has(slot));
  if (!same) throw new ValidationError('Keep the pictures on this post');
  const ordered = canonical.map((slot) => ({ id: slot, path: known.get(slot) ?? '' }));
  if (ordered.some((picture) => !picture.path)) throw new ValidationError('Keep the pictures on this post');
  const first = ordered[0];
  if (!first) throw new ValidationError('Keep the pictures on this post');
  return saveFrames(current, first.path, ordered.slice(1), first.id, correlationId, doctorId);
}

export async function getSocialCardFrameUrl(
  id: string,
  frameId: string,
  correlationId: string,
  doctorId: string
): Promise<{ downloadUrl: string }> {
  const current = await loadOwned(id, doctorId, correlationId);
  const row = readFrameStore(current.words).find((frame) => frame.id === frameId);
  if (!row) throw new NotFoundError('Social card file not found');
  const signed = await adminClient().storage.from(BUCKET).createSignedUrl(row.path, DOWNLOAD_EXPIRY_SEC);
  if (signed.error || !signed.data?.signedUrl) throw new InternalError('Could not open the file');
  await logDataAccess(correlationId, doctorId, 'social_card_frame', frameId);
  return { downloadUrl: signed.data.signedUrl };
}
