/**
 * Shared primitives for scripted DM harnesses.
 *
 * Drives the real webhook → worker → DB pipeline with synthetic Instagram DMs
 * and reads back what the bot actually did. Assertions come from three places:
 *
 *   - `conversations.metadata`  → `step`, `lastIntent`   (authoritative, always written)
 *   - `conversations.language`  → resolved thread locale (authoritative)
 *   - `messages`                → the system reply text  (authoritative)
 *   - routing log               → `branch`               (best-effort, needs TEST_DM_LOG)
 *
 * `branch` is log-only because the DM handler emits it as an observability
 * event and never persists it. Scenarios that assert a branch degrade to a
 * warning (not a failure) when no log file is configured.
 *
 * Does NOT prove Meta delivery — synthetic sender ids fail the outbound Graph
 * call. State and reply are persisted before the send, so everything asserted
 * here is still real.
 */

import { createHmac, randomInt } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const WEBHOOK_URL =
  process.env.TEST_DM_WEBHOOK_URL?.trim() || 'http://localhost:3001/webhooks/instagram';

const APP_SECRET =
  process.env.INSTAGRAM_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || '';

/** Pino/JSON log file to scrape `instagram_dm_routing` from, for branch assertions. */
export const ROUTING_LOG = process.env.TEST_DM_LOG?.trim() || '';

const POLL_MS = 400;

/**
 * Per-turn timeout. Must exceed the webhook queue's first retry backoff (60s):
 * if a turn collides with the previous job's conversation lock it is requeued,
 * and the reply only lands after that backoff. A shorter timeout reports the
 * collision as a spurious failure instead of waiting it out.
 */
const TURN_TIMEOUT_MS = Number(process.env.TEST_DM_TURN_TIMEOUT_MS ?? 90_000);

/**
 * Minimum spacing between turns on one sender, measured from when the previous
 * reply row appeared.
 *
 * The reply is persisted *before* the outbound Meta call, and that call fails
 * slowly for synthetic senders (Graph host fallback, then a throw that requeues
 * the job). The per-conversation lock is only released when the job finishes, so
 * a turn fired too early is rejected and requeued with a 60s backoff — which
 * reads as a timeout. 12s is the empirically safe gap; shorter values fail on
 * turn 2 of every scenario.
 */
const MIN_TURN_GAP_MS = Number(process.env.TEST_DM_TURN_GAP_MS ?? 12_000);

export const SIGNING_MODE = APP_SECRET ? 'HMAC (app secret present)' : 'placeholder (DM bypass)';

// ---------------------------------------------------------------------------
// Scenario shape
// ---------------------------------------------------------------------------

/** A value that may be asserted as one of several acceptable options. */
export type OneOf = string | string[];

export interface TurnExpect {
  /** Routing branch from `instagram_dm_routing`. Needs TEST_DM_LOG; warns otherwise. */
  branch?: OneOf;
  /** `conversations.metadata.step` after the turn. Use 'responded' for idle. */
  step?: OneOf;
  /** `conversations.metadata.lastIntent` after the turn. */
  intent?: OneOf;
  /** `conversations.language` after the turn. */
  language?: string;
  /** Case-insensitive substrings that must all appear in the reply. */
  replyContains?: string[];
  /** Case-insensitive substrings that must not appear in the reply. */
  replyOmits?: string[];
  /** Regex (source string) the reply must match. */
  replyMatches?: string;
  /** Assert the bot stayed silent this turn (e.g. suppressed non-text ack). */
  noReply?: boolean;
}

/**
 * Non-text turns are deliberately not supported. The handler answers
 * attachments before the turn pipeline and returns without persisting either
 * the inbound message or the ack, so nothing about that path is observable
 * from the database. Checklist §9 stays a human-with-a-phone check.
 */
export interface Turn {
  label: string;
  text: string;
  expect: TurnExpect;
}

export interface Scenario {
  id: string;
  title: string;
  /** Free-form tags for `--tag` filtering, e.g. 'safety', 'booking', 'fees'. */
  tags: string[];
  /** Section in MANUAL_QA_CHECKLIST_DM_BOT.md this automates, e.g. '4.1'. */
  checklist?: string;
  /** Why this scenario might legitimately fail; printed on failure. */
  note?: string;
  turns: Turn[];
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 17-digit synthetic IG sender id (passes isValidInstagramSenderId). */
export function freshSenderId(): string {
  return `1${Date.now().toString().slice(-10)}${randomInt(100000, 999999)}`;
}

function signBody(raw: Buffer): string {
  if (!APP_SECRET) return 'sha256=placeholder';
  return `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
}

/** Transient webhook responses worth one retry before failing the turn. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isConnectionRefused(err: unknown): boolean {
  const code =
    (err as NodeJS.ErrnoException)?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === 'ECONNREFUSED';
}

export async function postTurn(
  pageId: string,
  senderId: string,
  turn: Turn
): Promise<{ ok: boolean; status: number; mid: string }> {
  try {
    const first = await postTurnOnce(pageId, senderId, turn);
    if (first.ok || !isTransientStatus(first.status)) return first;
  } catch (err) {
    // A dev-server restart (nodemon) mid-run refuses one connection; the
    // backend is usually back within a couple of seconds. Anything else is a
    // real failure and should surface immediately.
    if (!isConnectionRefused(err)) throw err;
    console.log('      … backend not accepting connections, retrying once');
  }

  await sleep(3_000);
  return postTurnOnce(pageId, senderId, turn);
}

async function postTurnOnce(
  pageId: string,
  senderId: string,
  turn: Turn
): Promise<{ ok: boolean; status: number; mid: string }> {
  const mid = `mid.test.${Date.now()}.${randomInt(1e6, 9e6)}`;
  const payload = {
    object: 'instagram',
    entry: [
      {
        id: pageId,
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: Date.now(),
            message: { mid, text: turn.text },
          },
        ],
      },
    ],
  };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signBody(raw),
    },
    body: raw,
  });
  return { ok: res.ok, status: res.status, mid };
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function resolvePageId(supabase: SupabaseClient): Promise<string> {
  const fromEnv = process.env.TEST_INSTAGRAM_PAGE_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('instagram_page_id')
    .not('instagram_page_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`doctor_instagram lookup failed: ${error.message}`);
  const id = (data as { instagram_page_id?: string } | null)?.instagram_page_id?.trim();
  if (!id) {
    throw new Error(
      'No doctor_instagram.instagram_page_id found. Connect Instagram, or set TEST_INSTAGRAM_PAGE_ID.'
    );
  }
  return id;
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

export interface ObservedTurn {
  conversationId: string | null;
  language: string | null;
  step: string | null;
  lastIntent: string | null;
  reply: string | null;
  replyAt: number | null;
  /** System replies that landed after this turn's patient message. >1 hints at a retry. */
  replyCount: number;
  timedOut: boolean;
}

const EMPTY_OBSERVATION: ObservedTurn = {
  conversationId: null,
  language: null,
  step: null,
  lastIntent: null,
  reply: null,
  replyAt: null,
  replyCount: 0,
  timedOut: true,
};

interface ConversationRow {
  language: string | null;
  metadata: unknown;
}

/**
 * Read the conversation once the turn's state write has landed.
 *
 * The reply message row is committed just before state + language, so reading
 * immediately after seeing the reply can catch a null language or a stale step.
 * Every processed turn resolves a language (English by default), so a null is a
 * read-after-write gap rather than a real value — retry briefly before accepting.
 */
async function readSettledConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationRow | null> {
  let last: ConversationRow | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await supabase
      .from('conversations')
      .select('language, metadata')
      .eq('id', conversationId)
      .maybeSingle();

    last = (data as ConversationRow | null) ?? null;
    if (last?.language) return last;
    await sleep(400);
  }

  return last;
}

async function findConversationId(
  supabase: SupabaseClient,
  senderId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('platform', 'instagram')
    .eq('platform_conversation_id', senderId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Poll until the turn is observable: the patient message is stored and either a
 * system reply followed it or `noReply` grace elapsed.
 */
export async function observeTurn(
  supabase: SupabaseClient,
  senderId: string,
  mid: string,
  opts: { expectNoReply: boolean }
): Promise<ObservedTurn> {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  /** How long silence must hold before we accept it as intentional. */
  const noReplyGraceUntil = Date.now() + 15_000;
  let conversationId: string | null = null;

  while (Date.now() < deadline) {
    conversationId ??= await findConversationId(supabase, senderId);

    if (conversationId) {
      const { data: patientMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('platform_message_id', mid)
        .maybeSingle();

      const patientAt = (patientMsg as { created_at?: string } | null)?.created_at;

      if (patientAt) {
        const { data: systemMsgs } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'system')
          .gt('created_at', patientAt)
          .order('created_at', { ascending: true });

        const rows = (systemMsgs ?? []) as { content: string; created_at: string }[];
        const settled = rows.length > 0 || (opts.expectNoReply && Date.now() > noReplyGraceUntil);

        if (settled) {
          const conv = await readSettledConversation(supabase, conversationId);
          const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
          const first = rows[0];

          return {
            conversationId,
            language: conv?.language ?? null,
            step: typeof meta.step === 'string' ? meta.step : null,
            lastIntent: typeof meta.lastIntent === 'string' ? meta.lastIntent : null,
            reply: first?.content ?? null,
            replyAt: first ? new Date(first.created_at).getTime() : null,
            replyCount: rows.length,
            timedOut: false,
          };
        }
      }
    }

    await sleep(POLL_MS);
  }

  return { ...EMPTY_OBSERVATION, conversationId };
}

/**
 * Space turns so the next one clears the per-sender reply throttle.
 * Measured from when the reply landed, so slow turns pay nothing extra.
 */
export async function waitBeforeNextTurn(observed: ObservedTurn): Promise<void> {
  const since = observed.replyAt ?? Date.now();
  const remaining = MIN_TURN_GAP_MS - (Date.now() - since);
  if (remaining > 0) await sleep(remaining);
}

// ---------------------------------------------------------------------------
// Routing log (branch)
// ---------------------------------------------------------------------------

export interface RoutingFields {
  branch?: string;
  intent?: string;
  stepAfter?: string;
}

/**
 * Scrape `instagram_dm_routing` for one event id. Handles both JSON lines and
 * pino pretty blocks, since local `npm run dev` prints the pretty form.
 */
const MARKER = 'instagram_dm_routing';

export function parseRoutingFromLog(eventId: string): RoutingFields | null {
  if (!ROUTING_LOG || !existsSync(ROUTING_LOG)) return null;

  let raw: string;
  try {
    raw = readFileSync(ROUTING_LOG, 'utf8');
  } catch {
    return null;
  }

  for (const line of raw.split('\n').reverse()) {
    if (!line.trim().startsWith('{') || !line.includes(eventId)) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.eventId !== eventId || typeof obj.branch !== 'string') continue;
      return {
        branch: obj.branch,
        intent: typeof obj.intent === 'string' ? obj.intent : undefined,
        stepAfter: typeof obj.state_step_after === 'string' ? obj.state_step_after : undefined,
      };
    } catch {
      // not a routing line; keep scanning
    }
  }

  // Pretty-printed fallback (local `npm run dev`). The event id also appears in
  // neighbouring blocks, so anchor on the routing block itself and only accept
  // one whose field list mentions this event.
  const BLOCK_CHARS = 900;
  for (let at = raw.lastIndexOf(MARKER); at >= 0; at = raw.lastIndexOf(MARKER, at - 1)) {
    const block = raw.slice(at, Math.min(raw.length, at + BLOCK_CHARS));
    if (!block.includes(eventId)) continue;

    const field = (key: string): string | undefined =>
      block.match(new RegExp(`\\b${key}:\\s*"([^"]+)"`))?.[1];

    const branch = field('branch');
    if (branch) {
      return { branch, intent: field('intent'), stepAfter: field('state_step_after') };
    }
  }

  return null;
}

/** How long to keep re-reading the log before giving up on a branch assertion. */
const ROUTING_LOG_WAIT_MS = Number(process.env.TEST_DM_LOG_WAIT_MS ?? 6_000);

/**
 * Routing lines land in the log slightly after the reply row appears, and some
 * log sinks (an IDE terminal capture, say) flush on their own schedule. Retry
 * briefly rather than reporting a branch as unverifiable.
 */
export async function awaitRoutingFromLog(
  eventId: string,
  branchExpected: boolean
): Promise<RoutingFields | null> {
  if (!ROUTING_LOG) return null;

  const immediate = parseRoutingFromLog(eventId);
  if (immediate || !branchExpected) return immediate;

  const deadline = Date.now() + ROUTING_LOG_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(500);
    const found = parseRoutingFromLog(eventId);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export interface CheckResult {
  pass: boolean;
  /** Lines describing what was observed. */
  notes: string[];
  /** Non-fatal problems (unassertable branch, possible retry contamination). */
  warnings: string[];
}

function matchesOneOf(actual: string | null | undefined, expected: OneOf): boolean {
  const options = Array.isArray(expected) ? expected : [expected];
  return actual !== null && actual !== undefined && options.includes(actual);
}

function describe(expected: OneOf): string {
  return Array.isArray(expected) ? expected.join(' | ') : expected;
}

export function checkTurn(
  observed: ObservedTurn,
  routing: RoutingFields | null,
  expect: TurnExpect
): CheckResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  let pass = true;

  const fail = (msg: string): void => {
    pass = false;
    notes.push(`✗ ${msg}`);
  };

  if (observed.timedOut) {
    fail('turn timed out — no patient message or reply observed');
    return { pass, notes, warnings };
  }

  if (expect.noReply) {
    if (observed.reply) fail(`expected silence, got a reply: "${preview(observed.reply)}"`);
    else notes.push('reply: (silent, as expected)');
  } else if (!observed.reply) {
    fail('no system reply was stored');
  }

  if (expect.language !== undefined) {
    // LANG4-D1: undecided English leaves `conversations.language` NULL.
    const languageMatches =
      observed.language === expect.language ||
      (expect.language === 'en' &&
        (observed.language === null || observed.language === 'en'));
    if (languageMatches) {
      notes.push(
        `language: ${observed.language ?? 'NULL (undecided → en)'}`
      );
    } else {
      fail(
        `language: expected ${expect.language}${expect.language === 'en' ? ' (or NULL undecided)' : ''}, got ${observed.language ?? 'null'}`
      );
    }
  }

  if (expect.step !== undefined) {
    if (matchesOneOf(observed.step, expect.step)) notes.push(`step: ${observed.step}`);
    else fail(`step: expected ${describe(expect.step)}, got ${observed.step ?? 'null'}`);
  }

  if (expect.intent !== undefined) {
    if (matchesOneOf(observed.lastIntent, expect.intent)) notes.push(`intent: ${observed.lastIntent}`);
    else fail(`intent: expected ${describe(expect.intent)}, got ${observed.lastIntent ?? 'null'}`);
  }

  if (expect.branch !== undefined) {
    if (!routing?.branch) {
      warnings.push(
        `branch ${describe(expect.branch)} not verified — run the backend as ` +
          '`npm run dev 2>&1 | tee /tmp/clariva-dev.log` and set TEST_DM_LOG to that path'
      );
    } else if (matchesOneOf(routing.branch, expect.branch)) {
      notes.push(`branch: ${routing.branch}`);
    } else {
      fail(`branch: expected ${describe(expect.branch)}, got ${routing.branch}`);
    }
  }

  if (routing?.branch === 'unknown') {
    fail('branch is "unknown" — a stage did not label its result');
  }

  const reply = observed.reply ?? '';
  const lower = reply.toLowerCase();

  for (const needle of expect.replyContains ?? []) {
    if (!lower.includes(needle.toLowerCase())) fail(`reply missing "${needle}"`);
  }
  for (const needle of expect.replyOmits ?? []) {
    if (lower.includes(needle.toLowerCase())) fail(`reply should not contain "${needle}"`);
  }
  if (expect.replyMatches && !new RegExp(expect.replyMatches, 'i').test(reply)) {
    fail(`reply does not match /${expect.replyMatches}/i`);
  }

  if (observed.replyCount > 1) {
    warnings.push(
      `${observed.replyCount} system replies after this turn — likely a webhook retry; ` +
        'later assertions in this scenario may be unreliable'
    );
  }

  if (reply) notes.push(`reply: ${preview(reply)}`);

  return { pass, notes, warnings };
}

export function preview(text: string, max = 150): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
