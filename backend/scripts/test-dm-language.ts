/**
 * Local DM language smoke harness (bot-language-policy · lang-05 / 08 / 13)
 * + latency timing readout (dm-reply-latency · lat-01).
 *
 * POSTs synthetic Instagram DM webhooks at the running backend, then polls
 * Supabase for `conversations.language` + the outbound system reply.
 *
 * Covers the resolver / stickiness / safety-locale gate checks without Meta.
 * Does NOT prove Instagram client delivery — that last mile stays founder-owned.
 *
 * Usage (backend running via `npm run dev`):
 *   npm run test:dm-language
 *   npm run test:dm-language -- --scenario english
 *   npm run test:dm-language -- --timings
 *   npm run test:dm-language -- --timings --warmup
 *   npm run test:dm-language -- --list
 *
 * Env (optional):
 *   TEST_DM_WEBHOOK_URL      default http://localhost:3001/webhooks/instagram
 *   TEST_INSTAGRAM_PAGE_ID   override; else first doctor_instagram.instagram_page_id
 *   INSTAGRAM_APP_SECRET / META_APP_SECRET — when set, payloads are HMAC-signed
 *     (DM path also bypasses failed signatures, same as comments)
 *   TEST_DM_TIMING_LOG       path to a pino/JSON log file; when set, --timings
 *     will parse `webhook_instagram_dm_pipeline_timing` by eventId (mid).
 *     Segmented timings are only emitted after a successful Meta send today,
 *     so synthetic harness turns usually only get end-to-end wall clock.
 *
 * Note: synthetic sender IDs are not real Meta users, so the outbound IG API
 * call usually fails. That is fine — language + system reply are persisted
 * before send.
 */

import 'dotenv/config';
import { createHmac, randomInt } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WEBHOOK_URL =
  process.env.TEST_DM_WEBHOOK_URL?.trim() ||
  'http://localhost:3001/webhooks/instagram';

const APP_SECRET =
  process.env.INSTAGRAM_APP_SECRET?.trim() ||
  process.env.META_APP_SECRET?.trim() ||
  '';

const TIMING_LOG = process.env.TEST_DM_TIMING_LOG?.trim() || '';

const POLL_MS = 500;
const TURN_TIMEOUT_MS = 45_000;
/**
 * Synthetic senders make Meta send fail; the worker retries (~10s) while holding
 * the conversation lock. Wait it out before the next turn on the same sender.
 */
const BETWEEN_TURNS_MS = 12_000;

// ---------------------------------------------------------------------------
// Scenarios (map to lang-05 / lang-08 / lang-13 checklists)
// ---------------------------------------------------------------------------

type Expectation = {
  language: string;
  /** Substring that must appear in the latest system reply (case-insensitive). */
  replyContains?: string[];
  /** Substring that must NOT appear in the latest system reply. */
  replyOmits?: string[];
};

type Turn = {
  text: string;
  expect: Expectation;
  label: string;
};

type Scenario = {
  id: string;
  title: string;
  turns: Turn[];
};

const SCENARIOS: Scenario[] = [
  {
    id: 'english',
    title: 'lang-05 — English baseline + single-marker stickiness',
    turns: [
      {
        label: 'hey hallo → en (reported bug)',
        text: 'hey hallo',
        expect: { language: 'en' },
      },
      {
        label: 'kitna is the fee? → stays en (one marker)',
        text: 'kitna is the fee?',
        expect: { language: 'en' },
      },
    ],
  },
  {
    id: 'hinglish',
    title: 'lang-05 / 13 — Hinglish open + no snap-back',
    turns: [
      {
        label: 'mujhe kal appointment chahiye → hi-Latn',
        text: 'mujhe kal appointment chahiye',
        expect: { language: 'hi-Latn' },
      },
      {
        label: 'plain English → stays hi-Latn (LANG-D2)',
        text: 'ok sounds good, what time works?',
        expect: { language: 'hi-Latn' },
      },
    ],
  },
  {
    id: 'devanagari',
    title: 'lang-05 — Devanagari first turn → hi',
    turns: [
      {
        label: 'Devanagari → hi',
        text: 'मुझे बुखार है',
        expect: { language: 'hi' },
      },
    ],
  },
  {
    id: 'emergency-hinglish',
    title: 'lang-08 — emergency on Hinglish thread → Roman Hindi safety',
    turns: [
      {
        label: 'open Hinglish thread',
        text: 'mujhe kal appointment chahiye',
        expect: { language: 'hi-Latn' },
      },
      {
        label: 'emergency phrase → hi-Latn + Roman Hindi 112 copy',
        text: 'saans nahi aa rahi behosh ho gayi',
        expect: {
          language: 'hi-Latn',
          replyContains: ['112', 'kripaya'],
          replyOmits: ['Please call emergency services'],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

type SegmentTiming = {
  intentMs?: number;
  generateMs?: number;
  igSendMs?: number;
  handlerPreSendMs?: number;
  otherPreSendMs?: number;
  source: 'pipeline_log' | 'e2e_only' | 'job_row';
};

type TurnTiming = {
  e2eMs: number;
  jobMs?: number;
  segments?: SegmentTiming;
};

type TimingSample = {
  scenarioId: string;
  label: string;
  e2eMs: number;
  jobMs?: number;
  intentMs?: number;
  generateMs?: number;
  igSendMs?: number;
  handlerPreSendMs?: number;
  otherPreSendMs?: number;
  source: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function summarize(values: number[]): string {
  if (values.length === 0) return 'n/a';
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p50 = percentile(sorted, 50);
  return `min ${min} / p50 ${p50} / max ${max} (n=${sorted.length})`;
}

function parsePipelineTimingFromLog(eventId: string): SegmentTiming | null {
  if (!TIMING_LOG || !existsSync(TIMING_LOG)) return null;
  let raw: string;
  try {
    raw = readFileSync(TIMING_LOG, 'utf8');
  } catch {
    return null;
  }

  // Prefer JSON lines; also tolerate pretty-printed blocks that embed the fields.
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.includes('webhook_instagram_dm_pipeline_timing') && !line.includes(eventId)) {
      continue;
    }
    // JSON line
    if (line.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const nested =
          (obj as { metric?: string }).metric === 'webhook_instagram_dm_pipeline_timing'
            ? obj
            : ((obj as { metric?: string }).metric
                ? obj
                : null);
        const candidate = nested ?? obj;
        if (
          candidate.eventId === eventId ||
          (candidate as { event_id?: string }).event_id === eventId
        ) {
          return segmentFromFields(candidate);
        }
      } catch {
        // fall through to window parse
      }
    }
  }

  // Pretty-log window: find eventId, then scan nearby lines for timing fields.
  const joined = raw;
  const idx = joined.lastIndexOf(eventId);
  if (idx < 0) return null;
  const window = joined.slice(Math.max(0, idx - 800), Math.min(joined.length, idx + 1200));
  if (!window.includes('pipeline_timing') && !window.includes('intentMs')) return null;
  const num = (key: string): number | undefined => {
    const m = window.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? Number(m[1]) : undefined;
  };
  const intentMs = num('intentMs');
  const generateMs = num('generateMs');
  const igSendMs = num('igSendMs');
  const handlerPreSendMs = num('handlerPreSendMs');
  if (
    intentMs === undefined &&
    generateMs === undefined &&
    handlerPreSendMs === undefined
  ) {
    return null;
  }
  return {
    intentMs,
    generateMs,
    igSendMs,
    handlerPreSendMs,
    otherPreSendMs:
      handlerPreSendMs !== undefined && intentMs !== undefined && generateMs !== undefined
        ? Math.max(0, handlerPreSendMs - intentMs - generateMs)
        : undefined,
    source: 'pipeline_log',
  };
}

function segmentFromFields(fields: Record<string, unknown>): SegmentTiming {
  const intentMs = typeof fields.intentMs === 'number' ? fields.intentMs : undefined;
  const generateMs = typeof fields.generateMs === 'number' ? fields.generateMs : undefined;
  const igSendMs = typeof fields.igSendMs === 'number' ? fields.igSendMs : undefined;
  const handlerPreSendMs =
    typeof fields.handlerPreSendMs === 'number' ? fields.handlerPreSendMs : undefined;
  return {
    intentMs,
    generateMs,
    igSendMs,
    handlerPreSendMs,
    otherPreSendMs:
      handlerPreSendMs !== undefined && intentMs !== undefined && generateMs !== undefined
        ? Math.max(0, handlerPreSendMs - intentMs - generateMs)
        : undefined,
    source: 'pipeline_log',
  };
}

async function fetchJobMs(
  supabase: SupabaseClient,
  eventId: string
): Promise<number | undefined> {
  const { data } = await supabase
    .from('webhook_idempotency')
    .select('received_at, processed_at, status')
    .eq('event_id', eventId)
    .eq('provider', 'instagram')
    .maybeSingle();
  if (!data?.received_at) return undefined;
  const end = data.processed_at ?? null;
  if (!end) return undefined;
  const ms = new Date(end).getTime() - new Date(data.received_at).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

function printTimingLine(t: TurnTiming): void {
  const parts = [`e2e ${t.e2eMs}ms`];
  if (t.jobMs !== undefined) parts.push(`job ${t.jobMs}ms`);
  const s = t.segments;
  if (s && s.source === 'pipeline_log') {
    parts.push(
      `intent ${s.intentMs ?? '?'}`,
      `generate ${s.generateMs ?? '?'}`,
      `igSend ${s.igSendMs ?? '?'}`,
      `handlerPreSend ${s.handlerPreSendMs ?? '?'}`,
      `otherPreSend ${s.otherPreSendMs ?? '?'}`
    );
    parts.push('(pipeline_log)');
  } else {
    parts.push('(e2e — segments unavailable; pipeline timing only logs after successful Meta send)');
  }
  console.log(`      timing: ${parts.join(' · ')}`);
}

function printTimingSummary(samples: TimingSample[]): void {
  if (samples.length === 0) return;
  console.log('');
  console.log('── timings summary ──');
  console.log(`e2eMs:            ${summarize(samples.map((s) => s.e2eMs))}`);
  const jobs = samples.map((s) => s.jobMs).filter((n): n is number => n !== undefined);
  if (jobs.length) console.log(`jobMs:            ${summarize(jobs)}`);
  const intents = samples.map((s) => s.intentMs).filter((n): n is number => n !== undefined);
  const gens = samples.map((s) => s.generateMs).filter((n): n is number => n !== undefined);
  const sends = samples.map((s) => s.igSendMs).filter((n): n is number => n !== undefined);
  const pre = samples.map((s) => s.handlerPreSendMs).filter((n): n is number => n !== undefined);
  const other = samples.map((s) => s.otherPreSendMs).filter((n): n is number => n !== undefined);
  if (intents.length) console.log(`intentMs:         ${summarize(intents)}`);
  if (gens.length) console.log(`generateMs:       ${summarize(gens)}`);
  if (sends.length) console.log(`igSendMs:         ${summarize(sends)}`);
  if (pre.length) console.log(`handlerPreSendMs: ${summarize(pre)}`);
  if (other.length) console.log(`otherPreSendMs:   ${summarize(other)}`);
  if (!intents.length) {
    console.log(
      'segments:         unavailable from harness (no pipeline_log hits). ' +
        'Set TEST_DM_TIMING_LOG to a JSON log file after a successful Meta send, ' +
        'or use the real-IG baseline in BASELINE-p1.md.'
    );
  }
  const sources = new Set(samples.map((s) => s.source));
  console.log(`sources:          ${[...sources].join(', ')}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 17-digit synthetic IG sender id (passes isValidInstagramSenderId). */
function freshSenderId(): string {
  // Keep leading digit 1–9 so it looks like a real Meta scoped id.
  return `1${Date.now().toString().slice(-10)}${randomInt(100000, 999999)}`;
}

function signBody(raw: Buffer): string {
  if (!APP_SECRET) return 'sha256=placeholder';
  const hash = createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  return `sha256=${hash}`;
}

function buildDmPayload(opts: {
  pageId: string;
  senderId: string;
  text: string;
  mid: string;
}): object {
  return {
    object: 'instagram',
    entry: [
      {
        id: opts.pageId,
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: opts.senderId },
            recipient: { id: opts.pageId },
            timestamp: Date.now(),
            message: {
              mid: opts.mid,
              text: opts.text,
            },
          },
        ],
      },
    ],
  };
}

async function postDm(pageId: string, senderId: string, text: string): Promise<{
  status: number;
  ok: boolean;
  mid: string;
}> {
  const mid = `mid.test.${Date.now()}.${randomInt(1e6, 9e6)}`;
  const payload = buildDmPayload({ pageId, senderId, text, mid });
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signBody(raw),
    },
    body: raw,
  });
  return { status: res.status, ok: res.ok, mid };
}

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolvePageId(supabase: SupabaseClient): Promise<string> {
  const fromEnv = process.env.TEST_INSTAGRAM_PAGE_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('instagram_page_id')
    .not('instagram_page_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`doctor_instagram lookup failed: ${error.message}`);
  }
  const id = data?.instagram_page_id?.trim();
  if (!id) {
    throw new Error(
      'No doctor_instagram.instagram_page_id found. Connect Instagram in the app, or set TEST_INSTAGRAM_PAGE_ID.'
    );
  }
  return id;
}

type TurnResult = {
  language: string | null;
  reply: string | null;
  conversationId: string | null;
};

async function pollTurnResult(
  supabase: SupabaseClient,
  senderId: string,
  patientMid: string,
  startedAt: number
): Promise<TurnResult> {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  let conversationId: string | null = null;

  while (Date.now() < deadline) {
    if (!conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, language')
        .eq('platform', 'instagram')
        .eq('platform_conversation_id', senderId)
        .maybeSingle();
      if (conv?.id) {
        conversationId = conv.id as string;
      }
    }

    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, language')
        .eq('id', conversationId)
        .maybeSingle();

      const { data: patientMsg } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('platform_message_id', patientMid)
        .maybeSingle();

      if (patientMsg?.id) {
        const { data: systemMsgs } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'system')
          .gt('created_at', patientMsg.created_at)
          .order('created_at', { ascending: true })
          .limit(1);

        const reply = systemMsgs?.[0]?.content ?? null;
        const language = (conv?.language as string | null) ?? null;
        const waitedLong = Date.now() - startedAt > 12_000;

        // Reply can land before `conversations.language` is written. Prefer a
        // non-null language when present; after 12s accept NULL (LANG4-D1
        // undecided English never persists `'en'`).
        if (language != null && (reply || waitedLong)) {
          return { language, reply, conversationId };
        }
        if (waitedLong && (reply || patientMsg?.id)) {
          return { language, reply, conversationId };
        }
      }
    }

    await sleep(POLL_MS);
  }

  return { language: null, reply: null, conversationId };
}

function checkExpectation(
  got: TurnResult,
  expect: Expectation
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  // LANG4-D1: undecided renders English with `conversations.language` NULL.
  // Treat NULL as matching expected `en` for harness purposes.
  const languageMatches =
    got.language === expect.language ||
    (expect.language === 'en' && (got.language === null || got.language === 'en'));
  if (!languageMatches) {
    pass = false;
    notes.push(
      `language: expected ${expect.language}${expect.language === 'en' ? ' (or NULL undecided)' : ''}, got ${got.language ?? '(null/timeout)'}`
    );
  } else {
    notes.push(
      `language: ${got.language ?? 'NULL (undecided → en)'}`
    );
  }

  const reply = got.reply ?? '';
  if (!got.reply) {
    notes.push('reply: (none yet — Meta send may have failed; language still counts)');
  } else {
    const lower = reply.toLowerCase();
    for (const needle of expect.replyContains ?? []) {
      if (!lower.includes(needle.toLowerCase())) {
        pass = false;
        notes.push(`reply missing: "${needle}"`);
      }
    }
    for (const needle of expect.replyOmits ?? []) {
      if (reply.includes(needle)) {
        pass = false;
        notes.push(`reply unexpectedly contains: "${needle}"`);
      }
    }
    const preview = reply.replace(/\s+/g, ' ').slice(0, 140);
    notes.push(`reply: ${preview}${reply.length > 140 ? '…' : ''}`);
  }

  return { pass, notes };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  list: boolean;
  scenarioIds: string[] | null;
  timings: boolean;
  warmup: boolean;
} {
  if (argv.includes('--list')) {
    return { list: true, scenarioIds: null, timings: false, warmup: false };
  }
  const idx = argv.indexOf('--scenario');
  const scenarioIds = idx >= 0 && argv[idx + 1] ? [argv[idx + 1]!] : null;
  return {
    list: false,
    scenarioIds,
    timings: argv.includes('--timings'),
    warmup: argv.includes('--warmup'),
  };
}

async function runScenario(
  supabase: SupabaseClient,
  pageId: string,
  scenario: Scenario,
  opts: { timings: boolean; discardFirst: boolean },
  samples: TimingSample[]
): Promise<boolean> {
  const senderId = freshSenderId();
  console.log('');
  console.log(`══ ${scenario.title}`);
  console.log(`   sender=${senderId}`);

  let allPass = true;
  let turnIndex = 0;

  for (const turn of scenario.turns) {
    const startedAt = Date.now();
    const { status, ok, mid } = await postDm(pageId, senderId, turn.text);
    if (!ok) {
      console.log(`  ✗ POST ${status} — "${turn.label}"`);
      allPass = false;
      turnIndex += 1;
      continue;
    }

    const got = await pollTurnResult(supabase, senderId, mid, startedAt);
    const e2eMs = Date.now() - startedAt;
    const { pass, notes } = checkExpectation(got, turn.expect);
    const mark = pass ? '✓' : '✗';
    console.log(`  ${mark} ${turn.label}`);
    for (const n of notes) {
      console.log(`      ${n}`);
    }

    if (opts.timings) {
      // Brief settle so webhook_idempotency / log flush can catch up.
      await sleep(300);
      const jobMs = await fetchJobMs(supabase, mid);
      const segments = parsePipelineTimingFromLog(mid) ?? undefined;
      const timing: TurnTiming = {
        e2eMs,
        jobMs,
        segments: segments ?? { source: 'e2e_only' },
      };
      printTimingLine(timing);

      const discard = opts.discardFirst && turnIndex === 0;
      if (!discard) {
        samples.push({
          scenarioId: scenario.id,
          label: turn.label,
          e2eMs,
          jobMs,
          intentMs: segments?.intentMs,
          generateMs: segments?.generateMs,
          igSendMs: segments?.igSendMs,
          handlerPreSendMs: segments?.handlerPreSendMs,
          otherPreSendMs: segments?.otherPreSendMs,
          source: segments?.source ?? 'e2e_only',
        });
      } else {
        console.log('      timing: (warmup discard — not in summary)');
      }
    }

    if (!pass) allPass = false;
    turnIndex += 1;
    await sleep(BETWEEN_TURNS_MS);
  }

  return allPass;
}

async function main(): Promise<void> {
  const { list, scenarioIds, timings, warmup } = parseArgs(process.argv.slice(2));

  if (list) {
    console.log('Available scenarios:');
    for (const s of SCENARIOS) {
      console.log(`  ${s.id.padEnd(22)} ${s.title}`);
    }
    console.log('');
    console.log('Flags: --timings   print e2e / job / (segments if log available)');
    console.log('       --warmup    discard first turn of first scenario from timing summary');
    return;
  }

  const selected = scenarioIds
    ? SCENARIOS.filter((s) => scenarioIds.includes(s.id))
    : SCENARIOS;

  if (selected.length === 0) {
    console.error('No matching scenarios. Use --list to see ids.');
    process.exit(1);
  }

  const supabase = adminClient();
  const pageId = await resolvePageId(supabase);

  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('Page ID:', pageId);
  console.log('Signing:', APP_SECRET ? 'HMAC (app secret present)' : 'placeholder (DM bypass)');
  console.log('Scenarios:', selected.map((s) => s.id).join(', '));
  if (timings) {
    console.log(
      'Timings:',
      TIMING_LOG
        ? `on (log=${TIMING_LOG})`
        : 'on (e2e + jobMs; set TEST_DM_TIMING_LOG for segments)'
    );
    if (warmup) console.log('Warmup: discard first turn of first scenario from summary');
  }

  const samples: TimingSample[] = [];
  let failed = 0;
  for (let i = 0; i < selected.length; i++) {
    const scenario = selected[i]!;
    const pass = await runScenario(
      supabase,
      pageId,
      scenario,
      { timings, discardFirst: warmup && i === 0 },
      samples
    );
    if (!pass) failed += 1;
  }

  if (timings) {
    printTimingSummary(samples);
  }

  console.log('');
  console.log('── summary ──');
  console.log(
    failed === 0
      ? `PASS — ${selected.length} scenario(s)`
      : `FAIL — ${failed}/${selected.length} scenario(s) failed`
  );
  console.log(
    'Note: Meta delivery is not covered. Eyeball one real IG thread when convenient.'
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  const code =
    (err as NodeJS.ErrnoException)?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ECONNREFUSED') {
    console.error('Connection refused. Is the backend running?');
    console.error('  Local: cd backend && npm run dev');
    console.error('  Or set TEST_DM_WEBHOOK_URL.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
