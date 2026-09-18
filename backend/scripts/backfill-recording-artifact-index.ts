/**
 * rec-05: Backfill `recording_artifact_index` from ended voice/video
 * Twilio rooms.
 *
 * Usage (from `backend/`):
 *   npm run backfill:artifact-index
 *   npm run backfill:artifact-index -- --limit=20
 *   npm run backfill:artifact-index -- --apply
 *
 * Flags:
 *   (none) / --dry-run   Safe default. Scans and reports; writes nothing.
 *   --apply              Perform inserts via rec-02's writer.
 *   --limit=N            Cap sessions scanned.
 *   --batch-size=N       Page size (default 25).
 *   --ended-after=ISO    Inclusive lower bound on actual_ended_at.
 *   --ended-before=ISO   Exclusive upper bound on actual_ended_at.
 *
 * Idempotent — UNIQUE (session_id, artifact_kind, storage_uri) absorbs
 * duplicates. Safe to re-run after a kill, timeout, or rate-limit.
 * Do not run --apply until the dry-run report has been reviewed.
 */

import {
  runArtifactIndexBackfill,
  type ArtifactIndexBackfillOptions,
} from '../src/services/recording-artifact-backfill-service';

function readFlag(name: string): string | undefined {
  const prefixed = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefixed));
  if (hit) return hit.slice(prefixed.length);
  return undefined;
}

function parseDate(raw: string | undefined, flag: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${flag}: ${raw}`);
  }
  return d;
}

function parseArgs(): ArtifactIndexBackfillOptions {
  const apply = process.argv.includes('--apply');
  const explicitDry = process.argv.includes('--dry-run');
  const limitRaw = readFlag('limit');
  const batchRaw = readFlag('batch-size');

  return {
    dryRun: explicitDry || !apply,
    limit: limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : undefined,
    batchSize: batchRaw ? Math.max(1, parseInt(batchRaw, 10) || 0) : undefined,
    endedAfter: parseDate(readFlag('ended-after'), '--ended-after'),
    endedBefore: parseDate(readFlag('ended-before'), '--ended-before'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const stats = await runArtifactIndexBackfill(options);
  const tag = stats.dryRun ? '[dry-run]' : '[done]';
  console.log(`${tag} ${JSON.stringify(stats)}`);
  if (stats.failures > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
