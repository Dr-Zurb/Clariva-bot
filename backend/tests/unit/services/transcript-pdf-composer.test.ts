/**
 * transcript-pdf-composer unit tests (Plan 07 · Task 32)
 *
 * These tests are the enforcement contract for the composer's
 * deterministic pieces:
 *   1. `mergeByTimestamp` ordering (pinned — chat wins ties, stable by
 *      source).
 *   2. `composeTranscriptPdfStream` produces a non-empty PDF stream
 *      with `%PDF-` header + `%%EOF` trailer, letterhead strings
 *      present in uncompressed stream content, and reports accurate
 *      byte count.
 *   3. Voice-transcription-pending banner renders when
 *      `voiceTranscriptionPending=true` AND modality !== 'text'.
 *   4. Empty consult renders the "no messages" placeholder without
 *      throwing.
 *
 * We deliberately avoid pixel snapshotting — pdfkit's output bytes are
 * non-deterministic across minor-version bumps (internal xref table
 * compression) and platform floating-point. String presence checks on
 * the raw PDF content stream are durable enough to catch regressions
 * without flaking on a patch upgrade.
 */

import { PassThrough } from 'stream';
import {
  composeTranscriptPdfStream,
  mergeByTimestamp,
  transcriptPauseReasonLabel,
  type ChatMessageRow,
  type ComposeTranscriptContext,
  type TranscriptGapRow,
  type VoiceTranscriptSegment,
} from '../../../src/services/transcript-pdf-composer';

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Decode every hex-encoded PDF text string (`<abcd...>`) in the
 * uncompressed PDF bytes and return the concatenated plaintext.
 *
 * pdfkit renders text with Type-1 fonts using hex-encoded strings
 * inside `TJ` operators, e.g.:
 *
 *   BT
 *   [<41636d6520436c696e6963> 0] TJ   // "Acme Clinic"
 *   [<4472> 50 <2e2053686172> -25 <6d61> 0] TJ   // "Dr. Sharma" with kerns
 *
 * Because kerning offsets split the string into fragments, we decode
 * *every* hex group and concatenate them. This is enough to reliably
 * assert on phrase presence (the phrase lives across fragments), at
 * the cost of not being layout-aware — fine for our contract tests.
 *
 * We use `compress: false` on the pdfkit document (see composer), so
 * the content stream is greppable without deflate.
 */
function extractPdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const hexPattern = /<([0-9a-fA-F]+)>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = hexPattern.exec(raw)) !== null) {
    const hex = m[1];
    if (hex.length % 2 !== 0) continue;
    try {
      out += Buffer.from(hex, 'hex').toString('utf-8');
    } catch {
      // Ignore non-UTF8 fragments; PDF IDs are hex too and land here
      // as garbage — harmless for substring checks against readable
      // text.
    }
    out += ' ';
  }
  return out;
}

/**
 * Collapse whitespace so substring assertions ignore the artificial
 * spaces pdfkit's kerning splitter introduces between hex fragments
 * (e.g. "Dr. Sharma" often renders as "Dr .  Shar ma" across 3 hex
 * strings). We normalize both the haystack and the needle.
 */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function expectPdfContains(buf: Buffer, phrase: string): void {
  const hay = normalizeWs(extractPdfText(buf));
  const needle = normalizeWs(phrase);
  if (!hay.includes(needle)) {
    throw new Error(
      `PDF does not contain phrase "${phrase}" (normalized "${needle}"). ` +
        `Extracted text (first 400 chars, normalized): "${hay.slice(0, 400)}"`,
    );
  }
}

function expectPdfDoesNotContain(buf: Buffer, phrase: string): void {
  const hay = normalizeWs(extractPdfText(buf));
  const needle = normalizeWs(phrase);
  if (hay.includes(needle)) {
    throw new Error(
      `PDF unexpectedly contains phrase "${phrase}" (normalized "${needle}").`,
    );
  }
}

const baseCtx: ComposeTranscriptContext = {
  sessionId:           '11111111-2222-3333-4444-555555555555',
  doctorDisplayName:   'Sharma',
  doctorSpecialty:     'General Physician',
  practiceName:        'Acme Clinic',
  doctorTimezone:      'Asia/Kolkata',
  patientDisplayName:  'Anita Kumar',
  consultEndedAtIso:   '2026-04-19T09:45:00.000Z',
  modality:            'voice',
  voiceTranscriptionPending: false,
};

describe('mergeByTimestamp (pinned ordering)', () => {
  const chat: ChatMessageRow[] = [
    { kind: 'text',   createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'Hello doctor' },
    { kind: 'text',   createdAtIso: '2026-04-19T09:05:00.000Z', senderRole: 'doctor',  body: 'Hi, how can I help?' },
    { kind: 'system', createdAtIso: '2026-04-19T09:10:00.000Z', senderRole: 'system',  body: 'Voice call started' },
  ];
  const voice: VoiceTranscriptSegment[] = [
    { timestampIso: '2026-04-19T09:10:10.000Z', speakerLabel: 'Dr. Sharma', text: 'Tell me your symptoms.' },
    { timestampIso: '2026-04-19T09:05:00.000Z', speakerLabel: 'Patient',    text: 'I have a headache.' },
  ];

  it('merges by timestamp ascending with stable chat-wins tie-breaker', () => {
    const out = mergeByTimestamp(chat, voice);
    expect(out).toHaveLength(5);

    // 09:00 chat, 09:05 chat (wins over 09:05 voice), 09:05 voice, 09:10 system, 09:10:10 voice
    expect(out[0]).toMatchObject({ source: 'chat', kind: 'text', body: 'Hello doctor' });
    expect(out[1]).toMatchObject({ source: 'chat', kind: 'text', body: 'Hi, how can I help?' });
    expect(out[2]).toMatchObject({ source: 'voice', text: 'I have a headache.' });
    expect(out[3]).toMatchObject({ source: 'chat', kind: 'system', body: 'Voice call started' });
    expect(out[4]).toMatchObject({ source: 'voice', text: 'Tell me your symptoms.' });
  });

  it('handles empty inputs', () => {
    expect(mergeByTimestamp([], [])).toEqual([]);
    expect(mergeByTimestamp(chat, [])).toHaveLength(3);
    expect(mergeByTimestamp([], voice)).toHaveLength(2);
    expect(mergeByTimestamp([], [], [])).toEqual([]);
  });

  const gapA: TranscriptGapRow = {
    wallStartedAt: '2026-04-19T09:03:00.000Z',
    durationMs:    120_000,
    actorRole:     'doctor',
    reasonCode:    'administrative',
    closedAs:      'manual_resume',
  };
  const gapB: TranscriptGapRow = {
    wallStartedAt: '2026-04-19T09:12:00.000Z',
    durationMs:    60_000,
    actorRole:     'patient',
    reasonCode:    'patient_request',
    closedAs:      'auto_resume',
  };

  it('orders three sources by timestamp (chat < gap < voice at ties)', () => {
    const sameTs = '2026-04-19T09:05:00.000Z';
    const out = mergeByTimestamp(
      [{ kind: 'text', createdAtIso: sameTs, senderRole: 'doctor', body: 'chat-tie' }],
      [{ timestampIso: sameTs, speakerLabel: 'Patient', text: 'voice-tie' }],
      [{ ...gapA, wallStartedAt: sameTs }],
    );
    expect(out.map((x) => x.source)).toEqual(['chat', 'gap', 'voice']);
    expect(out[0]).toMatchObject({ source: 'chat', body: 'chat-tie' });
    expect(out[1]).toMatchObject({ source: 'gap', reasonCode: 'administrative' });
    expect(out[2]).toMatchObject({ source: 'voice', text: 'voice-tie' });
  });

  it('interleaves two gaps among chat and voice in wall-clock order', () => {
    const out = mergeByTimestamp(chat, voice, [gapB, gapA]);
    expect(out.map((x) => x.source)).toEqual([
      'chat', // 09:00
      'gap',  // 09:03
      'chat', // 09:05
      'voice', // 09:05
      'chat', // 09:10
      'voice', // 09:10:10
      'gap',  // 09:12
    ]);
    expect(out[1]).toMatchObject({ source: 'gap', reasonCode: 'administrative' });
    expect(out[6]).toMatchObject({ source: 'gap', reasonCode: 'patient_request' });
  });

  it('keeps chat-before-voice when gaps is omitted (two-arg form)', () => {
    const out = mergeByTimestamp(
      [{ kind: 'text', createdAtIso: '2026-04-19T09:05:00.000Z', senderRole: 'doctor', body: 'tie' }],
      [{ timestampIso: '2026-04-19T09:05:00.000Z', speakerLabel: 'Patient', text: 'tie-v' }],
    );
    expect(out[0]).toMatchObject({ source: 'chat' });
    expect(out[1]).toMatchObject({ source: 'voice' });
  });
});

describe('composeTranscriptPdfStream', () => {
  // These tests actually invoke pdfkit end-to-end; allow a comfy timeout
  // on slower CI where cold-start font load adds latency.
  jest.setTimeout(15_000);

  it('produces a valid PDF with letterhead strings present', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    const { bytesWritten } = await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'Hello doctor' },
        { kind: 'text', createdAtIso: '2026-04-19T09:01:00.000Z', senderRole: 'doctor',  body: 'Good morning Anita' },
      ],
      voiceSegments: [],
      output: stream,
      generatedAt: new Date('2026-04-19T10:00:00Z'),
    });

    const buf = await bytesPromise;
    expect(buf.length).toBeGreaterThan(1000);
    expect(bytesWritten).toBe(buf.length);

    // PDF magic header + trailer
    expect(buf.slice(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.slice(-6).toString('latin1')).toMatch(/%%EOF/);

    expectPdfContains(buf, 'Acme Clinic');
    expectPdfContains(buf, 'Consultation transcript');
    // Sender labels from chat (the "Dr. Sharma" expansion is the one
    // most likely to regress if `resolveChatSenderLabel` loses ctx).
    expectPdfContains(buf, 'Dr. Sharma');
    expectPdfContains(buf, 'Patient');
    // Footer watermark (renders on every page).
    expectPdfContains(buf, 'Confidential');
    expectPdfContains(buf, 'Signed: Halo Aid Transcript Service');
  });

  it('renders the "transcription pending" banner for voice consults awaiting transcription', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: { ...baseCtx, voiceTranscriptionPending: true, modality: 'voice' },
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'hi' },
      ],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'Audio transcription pending');
  });

  it('does NOT render the pending banner for text-only consults', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: { ...baseCtx, voiceTranscriptionPending: true, modality: 'text' },
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'hi' },
      ],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfDoesNotContain(buf, 'Audio transcription pending');
  });

  it('renders the empty-consult placeholder without throwing', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    const { bytesWritten } = await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expect(bytesWritten).toBe(buf.length);
    expectPdfContains(buf, 'No messages recorded');
  });

  it('renders attachment rows with filename + MIME', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [
        {
          kind:           'attachment',
          createdAtIso:   '2026-04-19T09:00:00.000Z',
          senderRole:     'patient',
          body:           null,
          attachmentUrl:  'https://example.com/files/blood-report.pdf?sig=abc',
          attachmentMime: 'application/pdf',
        },
      ],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'blood-report.pdf');
    expectPdfContains(buf, 'application/pdf');
  });

  it('renders a gaps-only transcript instead of the empty placeholder', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [],
      voiceSegments: [],
      gaps: [
        {
          wallStartedAt: '2026-04-19T09:00:00.000Z',
          durationMs:    240_000,
          actorRole:     'doctor',
          reasonCode:    'administrative',
          closedAs:      'manual_resume',
        },
      ],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'Recording gap');
    expectPdfContains(buf, 'This interval was not recorded');
    expectPdfContains(buf, 'an administrative pause');
    expectPdfDoesNotContain(buf, 'No messages recorded');
  });

  it('renders two gaps in wall-clock order, including one at the start and one at the end', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:10:00.000Z', senderRole: 'patient', body: 'mid-chat' },
      ],
      voiceSegments: [],
      gaps: [
        {
          wallStartedAt: '2026-04-19T09:00:00.000Z',
          durationMs:    60_000,
          actorRole:     'patient',
          reasonCode:    'patient_request',
          closedAs:      'manual_resume',
        },
        {
          wallStartedAt: '2026-04-19T09:40:00.000Z',
          durationMs:    180_000,
          actorRole:     'doctor',
          reasonCode:    'sensitive_disclosure',
          closedAs:      'session_ended_while_paused',
        },
      ],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'the patient asked to pause');
    expectPdfContains(buf, 'this part of the visit was deliberately not recorded');
    expectPdfContains(buf, 'The consult ended while recording was paused');
    expectPdfContains(buf, 'mid-chat');
  });

  it('renders the legacy not-recorded state and never a free-text diagnosis', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);
    const leaked = 'patient disclosed HIV status';

    await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [],
      voiceSegments: [],
      gaps: [
        {
          wallStartedAt: '2026-04-19T09:00:00.000Z',
          durationMs:    30_000,
          actorRole:     'doctor',
          reasonCode:    'not_recorded_in_preset_form',
          closedAs:      'manual_resume',
        },
      ],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'the reason was not recorded in preset form');
    expectPdfDoesNotContain(buf, leaked);
    expect(transcriptPauseReasonLabel('not_recorded_in_preset_form')).toBe(
      'the reason was not recorded in preset form',
    );
    expect(transcriptPauseReasonLabel('made_up_code')).toBe(
      'the reason was not recorded in preset form',
    );
  });

  it('renders a visible note when gap information could not be loaded', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: { ...baseCtx, gapsLoadFailed: true },
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'hello' },
      ],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfContains(buf, 'Recording-gap information unavailable');
    expectPdfContains(buf, 'hello');
  });

  it('does not add gap furniture to a gapless transcript', async () => {
    const stream = new PassThrough();
    const bytesPromise = collect(stream);

    await composeTranscriptPdfStream({
      context: baseCtx,
      messages: [
        { kind: 'text', createdAtIso: '2026-04-19T09:00:00.000Z', senderRole: 'patient', body: 'hello' },
      ],
      voiceSegments: [],
      output: stream,
    });

    const buf = await bytesPromise;
    expectPdfDoesNotContain(buf, 'Recording gap');
    expectPdfDoesNotContain(buf, 'Recording-gap information unavailable');
    expectPdfContains(buf, 'hello');
  });
});
