/**
 * generate-diagnosis-catalog-seed.js
 * assessment-tab · asmt-06 · Wave 6 (full ICD-11 MMS import)
 * ---------------------------------------------------------------------------
 * Turns the WHO ICD-11 MMS "Simple Tabulation" export into the idempotent seed
 * body of migration `163_diagnosis_catalog_full_mms_import.sql`.
 *
 * WHY A GENERATOR: the catalog holds the *full* set of codeable ICD-11
 * diagnoses (~18k rows). Those can't be hand-typed accurately, and they're the
 * whitelist the Wave 7 AI resolver is constrained to — so a wrong code here is
 * a wrong code on a prescription. We derive them mechanically from the WHO
 * source of truth and regenerate on each WHO release.
 *
 * SOURCE (WHO, CC BY-ND 3.0 IGO — attribution kept in the migration header):
 *   https://icdcdn.who.int/static/releasefiles/<RELEASE>/SimpleTabulation-ICD-11-MMS-en.zip
 *   (unzip → SimpleTabulation-ICD-11-MMS-en.txt, a tab-separated export)
 *
 * SCOPE: only `ClassKind == 'category'` rows carry a code. We keep chapters
 * 01–26 (the diseases/conditions) and DROP:
 *   - Chapter X  → Extension Codes (post-coordination qualifiers, not diagnoses)
 *   - Chapter V  → Supplementary functioning assessment (WHODAS, not diagnoses)
 * Titles use the WHO canonical spelling with the leading depth dashes removed.
 * Synonyms are left empty here — migration 162 already seeds vernacular
 * synonyms for the common-OPD rows, and its idempotent guard means this import
 * SKIPS any code 162 already inserted, so that curation is preserved.
 *
 * USAGE:
 *   node backend/scripts/generate-diagnosis-catalog-seed.js <path-to-txt> [outfile]
 * Defaults: outfile = backend/migrations/163_diagnosis_catalog_full_mms_import.sql
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RELEASE = '2026-01';
const SOURCE_URL = `https://icdcdn.who.int/static/releasefiles/${RELEASE}/SimpleTabulation-ICD-11-MMS-en.zip`;
const CHUNK_SIZE = 500;

// WHO ChapterNo → short display grouping (not the WHO chapter number itself).
const CHAPTER_LABELS = {
  '01': 'Infectious or parasitic',
  '02': 'Neoplasms',
  '03': 'Blood or blood-forming organs',
  '04': 'Immune system',
  '05': 'Endocrine, nutritional or metabolic',
  '06': 'Mental, behavioural or neurodevelopmental',
  '07': 'Sleep-wake',
  '08': 'Nervous system',
  '09': 'Visual system',
  '10': 'Ear or mastoid process',
  '11': 'Circulatory system',
  '12': 'Respiratory system',
  '13': 'Digestive system',
  '14': 'Skin',
  '15': 'Musculoskeletal or connective tissue',
  '16': 'Genitourinary system',
  '17': 'Conditions related to sexual health',
  '18': 'Pregnancy, childbirth or puerperium',
  '19': 'Perinatal period',
  '20': 'Developmental anomalies',
  '21': 'Symptoms, signs or clinical findings',
  '22': 'Injury, poisoning or external causes',
  '23': 'External causes of morbidity or mortality',
  '24': 'Factors influencing health status',
  '25': 'Codes for special purposes',
  '26': 'Traditional medicine conditions (TM1)',
};

// Chapters that are NOT standalone diagnoses.
const EXCLUDED_CHAPTERS = new Set(['X', 'V']);

/** Strip surrounding quotes, un-double embedded quotes, drop leading depth dashes. */
function cleanTitle(raw) {
  let t = raw;
  if (t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1).replace(/""/g, '"');
  }
  t = t.replace(/^[\s\u2013-]+/, '').trim();
  return t;
}

/** SQL single-quote escaping. */
function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error(
      'Usage: node generate-diagnosis-catalog-seed.js <SimpleTabulation-ICD-11-MMS-en.txt> [outfile]',
    );
    process.exit(1);
  }
  const outPath =
    process.argv[3] ||
    path.resolve(
      __dirname,
      '../migrations/163_diagnosis_catalog_full_mms_import.sql',
    );

  const lines = fs.readFileSync(inPath, 'utf8').split(/\r?\n/);
  const header = lines[0].split('\t');
  const iCode = header.indexOf('Code');
  const iTitle = header.indexOf('Title');
  const iKind = header.indexOf('ClassKind');
  const iChapter = header.indexOf('ChapterNo');
  if (iCode < 0 || iTitle < 0 || iKind < 0 || iChapter < 0) {
    console.error('Unexpected header — could not locate required columns.', header.slice(0, 10));
    process.exit(1);
  }

  const seen = new Set();
  const rows = [];
  let skippedExtension = 0;
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols[iKind] !== 'category') continue;
    const code = (cols[iCode] || '').trim();
    if (!code) continue;
    const chapter = (cols[iChapter] || '').trim();
    if (EXCLUDED_CHAPTERS.has(chapter)) {
      skippedExtension++;
      continue;
    }
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = cleanTitle(cols[iTitle] || '');
    if (!title) continue;
    rows.push({ code, title, chapter: CHAPTER_LABELS[chapter] || null });
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  const out = [];
  out.push('-- ============================================================================');
  out.push('-- 163_diagnosis_catalog_full_mms_import.sql');
  out.push('-- assessment-tab · Wave 6 · task asmt-06 (ICD-coded diagnosis entry)');
  out.push('-- ============================================================================');
  out.push('-- GENERATED FILE — do not hand-edit. Regenerate with:');
  out.push('--   node backend/scripts/generate-diagnosis-catalog-seed.js \\');
  out.push('--     <SimpleTabulation-ICD-11-MMS-en.txt>');
  out.push('--');
  out.push('-- Full ICD-11 (MMS) diagnosis import that supersedes the small curated seed');
  out.push('-- in migration 162 (which stays — its rows carry vernacular synonyms and are');
  out.push('-- kept by the idempotent guard below). Adds every codeable MMS *category*');
  out.push('-- across chapters 01–26.');
  out.push('--');
  out.push('-- EXCLUDED (not standalone diagnoses):');
  out.push('--   • Chapter X — Extension Codes (post-coordination qualifiers)');
  out.push('--   • Chapter V — Supplementary functioning assessment (WHODAS)');
  out.push('--');
  out.push(`-- Source: WHO ICD-11 MMS Simple Tabulation, release ${RELEASE}.`);
  out.push(`--   ${SOURCE_URL}`);
  out.push('--   Licence: ICD-11 is published by WHO under CC BY-ND 3.0 IGO.');
  out.push('--   Titles are the WHO canonical spelling; codes are MMS stem codes.');
  out.push(`--   Rows in this import: ${rows.length} (deduped on lower(code)).`);
  out.push('--');
  out.push('-- PHI: NONE — public code list, mirrors 162. No prescriptions table touched.');
  out.push('--');
  out.push('-- APPLYING: this file is intentionally too large for the Supabase SQL editor');
  out.push('--   ("Query is too large to be run via the SQL editor"). Load it with the');
  out.push('--   idempotent seed script, which applies these SAME rows in batches via the');
  out.push('--   service-role client (no psql / CLI needed):');
  out.push('--     npx ts-node backend/scripts/seed-diagnosis-catalog.ts --dry-run');
  out.push('--     npx ts-node backend/scripts/seed-diagnosis-catalog.ts');
  out.push('--   (or apply this file directly via psql / the Supabase CLI). Run migrations');
  out.push('--   162 (table) and 164 (search function) in the editor first.');
  out.push('-- Idempotency: each chunk is guarded by WHERE NOT EXISTS on lower(code); a');
  out.push('--   re-run only inserts missing codes and never clobbers 162 curation.');
  out.push('-- Rollback (documented only): the rows are removed by 162\'s');
  out.push('--   DROP TABLE IF EXISTS diagnosis_catalog CASCADE;');
  out.push('-- ============================================================================');
  out.push('');

  chunks.forEach((chunk, idx) => {
    out.push(
      `-- chunk ${idx + 1}/${chunks.length} (${chunk.length} rows)`,
    );
    out.push('INSERT INTO diagnosis_catalog (code, title, synonyms, chapter)');
    out.push('SELECT v.code, v.title, v.synonyms, v.chapter');
    out.push('FROM (VALUES');
    const valueLines = chunk.map((r, j) => {
      const chapter = r.chapter ? sqlStr(r.chapter) : 'NULL';
      const comma = j === chunk.length - 1 ? '' : ',';
      return `  (${sqlStr(r.code)}, ${sqlStr(r.title)}, '{}'::text[], ${chapter})${comma}`;
    });
    out.push(...valueLines);
    out.push(') AS v(code, title, synonyms, chapter)');
    out.push('WHERE NOT EXISTS (');
    out.push('  SELECT 1 FROM diagnosis_catalog d WHERE lower(d.code) = lower(v.code)');
    out.push(');');
    out.push('');
  });

  out.push('-- ============================================================================');
  out.push('-- Migration Complete');
  out.push('-- ============================================================================');
  out.push(`-- Imported ${rows.length} ICD-11 (MMS) diagnosis categories (chapters 01–26).`);
  out.push(`-- Skipped ${skippedExtension} extension/functioning rows (chapters X, V).`);
  out.push('-- NON-PHI reference data; RLS + read policy defined in migration 162.');
  out.push('-- ============================================================================');
  out.push('');

  fs.writeFileSync(outPath, out.join('\n'), 'utf8');
  console.log(
    `Wrote ${rows.length} rows (${chunks.length} chunks, skipped ${skippedExtension} X/V) → ${outPath}`,
  );
}

main();
