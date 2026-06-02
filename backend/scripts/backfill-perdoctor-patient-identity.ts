/**
 * rcp-29: Split legacy global platform patients into per-doctor rows.
 *
 * Run BEFORE migration 115 (drops legacy global unique index).
 *
 * Usage:
 *   npx ts-node backend/scripts/backfill-perdoctor-patient-identity.ts --dry-run
 *   npx ts-node backend/scripts/backfill-perdoctor-patient-identity.ts
 *
 * Consent rule: primary doctor keeps original consent; clones default to pending (DL-7).
 * Idempotent — safe to re-run.
 */

import 'dotenv/config';
import { runPerDoctorIdentityBackfill } from '../src/services/perdoctor-identity-backfill';

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const stats = await runPerDoctorIdentityBackfill({ dryRun });

  console.log(
    dryRun
      ? `[dry-run] ${JSON.stringify(stats)}`
      : `[done] ${JSON.stringify(stats)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
