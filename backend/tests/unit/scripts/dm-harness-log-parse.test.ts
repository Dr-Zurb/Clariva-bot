/**
 * Locks the routing-log parser used by the scripted DM conversation harness
 * (`scripts/lib/dm-harness.ts`).
 *
 * The harness reads `branch` from `instagram_dm_routing` because the DM handler
 * emits it as an observability event and never persists it. Local `npm run dev`
 * prints pino-pretty blocks while deployed environments emit JSON lines, so both
 * shapes have to parse — and neither may pick up a neighbouring event's fields.
 */

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type ParseRoutingFromLog = (eventId: string) => {
  branch?: string;
  intent?: string;
  stepAfter?: string;
} | null;

/** Load the harness with TEST_DM_LOG pointed at `contents`. Env is read at import. */
function loadParserWithLog(contents: string): ParseRoutingFromLog {
  const dir = mkdtempSync(join(tmpdir(), 'dm-harness-'));
  const file = join(dir, 'dev.log');
  writeFileSync(file, contents, 'utf8');

  let parse!: ParseRoutingFromLog;
  jest.isolateModules(() => {
    process.env.TEST_DM_LOG = file;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    parse = require('../../../scripts/lib/dm-harness').parseRoutingFromLog;
  });
  return parse;
}

const EVENT_ID = 'mid.test.1785652481160.7879085';
const OTHER_EVENT_ID = 'mid.test.1785652999999.1111111';

const PRETTY_BLOCK = `[06:34:49 UTC] INFO: instagram_dm_routing
    correlationId: "159af78e-e113-4dcc-a05d-652452b6fd4d"
    eventId: "${EVENT_ID}"
    doctorId: "cb33af77-0878-4f7a-a728-fe8cdd8701ed"
    conversationId: "50f5825a-48c9-4b14-8a8f-e334294e3054"
    branch: "greeting_template"
    intent: "greeting"
    intent_topics: []
    is_fee_question: false
    state_step_before: null
    state_step_after: "responded"
    greeting_fast_path: false
`;

/** Emitted after the routing block and also carrying the event id. */
const TRAILING_TIMING_BLOCK = `[06:34:49 UTC] INFO: webhook_metric_webhook_instagram_dm_pipeline_timing
    metric: "webhook_instagram_dm_pipeline_timing"
    eventId: "${EVENT_ID}"
    intentMs: 1209
    generateMs: 2025
`;

describe('parseRoutingFromLog', () => {
  const originalLog = process.env.TEST_DM_LOG;

  afterEach(() => {
    if (originalLog === undefined) delete process.env.TEST_DM_LOG;
    else process.env.TEST_DM_LOG = originalLog;
  });

  it('returns null when no log file is configured', () => {
    let parse!: ParseRoutingFromLog;
    jest.isolateModules(() => {
      delete process.env.TEST_DM_LOG;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      parse = require('../../../scripts/lib/dm-harness').parseRoutingFromLog;
    });
    expect(parse(EVENT_ID)).toBeNull();
  });

  it('reads branch, intent and step from JSON log lines', () => {
    const parse = loadParserWithLog(
      [
        JSON.stringify({ level: 30, msg: 'unrelated' }),
        JSON.stringify({
          msg: 'instagram_dm_routing',
          eventId: EVENT_ID,
          branch: 'emergency_safety',
          intent: 'emergency',
          state_step_after: 'responded',
        }),
      ].join('\n')
    );

    expect(parse(EVENT_ID)).toEqual({
      branch: 'emergency_safety',
      intent: 'emergency',
      stepAfter: 'responded',
    });
  });

  it('reads pino-pretty blocks from local dev output', () => {
    const parse = loadParserWithLog(PRETTY_BLOCK);

    expect(parse(EVENT_ID)).toEqual({
      branch: 'greeting_template',
      intent: 'greeting',
      stepAfter: 'responded',
    });
  });

  it('anchors on the routing block when later blocks repeat the event id', () => {
    const parse = loadParserWithLog(PRETTY_BLOCK + TRAILING_TIMING_BLOCK);

    expect(parse(EVENT_ID)?.branch).toBe('greeting_template');
  });

  it('does not attribute another turn\'s branch to this event', () => {
    const otherTurn = PRETTY_BLOCK.replace(EVENT_ID, OTHER_EVENT_ID).replace(
      'greeting_template',
      'medical_safety'
    );
    const parse = loadParserWithLog(otherTurn);

    expect(parse(EVENT_ID)).toBeNull();
  });

  it('picks the matching block when several turns are interleaved', () => {
    const earlier = PRETTY_BLOCK.replace(EVENT_ID, OTHER_EVENT_ID).replace(
      'greeting_template',
      'medical_safety'
    );
    const parse = loadParserWithLog(earlier + PRETTY_BLOCK);

    expect(parse(EVENT_ID)?.branch).toBe('greeting_template');
    expect(parse(OTHER_EVENT_ID)?.branch).toBe('medical_safety');
  });

  it('returns null for an event that never routed', () => {
    const parse = loadParserWithLog(PRETTY_BLOCK);

    expect(parse('mid.test.absent')).toBeNull();
  });
});
