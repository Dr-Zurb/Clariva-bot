import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DmHandlerBranch } from '../../../src/types/dm-instrumentation';
import {
  resolveRoutingBranchForFixture,
  type DmRoutingFixtureWhen,
} from '../../../src/utils/dm-routing-fixture-resolve';

interface TranscriptFixture {
  id: string;
  description?: string;
  expectedBranch: DmHandlerBranch;
  when: DmRoutingFixtureWhen;
}

const FIXTURE_DIR = join(__dirname, '../../fixtures/dm-transcripts');

describe('DM routing golden fixtures (RBH-20)', () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));

  it('loads at least one transcript fixture', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of files) {
    it(`fixture ${file} resolves to expected branch`, () => {
      const raw = readFileSync(join(FIXTURE_DIR, file), 'utf-8');
      const fixture = JSON.parse(raw) as TranscriptFixture;
      const got = resolveRoutingBranchForFixture(fixture.when);
      expect(got).toBe(fixture.expectedBranch);
    });
  }

  it('medical in collection does not map to medical_safety in partial resolver', () => {
    expect(
      resolveRoutingBranchForFixture({
        intent: 'medical_query',
        in_collection: true,
      })
    ).toBe('unknown');
  });
});
