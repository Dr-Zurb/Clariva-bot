/**
 * LANG6-D2-B: apply an *approved* locale-arm JSON into the copy module.
 *
 * Usage:
 *   npx ts-node scripts/apply-locale-arms.ts --family non-text-ack
 *
 * Refuses drafts that are not status=approved. Does not call any LLM.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getCatalogEntry } from '../locale-arms/catalog';

interface ApprovedArm {
  familyId: string;
  status: string;
  en: string;
  hi: string;
  pa: string;
  placeholders?: string[];
}

function parseArgs(argv: string[]): { familyId: string | null } {
  let familyId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--family') familyId = argv[++i] ?? null;
  }
  return { familyId };
}

function assertPlaceholders(en: string, localized: string): void {
  for (const p of en.match(/\$\{[^}]+\}/g) ?? []) {
    if (!localized.includes(p)) {
      throw new Error(`Placeholder ${p} missing from approved arm`);
    }
  }
}

function applyNonTextAck(arm: ApprovedArm): void {
  const path = join(__dirname, '../src/utils/dm-copy.ts');
  const src = readFileSync(path, 'utf8');
  const block = `const NON_TEXT_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: NON_TEXT_ACK_EN,
  // Reviewed — lang-25 proof family (warm receptionist register).
  hi: ${JSON.stringify(arm.hi)},
  pa: ${JSON.stringify(arm.pa)},
};`;
  const re =
    /const NON_TEXT_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = \{[\s\S]*?\};/;
  if (!re.test(src)) {
    throw new Error('NON_TEXT_ACK_COPY block not found in dm-copy.ts');
  }
  if (!src.includes(`export const NON_TEXT_ACK_EN =\n  ${JSON.stringify(arm.en)}`) &&
      !src.includes(`export const NON_TEXT_ACK_EN =\n  "${arm.en.replace(/"/g, '\\"')}"`) &&
      !src.includes(arm.en)) {
    throw new Error('Approved en arm does not match NON_TEXT_ACK_EN in dm-copy.ts — refusing to rewrite English');
  }
  writeFileSync(path, src.replace(re, block), 'utf8');
  console.log('Updated NON_TEXT_ACK_COPY in src/utils/dm-copy.ts');
}

function main(): void {
  const { familyId } = parseArgs(process.argv.slice(2));
  if (!familyId) {
    console.error('Usage: --family <id>');
    process.exit(1);
  }
  const entry = getCatalogEntry(familyId);
  if (!entry) {
    console.error(`Unknown family: ${familyId}`);
    process.exit(1);
  }
  const approvedPath = join(__dirname, '../locale-arms/approved', `${familyId}.json`);
  const arm = JSON.parse(readFileSync(approvedPath, 'utf8')) as ApprovedArm;
  if (arm.status !== 'approved') {
    throw new Error(`${approvedPath} status must be "approved" (got ${arm.status})`);
  }
  if (arm.en !== entry.en) {
    throw new Error('Approved en differs from catalog — English rewrite is out of scope');
  }
  assertPlaceholders(arm.en, arm.hi);
  assertPlaceholders(arm.en, arm.pa);

  if (familyId === 'non-text-ack') {
    applyNonTextAck(arm);
  } else {
    throw new Error(`Apply not implemented for family ${familyId} yet (lang-26+)`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
