/**
 * e-task-ops-02: Golden corpus regression — clinical-idle routing preview vs fixtures.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { IntentDetectionResult } from '../../../src/types/ai';
import type { DmHandlerBranch } from '../../../src/types/dm-instrumentation';
import { readConversationState } from '../../../src/types/conversation-state-io';
import { previewClinicalIdleDmBranch } from '../../../src/utils/dm-routing-clinical-idle-preview';

const corpusPath = join(__dirname, '../../fixtures/dm-routing-golden/corpus.json');

interface CorpusScenario {
  id: string;
  flags?: string[];
  inCollection: boolean;
  state: Record<string, unknown>;
  recentMessages: { sender_type: string; content: string }[];
  text: string;
  intentResult: IntentDetectionResult;
  expected_branch: DmHandlerBranch | null;
}

interface CorpusFile {
  scenarios: CorpusScenario[];
}

function loadCorpus(): CorpusFile {
  const raw = readFileSync(corpusPath, 'utf-8');
  return JSON.parse(raw) as CorpusFile;
}

function hydrateState(
  state: Record<string, unknown>,
  nowMs: number
): Parameters<typeof previewClinicalIdleDmBranch>[0]['state'] {
  const raw = { ...state } as Record<string, unknown>;
  if (raw.lastMedicalDeflectionAt === '__RECENT__') {
    raw.lastMedicalDeflectionAt = new Date(nowMs - 120_000).toISOString();
  }
  const hydrated = readConversationState(raw);
  return { step: hydrated.step, triage: hydrated.triage };
}

describe('dm-routing-golden corpus (e-task-ops-02)', () => {
  const corpus = loadCorpus();
  const nowMs = Date.UTC(2026, 3, 10, 12, 0, 0);

  it.each(corpus.scenarios.map((s) => [s.id, s] as const))(
    'scenario %s matches previewClinicalIdleDmBranch',
    (_id, s) => {
      const branch = previewClinicalIdleDmBranch({
        text: s.text,
        intentResult: s.intentResult,
        state: hydrateState(s.state, nowMs),
        recentMessages: s.recentMessages,
        inCollection: s.inCollection,
        nowMs,
      });
      expect(branch).toBe(s.expected_branch);
    }
  );
});
