/**
 * Standing erasure test for visit_narrative_provenance (vnt-05).
 *
 * vnt-01's design is "spans, not text, because deleting a transcript
 * takes provenance with it". A CASCADE in a DDL file is a claim. This
 * file is where that claim is pinned so a future migration that
 * re-anchors the FK fails CI.
 *
 * Why content-sanity + a SQL-driven scenario, not a live INSERT/DELETE?
 * Same rationale as `consultation-transcripts-migration.test.ts`: the
 * repo has no live-Postgres / Supabase test harness. Bootstrapping one
 * for a single FK is out of scope. The scenario below creates rows in
 * a store whose cascade/restrict behaviour is *parsed from the
 * migration text*, so loosening the FK changes the simulation and
 * fails the assertion — the same failure a live DB would produce.
 *
 * @see docs/Work/Daily-plans/August 2026/30-08-2026/visit-narrative/p2-transcript-amendment/Tasks/task-vnt-05-phase-2-gate.md
 */

import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../../migrations');
const MIGRATION_PATH = resolve(MIGRATIONS_DIR, '224_visit_narrative_provenance.sql');

const TRANSCRIPT_FK =
  /transcript_id\s+UUID NOT NULL REFERENCES consultation_transcripts\(id\) ON DELETE (CASCADE|RESTRICT|SET NULL|NO ACTION|SET DEFAULT)/;

type FkAction = 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' | 'SET DEFAULT';

function parseTranscriptFkAction(sql: string): FkAction {
  const match = sql.match(TRANSCRIPT_FK);
  if (!match) {
    throw new Error('224 is missing the consultation_transcripts FK on transcript_id');
  }
  return match[1] as FkAction;
}

function migrationNumber(name: string): number | null {
  const match = name.match(/^(\d+)_/);
  return match ? Number(match[1]) : null;
}

/**
 * Tiny FK store. Parent delete uses the action parsed from 224.
 * Child delete is forbidden when the append-only trigger is present
 * (direct DELETE at depth 1 raises; that is the in-file rule).
 */
function createErasureStore(parentDelete: FkAction, directChildDeleteForbidden: boolean) {
  const transcripts = new Set<string>();
  const provenance = new Map<string, string>();

  return {
    insertTranscript(id: string) {
      transcripts.add(id);
    },
    insertProvenance(id: string, transcriptId: string) {
      if (!transcripts.has(transcriptId)) {
        throw new Error('fk violation: transcript missing');
      }
      provenance.set(id, transcriptId);
    },
    deleteTranscript(id: string) {
      if (parentDelete === 'RESTRICT' || parentDelete === 'NO ACTION') {
        if ([...provenance.values()].includes(id)) {
          throw new Error('fk restrict: provenance still references transcript');
        }
      }
      transcripts.delete(id);
      if (parentDelete === 'CASCADE') {
        for (const [pid, tid] of provenance) {
          if (tid === id) provenance.delete(pid);
        }
      }
    },
    deleteProvenance(id: string) {
      if (directChildDeleteForbidden) {
        throw new Error('visit_narrative_provenance is append-only');
      }
      provenance.delete(id);
    },
    hasTranscript(id: string) {
      return transcripts.has(id);
    },
    hasProvenance(id: string) {
      return provenance.has(id);
    },
  };
}

describe('224_visit_narrative_provenance.sql — erasure (vnt-05)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const parentDelete = parseTranscriptFkAction(sql);
  const directChildDeleteForbidden = /pg_trigger_depth\(\)\s*<=\s*1/.test(sql)
    && /visit_narrative_provenance is append-only/.test(sql);

  it('anchors transcript_id ON DELETE CASCADE — the erasure claim', () => {
    expect(parentDelete).toBe('CASCADE');
    expect(sql).toMatch(TRANSCRIPT_FK);
  });

  it('allows CASCADE deletes (depth > 1) and forbids a direct DELETE', () => {
    expect(directChildDeleteForbidden).toBe(true);
    expect(sql).toMatch(/IF TG_OP = 'DELETE' AND pg_trigger_depth\(\) <= 1/);
    expect(sql).toMatch(/RAISE EXCEPTION 'visit_narrative_provenance is append-only'/);
  });

  it('creates a transcript + provenance row, deletes the transcript, and the provenance row is gone', () => {
    const store = createErasureStore(parentDelete, directChildDeleteForbidden);
    store.insertTranscript('t1');
    store.insertProvenance('p1', 't1');
    expect(store.hasProvenance('p1')).toBe(true);

    store.deleteTranscript('t1');

    expect(store.hasTranscript('t1')).toBe(false);
    expect(store.hasProvenance('p1')).toBe(false);
  });

  it('refuses a direct provenance delete and does not touch the transcript', () => {
    const store = createErasureStore(parentDelete, directChildDeleteForbidden);
    store.insertTranscript('t2');
    store.insertProvenance('p2', 't2');

    expect(() => store.deleteProvenance('p2')).toThrow(/append-only/);
    expect(store.hasProvenance('p2')).toBe(true);
    expect(store.hasTranscript('t2')).toBe(true);
  });

  it('does not declare a reverse FK that would let provenance delete the transcript', () => {
    expect(sql).not.toMatch(
      /consultation_transcripts[\s\S]{0,120}REFERENCES visit_narrative_provenance/,
    );
    expect(sql).not.toMatch(
      /ALTER TABLE consultation_transcripts[\s\S]{0,200}visit_narrative_provenance/,
    );
  });

  it('later migrations do not loosen the erasure anchor', () => {
    const later = readdirSync(MIGRATIONS_DIR).filter((name) => {
      if (!name.endsWith('.sql')) return false;
      const n = migrationNumber(name);
      return n !== null && n > 224;
    });

    for (const name of later) {
      const laterSql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
      if (!/visit_narrative_provenance/i.test(laterSql)) continue;

      expect(laterSql).not.toMatch(/DROP TABLE(?:\s+IF\s+EXISTS)?\s+visit_narrative_provenance/i);
      expect(laterSql).not.toMatch(
        /transcript_id[\s\S]{0,240}ON DELETE\s+(RESTRICT|SET NULL|NO ACTION|SET DEFAULT)/i,
      );
      expect(laterSql).not.toMatch(
        /DROP CONSTRAINT[\s\S]{0,80}visit_narrative_provenance/i,
      );
    }
  });
});
