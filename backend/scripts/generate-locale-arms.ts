/**
 * LANG6-D2-B: generate locale-arm drafts (templates only — no PHI).
 *
 * Usage:
 *   npx ts-node scripts/generate-locale-arms.ts --family non-text-ack
 *   npx ts-node scripts/generate-locale-arms.ts --family non-text-ack --llm
 *
 * Output: locale-arms/drafts/<familyId>.draft.json
 * Never writes into src/ copy modules (apply step is separate).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getCatalogEntry, LOCALE_ARM_CATALOG } from '../locale-arms/catalog';
import { getOpenAIClient, getOpenAIConfig } from '../src/config/openai';

const FEW_SHOT_REGISTER = `
Register (LANG6-D6): warm clinic receptionist. Conversational, not literary.
Roman Hindi example already shipping: "Jab aap **appointment book** karna chahein, yahan **book appointment** likhein—hum aage help karenge."
Keep clinical/English loanwords patients use (appointment, images, voice notes) in English inside the sentence.
Protected tokens (LANG3-D6): do not translate ₹ amounts, URLs, MRNs, phone numbers, or practice names.
Placeholders like \${name} must appear byte-identical in every locale.
`.trim();

function parseArgs(argv: string[]): { familyId: string | null; llm: boolean; list: boolean } {
  let familyId: string | null = null;
  let llm = false;
  let list = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') list = true;
    else if (a === '--llm') llm = true;
    else if (a === '--family') familyId = argv[++i] ?? null;
  }
  return { familyId, llm, list };
}

async function draftWithLlm(
  en: string,
  target: 'hi' | 'pa'
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY not set — omit --llm for seed drafts from catalog');
  }
  const config = getOpenAIConfig();
  const langLabel = target === 'hi' ? 'Roman Hindi (Hinglish, Latin script)' : 'Roman Punjabi (Latin script)';
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.3,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content:
          `You translate clinic Instagram DM copy into ${langLabel}.\n${FEW_SHOT_REGISTER}\n` +
          'Return ONLY the translated string, no quotes or commentary.',
      },
      { role: 'user', content: en },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty LLM translation');
  return text;
}

/** Deterministic seed drafts (no network) — used when --llm is off. */
function seedDraft(en: string, familyId: string): { hi: string; pa: string } {
  if (familyId === 'non-text-ack') {
    return {
      hi: "Main abhi images ya voice notes nahi padh sakta — apna message type karke bhejein? Main aage dekh lunga.",
      pa: "Main hun images ya voice notes nahi padh sakda — apna message type karke bhejo? Main aage dekh lavanga.",
    };
  }
  return {
    hi: `[DRAFT hi — translate] ${en}`,
    pa: `[DRAFT pa — translate] ${en}`,
  };
}

function assertPlaceholdersIntact(en: string, localized: string): void {
  const placeholders = en.match(/\$\{[^}]+\}/g) ?? [];
  for (const p of placeholders) {
    if (!localized.includes(p)) {
      throw new Error(`Placeholder ${p} missing from draft locale arm`);
    }
  }
}

async function main(): Promise<void> {
  const { familyId, llm, list } = parseArgs(process.argv.slice(2));
  if (list) {
    for (const e of LOCALE_ARM_CATALOG) {
      console.log(`${e.familyId}\t${e.builder}\tphi=${e.phi}`);
    }
    return;
  }
  if (!familyId) {
    console.error('Usage: --family <id> [--llm] | --list');
    process.exit(1);
  }
  const entry = getCatalogEntry(familyId);
  if (!entry) {
    console.error(`Unknown family: ${familyId}. Use --list.`);
    process.exit(1);
  }

  // PHI guarantee: catalog English is a template; never load patient rows here.
  let hi: string;
  let pa: string;
  if (llm) {
    hi = await draftWithLlm(entry.en, 'hi');
    pa = await draftWithLlm(entry.en, 'pa');
  } else {
    ({ hi, pa } = seedDraft(entry.en, familyId));
  }
  assertPlaceholdersIntact(entry.en, hi);
  assertPlaceholdersIntact(entry.en, pa);

  const draft = {
    familyId: entry.familyId,
    builder: entry.builder,
    status: 'draft' as const,
    phi: entry.phi,
    notes:
      'Templates only (LANG6-D3). Review whole family, then copy to approved/ and run locale-arms:apply.',
    en: entry.en,
    hi,
    pa,
    placeholders: entry.en.match(/\$\{[^}]+\}/g) ?? [],
  };

  const outDir = join(__dirname, '../locale-arms/drafts');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${familyId}.draft.json`);
  writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
