/**
 * seed-diagnosis-catalog.ts
 * assessment-tab · asmt-06 · Wave 6 (full ICD-11 MMS import)
 * ---------------------------------------------------------------------------
 * Loads the full ICD-11 MMS diagnosis rows into `diagnosis_catalog`.
 *
 * WHY A SCRIPT (and not just the SQL migration): migration
 * `163_diagnosis_catalog_full_mms_import.sql` is ~18k rows / ~1.9 MB, which is
 * too large for the Supabase SQL editor ("Query is too large to be run via the
 * SQL editor"), and this repo has no psql / Supabase CLI wired up. This script
 * applies the SAME rows through the already-configured service-role client in
 * small batches, so no extra tooling or DB password is needed.
 *
 * SINGLE SOURCE OF TRUTH: it parses the committed `163_*.sql` (the canonical
 * data artifact), so the script and the SQL migration never drift.
 *
 * IDEMPOTENT: existing codes are read first (case-insensitive) and skipped, so
 * re-runs insert nothing and migration 162's curated vernacular synonyms are
 * never overwritten.
 *
 * PRE-REQ: run migrations 162 (table + RLS) and 164 (search function) first —
 * both are small and run fine in the SQL editor.
 *
 * USAGE:
 *   npx ts-node backend/scripts/seed-diagnosis-catalog.ts --dry-run
 *   npx ts-node backend/scripts/seed-diagnosis-catalog.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdminClient } from '../src/config/database';

const SEED_SQL_PATH = resolve(
  __dirname,
  '../migrations/163_diagnosis_catalog_full_mms_import.sql',
);

const READ_PAGE = 1000;
const INSERT_BATCH = 500;

export interface SeedRow {
  code: string;
  title: string;
  chapter: string | null;
}

/** Un-double SQL-escaped single quotes ('' → '). */
function unescapeSql(value: string): string {
  return value.replace(/''/g, "'");
}

/**
 * Parse the generated VALUES rows out of `163_*.sql`. Each row line looks like:
 *   ('BA00', 'Essential hypertension', '{}'::text[], 'Circulatory system'),
 * with the chapter being either a quoted label or NULL, and the last row of a
 * chunk having no trailing comma.
 */
export function parseSeedRows(sql: string): SeedRow[] {
  const rowRe =
    /^ {2}\('((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'\{\}'::text\[\],\s*(NULL|'(?:[^']|'')*')\),?$/;
  const rows: SeedRow[] = [];
  for (const line of sql.split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const code = unescapeSql(m[1]);
    const title = unescapeSql(m[2]);
    const chapterRaw = m[3];
    const chapter =
      chapterRaw === 'NULL' ? null : unescapeSql(chapterRaw.slice(1, -1));
    rows.push({ code, title, chapter });
  }
  return rows;
}

async function fetchExistingCodesLower(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await admin
      .from('diagnosis_catalog')
      .select('code')
      .order('code', { ascending: true })
      .range(from, from + READ_PAGE - 1);
    if (error) throw new Error(`read existing codes failed: ${error.message}`);
    const page = (data ?? []) as Array<{ code: string }>;
    for (const r of page) existing.add(String(r.code).toLowerCase());
    if (page.length < READ_PAGE) break;
  }
  return existing;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const rows = parseSeedRows(readFileSync(SEED_SQL_PATH, 'utf8'));
  if (rows.length < 10000) {
    throw new Error(
      `parsed only ${rows.length} rows from the seed SQL — expected ~18k. Aborting.`,
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new Error(
      'Service role client not available — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const existing = await fetchExistingCodesLower(admin);
  const toInsert = rows.filter((r) => !existing.has(r.code.toLowerCase()));

  console.log(
    `[seed] parsed=${rows.length} alreadyPresent=${existing.size} toInsert=${toInsert.length}${
      dryRun ? ' (dry-run)' : ''
    }`,
  );

  if (dryRun || toInsert.length === 0) {
    console.log(dryRun ? '[dry-run] no writes performed.' : '[done] nothing to insert.');
    return;
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
    const batch = toInsert.slice(i, i + INSERT_BATCH).map((r) => ({
      code: r.code,
      title: r.title,
      synonyms: [] as string[],
      chapter: r.chapter,
    }));
    const { error } = await admin.from('diagnosis_catalog').insert(batch);
    if (error) {
      throw new Error(
        `insert batch @${i} failed: ${error.message} (${error.details ?? ''})`,
      );
    }
    inserted += batch.length;
    console.log(`[seed] inserted ${inserted}/${toInsert.length}`);
  }

  console.log(`[done] inserted ${inserted} ICD-11 diagnosis rows.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
