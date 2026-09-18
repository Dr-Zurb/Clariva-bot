/**
 * Observe-only DM pass: send dummy clinic threads, write back what the bot said.
 *
 * Process: docs/Work/process/IG-DM-OBSERVE-ANALYZE-FIX.md (test → analyze → fix).
 * Uses the same webhook → worker → DB path as `test:dm-conversation`.
 * Does not assert copy. Meta Graph delivery is not proven (synthetic sender).
 *
 * Usage (backend running via `npm run dev`):
 *   npm run test:dm-observe
 *   npm run test:dm-observe -- --conversation tape-hello-book
 *
 * Writes:
 *   docs/Work/capture/notes/2026-09-17-ig-dm-observe.md
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  SIGNING_MODE,
  WEBHOOK_URL,
  adminClient,
  freshSenderId,
  observeTurn,
  postTurn,
  resolvePageId,
  waitBeforeNextTurn,
  type Turn,
} from './lib/dm-harness';
import {
  OBSERVE_CONVERSATIONS,
  type ObserveConversation,
} from './fixtures/dm-observe-conversations';

const DEFAULT_OUT_PATH = resolve(
  __dirname,
  '../../docs/Work/capture/notes/2026-09-17-ig-dm-observe.md'
);

interface RecordedTurn {
  label: string;
  patient: string;
  bot: string;
  intent: string | null;
  step: string | null;
  language: string | null;
  timedOut: boolean;
  postFailed?: string;
}

interface RecordedConversation {
  id: string;
  title: string;
  why: string;
  senderId: string;
  turns: RecordedTurn[];
}

function parseArgs(argv: string[]): { ids: string[]; outPath: string } {
  const ids: string[] = [];
  let outPath = DEFAULT_OUT_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--conversation' && argv[i + 1]) ids.push(argv[++i]!);
    else if (argv[i] === '--out' && argv[i + 1]) {
      outPath = resolve(__dirname, '../..', argv[++i]!);
    }
  }
  return { ids, outPath };
}

function toHarnessTurn(text: string, label: string): Turn {
  return { label, text, expect: {} };
}

function renderMarkdown(pageId: string, conversations: RecordedConversation[]): string {
  const lines: string[] = [
    '# IG DM observe',
    '',
    'Observe-only first check. Dummy clinic threads through the live webhook → worker → DB.',
    'Meta Graph send is **not** proven (synthetic sender). No pass/fail. Fixes are the next sitting.',
    '',
    `- Webhook: \`${WEBHOOK_URL}\``,
    `- Page: \`${pageId}\``,
    `- Signing: ${SIGNING_MODE}`,
    `- Recorded: ${new Date().toISOString()}`,
    '',
    'Source conversations: `backend/scripts/fixtures/dm-observe-conversations.ts`.',
    'Re-run: `cd backend && npm run test:dm-observe`.',
    '',
  ];

  for (const conv of conversations) {
    lines.push(`## ${conv.id} — ${conv.title}`);
    lines.push('');
    lines.push(conv.why);
    lines.push('');
    lines.push(`Sender \`${conv.senderId}\`.`);
    lines.push('');
    for (const turn of conv.turns) {
      lines.push(`### ${turn.label}`);
      lines.push('');
      lines.push(`**Patient:** ${turn.patient}`);
      lines.push('');
      if (turn.postFailed) {
        lines.push(`**Bot:** _(webhook POST failed: ${turn.postFailed})_`);
      } else if (turn.timedOut) {
        lines.push('**Bot:** _(no reply before timeout)_');
      } else if (!turn.bot.trim()) {
        lines.push('**Bot:** _(empty / silent)_');
      } else {
        lines.push('**Bot:**');
        lines.push('');
        lines.push('```');
        lines.push(turn.bot);
        lines.push('```');
      }
      lines.push('');
      lines.push(
        `_intent=${turn.intent ?? '—'} · step=${turn.step ?? '—'} · language=${turn.language ?? '—'}_`
      );
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function writeOut(
  pageId: string,
  conversations: RecordedConversation[],
  outPath: string
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderMarkdown(pageId, conversations), 'utf8');
}

async function runConversation(
  supabase: ReturnType<typeof adminClient>,
  pageId: string,
  conversation: ObserveConversation
): Promise<RecordedConversation> {
  const senderId = freshSenderId();
  const recorded: RecordedConversation = {
    id: conversation.id,
    title: conversation.title,
    why: conversation.why,
    senderId,
    turns: [],
  };

  console.log('');
  console.log(`══ ${conversation.id} — ${conversation.title}`);
  console.log(`   sender=${senderId}`);

  for (const turn of conversation.turns) {
    const posted = await postTurn(pageId, senderId, toHarnessTurn(turn.text, turn.label));
    if (!posted.ok) {
      console.log(`  ✗ ${turn.label} POST ${posted.status}`);
      recorded.turns.push({
        label: turn.label,
        patient: turn.text,
        bot: '',
        intent: null,
        step: null,
        language: null,
        timedOut: false,
        postFailed: String(posted.status),
      });
      break;
    }

    const observed = await observeTurn(supabase, senderId, posted.mid, {
      expectNoReply: false,
    });

    const bot = observed.reply ?? '';
    console.log(`  ${observed.timedOut ? '…' : '✓'} ${turn.label}`);
    console.log(`      ${bot ? bot.replace(/\s+/g, ' ').slice(0, 140) : '(no reply)'}`);
    if (/automated scheduling is paused|automated scheduling abhi pause/i.test(bot)) {
      console.log('      ⚠ receptionist pause is ON — Meta tape will not show FAQ or /book');
    }

    recorded.turns.push({
      label: turn.label,
      patient: turn.text,
      bot,
      intent: observed.lastIntent,
      step: observed.step,
      language: observed.language,
      timedOut: observed.timedOut,
    });

    await waitBeforeNextTurn(observed);
  }

  return recorded;
}

async function main(): Promise<void> {
  const { ids, outPath } = parseArgs(process.argv.slice(2));
  const selected =
    ids.length > 0
      ? OBSERVE_CONVERSATIONS.filter((c) => ids.includes(c.id))
      : OBSERVE_CONVERSATIONS;

  if (selected.length === 0) {
    console.error('No matching conversations. Ids:');
    for (const c of OBSERVE_CONVERSATIONS) console.error(`  ${c.id}`);
    process.exit(1);
  }

  const supabase = adminClient();
  const pageId = await resolvePageId(supabase);
  const { data: igRow, error: igError } = await supabase
    .from('doctor_instagram')
    .select('doctor_id')
    .eq('instagram_page_id', pageId)
    .maybeSingle();
  if (igError) throw new Error(`doctor_instagram lookup failed: ${igError.message}`);
  const doctorId = (igRow as { doctor_id?: string } | null)?.doctor_id;
  if (doctorId) {
    const { data: settings } = await supabase
      .from('doctor_settings')
      .select('instagram_receptionist_paused')
      .eq('doctor_id', doctorId)
      .maybeSingle();
    if ((settings as { instagram_receptionist_paused?: boolean } | null)?.instagram_receptionist_paused === true) {
      console.error('Receptionist pause is ON for this clinic. Uncheck it, Save, then re-run.');
      console.error('If Save does not stick, the checkbox may look off while the database is still paused.');
      process.exit(1);
    }
  }

  const recorded: RecordedConversation[] = [];

  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('Page ID:', pageId);
  console.log('Signing:', SIGNING_MODE);
  console.log('Conversations:', selected.length);
  console.log('Writing:', outPath);

  writeOut(pageId, recorded, outPath);

  for (const conversation of selected) {
    recorded.push(await runConversation(supabase, pageId, conversation));
    writeOut(pageId, recorded, outPath);
  }

  console.log('');
  console.log(`Wrote ${recorded.length} conversation(s) to ${outPath}`);
}

main().catch((err: unknown) => {
  const code =
    (err as NodeJS.ErrnoException)?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ECONNREFUSED') {
    console.error('Connection refused. Is the backend running?');
    console.error('  Local: cd backend && npm run dev');
  } else {
    console.error(err);
  }
  process.exit(1);
});
