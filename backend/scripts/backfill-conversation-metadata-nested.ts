/**
 * rcp-19: One-time (or repeat-safe) backfill — legacy-flat `conversations.metadata` → nested.
 *
 * Usage:
 *   npx ts-node backend/scripts/backfill-conversation-metadata-nested.ts --dry-run
 *   npx ts-node backend/scripts/backfill-conversation-metadata-nested.ts
 *
 * Idempotent: rows already nested are unchanged after read→write→read.
 */

import 'dotenv/config';
import { getSupabaseAdminClient } from '../src/config/database';
import { migrateConversationMetadataToNested } from '../src/types/conversation-state-io';

const PAGE_SIZE = 200;

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

function metadataWouldChange(before: unknown, after: Record<string, unknown>): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const supabase = getSupabaseAdminClient();

  let offset = 0;
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, metadata')
      .not('metadata', 'is', null)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Query failed:', error.message);
      process.exit(1);
    }
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      const before = row.metadata;
      const nested = migrateConversationMetadataToNested(before);
      if (!metadataWouldChange(before, nested)) continue;
      wouldUpdate += 1;

      if (dryRun) continue;

      const { error: updateError } = await supabase
        .from('conversations')
        .update({ metadata: nested })
        .eq('id', row.id);
      if (updateError) {
        console.error(`Update failed for ${row.id}:`, updateError.message);
        process.exit(1);
      }
      updated += 1;
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(
    dryRun
      ? `[dry-run] scanned=${scanned} would_update=${wouldUpdate}`
      : `scanned=${scanned} updated=${updated} skipped=${scanned - updated}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
