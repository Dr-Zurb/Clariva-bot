/**
 * lang-24 close gate: patient-facing DM literals must not reappear outside
 * locale-dispatched copy modules (or the English-only exception list).
 *
 * A one-off grep passes once; this test keeps the next contributor honest.
 */

import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  buildLlmEmptyFallbackMessage,
  DM_COPY_ENGLISH_ONLY_EXCEPTIONS,
  DM_COPY_PHI_REGISTRY,
  FALLBACK_REPLY_EN,
} from '../../../src/utils/dm-copy';

const SRC_ROOT = join(__dirname, '../../../src');

/** Locale-dispatched (or English-only legal) copy homes — literals allowed here. */
const ALLOWED_COPY_REL_PATHS = new Set([
  'utils/dm-copy.ts',
  'utils/booking-link-copy.ts',
  'utils/staff-service-review-dm.ts',
  'utils/safety-messages.ts',
  'utils/reason-first-triage.ts',
  'utils/consultation-fees.ts',
  'utils/complaint-clarification.ts',
  'utils/dm-reply-composer.ts',
  'utils/dm-appointment-status.ts',
  'utils/booking-consent-context.ts',
  'utils/post-medical-ack-copy.ts',
]);

/**
 * Byte-identical English strings migrated in p5 (lang-20…23) + lang-24 LLM fallback.
 * Must not appear as raw literals outside allowed modules (exception-list texts excluded).
 */
const MIGRATED_EN_SNIPPETS: readonly string[] = [
  FALLBACK_REPLY_EN,
  DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text,
  'I see your messages — give me a moment to respond.',
  'Would you like to book one for yourself now?',
  "I had trouble saving your details — please reply **Yes** again to retry, or say 'book appointment' to re-share them.",
  'You expressed interest in booking.',
  'Right now we offer **teleconsult** only (text, voice, or video) — which works best for you?',
  buildLlmEmptyFallbackMessage({ language: 'en' }),
  'Open this link to get an appointment:',
  'Join the queue for your visit here:',
  "We're still confirming with",
  'Our team will reply here **soon**.',
  "Our team hasn't responded to your booking review yet",
  'You selected **',
  'Your appointment has been rescheduled to **',
  'Welcome back, **',
  'Great to hear from you again.',
  "Done. I've removed your personal information from our records.",
  "No problem. I haven't saved any of your information.",
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function isAllowedCopyFile(absPath: string): boolean {
  const rel = relative(SRC_ROOT, absPath).replace(/\\/g, '/');
  return ALLOWED_COPY_REL_PATHS.has(rel);
}

describe('lang-24 p5 copy-coverage sweep', () => {
  const scanned = walkTsFiles(join(SRC_ROOT, 'workers')).concat(
    walkTsFiles(join(SRC_ROOT, 'services')),
    walkTsFiles(join(SRC_ROOT, 'utils'))
  );

  it('scans workers + services + utils', () => {
    expect(scanned.length).toBeGreaterThan(50);
  });

  it('migrated English snippets do not reappear outside allowed copy modules', () => {
    const violations: string[] = [];
    for (const file of scanned) {
      if (isAllowedCopyFile(file)) continue;
      const src = readFileSync(file, 'utf8');
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');
      for (const snippet of MIGRATED_EN_SNIPPETS) {
        if (!snippet || snippet.length < 12) continue;
        if (!src.includes(snippet)) continue;
        // Exception-list constants may re-export the English text by design.
        if (
          snippet === FALLBACK_REPLY_EN &&
          (rel.includes('run-conversation-turn.ts') ||
            rel.includes('instagram-dm-webhook-handler.ts') ||
            rel.includes('instagram-service.ts'))
        ) {
          // FALLBACK_REPLY / COMMENT_PUBLIC_REPLY re-exports — still English-only contract.
          continue;
        }
        if (
          snippet === DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.text &&
          rel.includes('instagram-service.ts')
        ) {
          continue;
        }
        violations.push(`${rel} contains migrated snippet: ${snippet.slice(0, 60)}…`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('DM stage handlers do not assign replyText from a raw English string literal', () => {
    const stageDir = join(SRC_ROOT, 'workers/dm/stages');
    const stageFiles = walkTsFiles(stageDir);
    // Quote must open on a letter (not `${…}` template glue).
    const badAssign =
      /replyText\s*=\s*(['"])[A-Za-z][^'"]{11,}\1|replyText\s*=\s*`[A-Za-z][^`]{11,}`/;
    const hits: string[] = [];
    for (const file of stageFiles) {
      const src = readFileSync(file, 'utf8');
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (badAssign.test(src)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  it('PHI registry covers every p5 builder entry (machine-readable for lang-25)', () => {
    const values = Object.values(DM_COPY_PHI_REGISTRY);
    expect(values.length).toBeGreaterThan(20);
    for (const v of values) {
      expect(typeof v).toBe('boolean');
    }
    expect(DM_COPY_PHI_REGISTRY.buildWelcomeBackSegmentMessage).toBe(true);
    expect(DM_COPY_PHI_REGISTRY.buildPatientMatchConfirmMessage).toBe(true);
    expect(DM_COPY_PHI_REGISTRY.buildLlmEmptyFallbackMessage).toBe(false);
  });

  it('English-only exception list has a reason for every entry', () => {
    for (const [key, entry] of Object.entries(DM_COPY_ENGLISH_ONLY_EXCEPTIONS)) {
      expect(entry.reason.trim().length).toBeGreaterThan(10);
      expect(entry.text.trim().length).toBeGreaterThan(5);
      expect(key.length).toBeGreaterThan(3);
    }
  });

  it('lang-28: enAllLocales symbol removed from dm-copy.ts (LANG3-D4 discharged)', () => {
    const src = readFileSync(join(SRC_ROOT, 'utils/dm-copy.ts'), 'utf8');
    expect(src).not.toMatch(/\benAllLocales\b/);
  });
});
