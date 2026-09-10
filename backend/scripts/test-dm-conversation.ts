/**
 * Scripted DM conversation harness.
 *
 * Drives multi-turn conversations through the real webhook → worker → DB
 * pipeline and asserts, per turn, on the routing branch, conversation step,
 * intent, resolved language, and reply copy. Automates the mechanical parts of
 * docs/Reference/product/receptionist-bot/MANUAL_QA_CHECKLIST_DM_BOT.md.
 *
 * Complements `test:dm-language` (language resolver only) — this one covers
 * routing and funnel behaviour. Neither proves Meta delivery; that last mile
 * stays a human with a phone.
 *
 * Usage (backend running via `npm run dev`):
 *   npm run test:dm-conversation
 *   npm run test:dm-conversation -- --list
 *   npm run test:dm-conversation -- --scenario safety-emergency-en
 *   npm run test:dm-conversation -- --tag safety --tag core
 *   npm run test:dm-conversation -- --bail
 *
 * Env (optional):
 *   TEST_DM_WEBHOOK_URL      default http://localhost:3001/webhooks/instagram
 *   TEST_INSTAGRAM_PAGE_ID   override; else first doctor_instagram.instagram_page_id
 *   TEST_DM_LOG              Log file to scrape `instagram_dm_routing` from. Required
 *                            for `branch` assertions; they warn (not fail) without it.
 *                            Both JSON lines and pino-pretty blocks parse, so locally:
 *                              npm run dev 2>&1 | tee /tmp/clariva-dev.log
 *                              TEST_DM_LOG=/tmp/clariva-dev.log npm run test:dm-conversation
 *                            An IDE terminal capture will not work — it flushes too slowly.
 *   TEST_DM_TURN_GAP_MS      min spacing between turns (default 6500)
 *   TEST_DM_TURN_TIMEOUT_MS  per-turn timeout (default 45000)
 *   INSTAGRAM_APP_SECRET / META_APP_SECRET  sign payloads when present
 */

import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ROUTING_LOG,
  SIGNING_MODE,
  WEBHOOK_URL,
  adminClient,
  awaitRoutingFromLog,
  checkTurn,
  freshSenderId,
  observeTurn,
  postTurn,
  resolvePageId,
  waitBeforeNextTurn,
  type Scenario,
} from './lib/dm-harness';
import { SCENARIOS } from './fixtures/dm-conversation-scenarios';

interface ScenarioOutcome {
  id: string;
  title: string;
  checklist?: string;
  note?: string;
  passed: boolean;
  turnsRun: number;
  turnsPassed: number;
  failures: string[];
  warnings: string[];
  elapsedMs: number;
}

interface Options {
  list: boolean;
  scenarioIds: string[];
  tags: string[];
  bail: boolean;
}

function parseArgs(argv: string[]): Options {
  const scenarioIds: string[] = [];
  const tags: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scenario' && argv[i + 1]) scenarioIds.push(argv[++i]!);
    else if (arg === '--tag' && argv[i + 1]) tags.push(argv[++i]!);
  }

  return {
    list: argv.includes('--list'),
    scenarioIds,
    tags,
    bail: argv.includes('--bail'),
  };
}

function selectScenarios(opts: Options): Scenario[] {
  let selected = SCENARIOS;
  if (opts.scenarioIds.length > 0) {
    selected = selected.filter((s) => opts.scenarioIds.includes(s.id));
  }
  if (opts.tags.length > 0) {
    selected = selected.filter((s) => s.tags.some((t) => opts.tags.includes(t)));
  }
  return selected;
}

function printList(): void {
  console.log('Scenarios:\n');
  const width = Math.max(...SCENARIOS.map((s) => s.id.length));
  for (const s of SCENARIOS) {
    const checklist = s.checklist ? ` [§${s.checklist}]` : '';
    console.log(`  ${s.id.padEnd(width)}  ${s.title}${checklist}`);
    console.log(`  ${' '.repeat(width)}  tags: ${s.tags.join(', ')}`);
  }
  console.log('\nFilters: --scenario <id>   --tag <tag>   --bail');
  console.log('Tags:', [...new Set(SCENARIOS.flatMap((s) => s.tags))].sort().join(', '));
}

async function runScenario(
  supabase: SupabaseClient,
  pageId: string,
  scenario: Scenario
): Promise<ScenarioOutcome> {
  const senderId = freshSenderId();
  const startedAt = Date.now();
  const failures: string[] = [];
  const warnings: string[] = [];
  let turnsRun = 0;
  let turnsPassed = 0;

  console.log('');
  console.log(`══ ${scenario.id} — ${scenario.title}`);
  if (scenario.checklist) console.log(`   checklist §${scenario.checklist}`);
  console.log(`   sender=${senderId}`);

  for (const turn of scenario.turns) {
    turnsRun += 1;

    const posted = await postTurn(pageId, senderId, turn);
    if (!posted.ok) {
      console.log(`  ✗ ${turn.label}`);
      console.log(`      POST failed with ${posted.status}`);
      failures.push(`${turn.label}: webhook POST returned ${posted.status}`);
      break;
    }

    const observed = await observeTurn(supabase, senderId, posted.mid, {
      expectNoReply: turn.expect.noReply === true,
    });
    const routing = await awaitRoutingFromLog(posted.mid, turn.expect.branch !== undefined);
    const result = checkTurn(observed, routing, turn.expect);

    console.log(`  ${result.pass ? '✓' : '✗'} ${turn.label}`);
    for (const note of result.notes) console.log(`      ${note}`);
    for (const warning of result.warnings) console.log(`      ⚠ ${warning}`);

    warnings.push(...result.warnings);
    if (result.pass) {
      turnsPassed += 1;
    } else {
      failures.push(
        `${turn.label}: ${result.notes.filter((n) => n.startsWith('✗')).join('; ')}`
      );
    }

    await waitBeforeNextTurn(observed);
  }

  const passed = failures.length === 0 && turnsRun === scenario.turns.length;
  if (!passed && scenario.note) console.log(`      note: ${scenario.note}`);

  return {
    id: scenario.id,
    title: scenario.title,
    checklist: scenario.checklist,
    note: scenario.note,
    passed,
    turnsRun,
    turnsPassed,
    failures,
    warnings,
    elapsedMs: Date.now() - startedAt,
  };
}

function printSummary(outcomes: ScenarioOutcome[]): void {
  const failed = outcomes.filter((o) => !o.passed);
  const totalTurns = outcomes.reduce((n, o) => n + o.turnsRun, 0);
  const passedTurns = outcomes.reduce((n, o) => n + o.turnsPassed, 0);

  console.log('');
  console.log('── summary ──');
  console.log(
    `scenarios: ${outcomes.length - failed.length}/${outcomes.length} passed · ` +
      `turns: ${passedTurns}/${totalTurns} passed`
  );

  if (failed.length > 0) {
    console.log('');
    console.log('failures:');
    for (const outcome of failed) {
      const checklist = outcome.checklist ? ` (checklist §${outcome.checklist})` : '';
      console.log(`  ${outcome.id}${checklist}`);
      for (const failure of outcome.failures) console.log(`    - ${failure}`);
      if (outcome.note) console.log(`    note: ${outcome.note}`);
    }
  }


  const warned = outcomes.filter((o) => o.warnings.length > 0);
  if (warned.length > 0) {
    console.log('');
    console.log('warnings:');
    for (const outcome of warned) {
      for (const warning of [...new Set(outcome.warnings)]) {
        console.log(`  ${outcome.id}: ${warning}`);
      }
    }
  }

  console.log('');
  console.log(failed.length === 0 ? 'PASS' : `FAIL — ${failed.length} scenario(s)`);
  console.log('Meta delivery is not covered here — eyeball one real thread before shipping.');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    printList();
    return;
  }

  const selected = selectScenarios(opts);
  if (selected.length === 0) {
    console.error('No matching scenarios. Use --list to see ids and tags.');
    process.exit(1);
  }

  const supabase = adminClient();
  const pageId = await resolvePageId(supabase);

  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('Page ID:', pageId);
  console.log('Signing:', SIGNING_MODE);
  console.log(
    'Branch assertions:',
    ROUTING_LOG ? `on (log=${ROUTING_LOG})` : 'off (set TEST_DM_LOG to enable)'
  );
  console.log('Scenarios:', selected.length);

  const outcomes: ScenarioOutcome[] = [];
  for (const scenario of selected) {
    const outcome = await runScenario(supabase, pageId, scenario);
    outcomes.push(outcome);
    if (opts.bail && !outcome.passed) {
      console.log('');
      console.log('Bailing after first failure (--bail).');
      break;
    }
  }

  printSummary(outcomes);
  process.exit(outcomes.every((o) => o.passed) ? 0 : 1);
}

main().catch((err: unknown) => {
  const code =
    (err as NodeJS.ErrnoException)?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === 'ECONNREFUSED') {
    console.error('Connection refused. Is the backend running?');
    console.error('  Local: cd backend && npm run dev');
    console.error('  Or set TEST_DM_WEBHOOK_URL.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
