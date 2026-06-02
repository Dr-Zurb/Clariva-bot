import { describe, it, expect } from '@jest/globals';
import {
  matchServiceCatalogOffering,
  resolveCatalogOfferingByKey,
  runDeterministicServiceCatalogMatchStageA,
  pickSuggestedModality,
  buildServiceCatalogLlmSystemPrompt,
  detectSiblingExampleOverlaps,
  type ServiceCatalogMatchMetricEvent,
} from '../../../src/services/service-catalog-matcher';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../../../src/types/conversation';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const sid = (key: string) => deterministicServiceIdForLegacyOffering('matcher-test-doc', key);

function catalogSkinGpOther(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Dermatology',
        modalities: {
          video: { enabled: true, price_minor: 100_00 },
        },
      },
      {
        service_id: sid('gp'),
        service_key: 'gp',
        label: 'General physician',
        modalities: {
          text: { enabled: true, price_minor: 50_00 },
          video: { enabled: true, price_minor: 80_00 },
        },
      },
      {
        service_id: sid('other'),
        service_key: 'other',
        label: 'Other / not listed',
        modalities: {
          video: { enabled: true, price_minor: 90_00 },
        },
      },
    ],
  };
}

describe('service-catalog-matcher (ARM-04)', () => {
  const correlationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  it('buildServiceCatalogLlmSystemPrompt includes doctor_matcher_hints when set', () => {
    const cat = catalogSkinGpOther();
    const gp = cat.services.find((s) => s.service_key === 'gp');
    expect(gp).toBeDefined();
    gp!.matcher_hints = {
      keywords: 'checkup, fatigue',
      include_when: 'Prefer this row when multiple chronic and acute issues together',
    };
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    expect(p).toContain('doctor_matcher_hints');
    expect(p).toContain('checkup');
    expect(p).toContain('include_when=');
  });

  it('buildServiceCatalogLlmSystemPrompt encodes strict hint-aware matching policy', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    expect(p).toContain('When a row HAS doctor_matcher_hints');
    expect(p).toContain('follow them strictly');
    expect(p).toContain('When a row has NO doctor_matcher_hints');
    expect(p).toContain('unambiguous, specific fit');
    expect(p).toContain('Do NOT infer a broader scope from the label name alone');
  });

  it('buildServiceCatalogLlmSystemPrompt includes mixed-complaint guidance', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    expect(p).toContain('multiple unrelated complaints');
    expect(p).toContain('most prominent or first-mentioned complaint');
    expect(p).toMatch(/Never stretch one row|do not stretch one row/i);
  });

  it('buildServiceCatalogLlmSystemPrompt caps high confidence on hint corroboration', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    expect(p).toContain('Confidence calibration');
    expect(p).toMatch(/"high"[^\n]*doctor_matcher_hints/);
    expect(p).toContain('label-only match');
    expect(p).toContain('is not sufficient for "high"');
    expect(p).toMatch(/"medium":[^\n]*no hints to corroborate/);
  });

  it('buildServiceCatalogLlmSystemPrompt forbids force-fitting to avoid "other"', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    expect(p).toContain('Do NOT force-fit');
    expect(p).toContain('just to avoid "other"');
  });

  it('buildServiceCatalogLlmSystemPrompt keeps specialty-aware rules for GP and narrow', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    expect(p).toContain('general medicine, family medicine, internal medicine, GP');
    expect(p).toContain('dermatology, cardiology');
    expect(p).toMatch(/general consult or checkup row if one exists/);
  });

  it('SFU-18: prompt tags every allowlist line with [scope: strict|flexible]', () => {
    const cat = catalogSkinGpOther();
    // skin: strict, gp: flexible, other: undefined (→ flexible default)
    const skin = cat.services.find((s) => s.service_key === 'skin')!;
    skin.scope_mode = 'strict';
    const gp = cat.services.find((s) => s.service_key === 'gp')!;
    gp.scope_mode = 'flexible';

    const p = buildServiceCatalogLlmSystemPrompt(cat);
    const lines = p.split('\n');
    const skinLine = lines.find((ln) => ln.trim().startsWith('- skin:'));
    const gpLine = lines.find((ln) => ln.trim().startsWith('- gp:'));
    const otherLine = lines.find((ln) => ln.trim().startsWith('- other:'));

    expect(skinLine).toBeDefined();
    expect(skinLine).toContain('[scope: strict]');
    expect(gpLine).toBeDefined();
    expect(gpLine).toContain('[scope: flexible]');
    // Undefined → normalized to flexible in prompt
    expect(otherLine).toBeDefined();
    expect(otherLine).toContain('[scope: flexible]');
  });

  it('SFU-18: prompt explains scope modes and composes with hint policy', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    // Scope-mode rule block exists and explains both modes
    expect(p).toContain('[scope: strict]');
    expect(p).toContain('[scope: flexible]');
    expect(p).toMatch(/ONLY when their complaint directly matches.*keywords or include_when hints/);
    expect(p).toContain('broader category matching is allowed');
    // Strict reinforces the "no label-only inference" rule
    expect(p).toMatch(/If that row is also \[scope: strict\]/);
    // Flexible still defers to exclude_when (rule 2)
    expect(p).toMatch(/exclude_when still applies/i);
  });

  it('buildServiceCatalogLlmSystemPrompt omits doctor_matcher_hints segment when all hints blank', () => {
    const cat = catalogSkinGpOther();
    const gp = cat.services.find((s) => s.service_key === 'gp')!;
    gp.matcher_hints = { keywords: '', include_when: '', exclude_when: '' };
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    const gpLine = p.split('\n').find((ln) => ln.trim().startsWith('- gp:'));
    expect(gpLine).toBeDefined();
    expect(gpLine).not.toContain('doctor_matcher_hints');
  });

  /**
   * Routing v2 (Plan 19-04, Task 04): the LLM-facing snippet now flows through
   * `resolveMatcherRouting`. v2 rows that only set `matcher_hints.examples` should
   * still feed the existing `keywords=…` channel so the prompt's matching policy
   * keeps binding without prompt-text changes.
   */
  it('routing v2: examples-only row serializes into keywords= for the LLM (no include_when leak)', () => {
    const cat = catalogSkinGpOther();
    const gp = cat.services.find((s) => s.service_key === 'gp')!;
    gp.matcher_hints = {
      examples: ['fever for 3 days', 'sore throat and cough', 'general checkup'],
    };
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    const gpLine = p.split('\n').find((ln) => ln.trim().startsWith('- gp:'));
    expect(gpLine).toBeDefined();
    expect(gpLine).toContain('doctor_matcher_hints');
    expect(gpLine).toContain('keywords=fever for 3 days, sore throat and cough, general checkup');
    expect(gpLine).not.toContain('include_when=');
  });

  it('routing v2: examples win over legacy keywords/include_when (no dual-feed in snippet)', () => {
    const cat = catalogSkinGpOther();
    const gp = cat.services.find((s) => s.service_key === 'gp')!;
    gp.matcher_hints = {
      examples: ['routine checkup', 'fatigue'],
      keywords: 'flu, viral',
      include_when: 'symptoms older than 1 day',
    };
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    const gpLine = p.split('\n').find((ln) => ln.trim().startsWith('- gp:'));
    expect(gpLine).toBeDefined();
    expect(gpLine).toContain('keywords=routine checkup, fatigue');
    expect(gpLine).not.toContain('flu');
    expect(gpLine).not.toContain('viral');
    expect(gpLine).not.toContain('include_when=');
  });

  it('routing v2: legacy-only row keeps the include_when= snippet (back-compat)', () => {
    const cat = catalogSkinGpOther();
    const gp = cat.services.find((s) => s.service_key === 'gp')!;
    gp.matcher_hints = {
      keywords: 'fever, cough',
      include_when: 'first-time visit',
      exclude_when: 'requires in-person exam',
    };
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    const gpLine = p.split('\n').find((ln) => ln.trim().startsWith('- gp:'));
    expect(gpLine).toBeDefined();
    expect(gpLine).toContain('keywords=fever, cough');
    expect(gpLine).toContain('include_when=first-time visit');
    expect(gpLine).toContain('exclude_when=requires in-person exam');
  });

  /**
   * Routing v2 / Phase 3 — Plan 19-04, Task 09 (hybrid).
   *
   * Phase 3 ships **prompt-only** sibling boundaries: a tie-breaker rule (rule 6) plus
   * an automatic "Disambiguation hints" section that surfaces tokens shared across two
   * or more rows' resolved example phrases. No new doctor-facing schema fields — the
   * LLM uses existing `examples` on each row plus the new contrast block to disambiguate.
   * The schema half (`confused_with_service_keys`, `prefer_other_when`) is deferred with
   * rationale in the plan; tests below pin the prompt-only behavior.
   */
  describe('Phase 3 sibling tie-breaker + disambiguation hints (Routing v2, Plan 19-04, Task 09)', () => {
    function catalogTwoSkinSiblings(): ServiceCatalogV1 {
      return {
        version: 1,
        services: [
          {
            service_id: sid('skin_consult'),
            service_key: 'skin_consult',
            label: 'Skin consultation',
            modalities: { video: { enabled: true, price_minor: 100_00 } },
            matcher_hints: { examples: ['skin issue', 'skin rash', 'acne flare'] },
          },
          {
            service_id: sid('skin_hair_combo'),
            service_key: 'skin_hair_combo',
            label: 'Skin + Hair combo',
            modalities: { video: { enabled: true, price_minor: 150_00 } },
            matcher_hints: { examples: ['skin and hair issue', 'hair fall with skin rash'] },
          },
          {
            service_id: sid('other'),
            service_key: 'other',
            label: 'Other / not listed',
            modalities: { video: { enabled: true, price_minor: 90_00 } },
          },
        ],
      };
    }

    it('detectSiblingExampleOverlaps: returns shared tokens with the rows that contain them, sorted', () => {
      const cat = catalogTwoSkinSiblings();
      const overlaps = detectSiblingExampleOverlaps(cat);

      const tokens = overlaps.map((o) => o.token);
      // Both "skin" and "rash" appear in both sibling rows; "issue" too. "acne", "hair",
      // "fall", "flare" only in one each → not surfaced.
      expect(tokens).toEqual(expect.arrayContaining(['skin', 'rash', 'issue']));
      const skin = overlaps.find((o) => o.token === 'skin');
      expect(skin?.serviceKeys).toEqual(['skin_consult', 'skin_hair_combo']);
      // Stable order: tokens sorted asc, service keys per token sorted asc.
      expect([...tokens].sort()).toEqual(tokens);
    });

    it('detectSiblingExampleOverlaps: excludes the catch-all row from overlap candidates', () => {
      const cat = catalogTwoSkinSiblings();
      cat.services.push({
        service_id: sid('other_dup'),
        service_key: 'other',
        label: 'Other (duplicate)',
        modalities: { video: { enabled: true, price_minor: 90_00 } },
        matcher_hints: { examples: ['skin issue'] },
      } as ServiceCatalogV1['services'][number]);

      const overlaps = detectSiblingExampleOverlaps(cat);
      const skin = overlaps.find((o) => o.token === 'skin');
      // Only the two real sibling rows — the catch-all (`other`) is filtered out even
      // when it carries example phrases that would otherwise match.
      expect(skin?.serviceKeys).toEqual(['skin_consult', 'skin_hair_combo']);
    });

    it('detectSiblingExampleOverlaps: returns empty when catalog has no overlapping tokens', () => {
      const cat = catalogSkinGpOther();
      const skin = cat.services.find((s) => s.service_key === 'skin')!;
      skin.matcher_hints = { examples: ['acne flare'] };
      const gp = cat.services.find((s) => s.service_key === 'gp')!;
      gp.matcher_hints = { examples: ['fever for three days'] };

      const overlaps = detectSiblingExampleOverlaps(cat);
      expect(overlaps).toEqual([]);
    });

    it('detectSiblingExampleOverlaps: ignores rows with no resolved example phrases (legacy include_when only does NOT synthesize overlap)', () => {
      const cat = catalogSkinGpOther();
      const skin = cat.services.find((s) => s.service_key === 'skin')!;
      skin.matcher_hints = { include_when: 'skin and hair issue' };
      const gp = cat.services.find((s) => s.service_key === 'gp')!;
      gp.matcher_hints = { include_when: 'skin issue and fever' };

      // Resolver yields examplePhrases=[] for both legacy include_when-only rows, so
      // the overlap detector must NOT promote `include_when` prose into shared tokens.
      const overlaps = detectSiblingExampleOverlaps(cat);
      expect(overlaps).toEqual([]);
    });

    it('detectSiblingExampleOverlaps: stop-words and short tokens are excluded', () => {
      const cat = catalogSkinGpOther();
      const skin = cat.services.find((s) => s.service_key === 'skin')!;
      // "the", "and", "for" are short or stop-words; "appointment" is shared and meaningful.
      skin.matcher_hints = { examples: ['the appointment for tomorrow'] };
      const gp = cat.services.find((s) => s.service_key === 'gp')!;
      gp.matcher_hints = { examples: ['the appointment for today'] };

      const tokens = detectSiblingExampleOverlaps(cat).map((o) => o.token);
      expect(tokens).toContain('appointment');
      // Filtered out: 'the' (3 chars), 'for' (3 chars), 'today'/'tomorrow' (stop-words).
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('for');
      expect(tokens).not.toContain('today');
      expect(tokens).not.toContain('tomorrow');
    });

    it('detectSiblingExampleOverlaps: caps at 5 entries with deterministic ordering', () => {
      const tokens = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'];
      const cat: ServiceCatalogV1 = {
        version: 1,
        services: [
          {
            service_id: sid('row_a'),
            service_key: 'row_a',
            label: 'A',
            modalities: { video: { enabled: true, price_minor: 100_00 } },
            matcher_hints: { examples: tokens.map((t) => `${t} thing`) },
          },
          {
            service_id: sid('row_b'),
            service_key: 'row_b',
            label: 'B',
            modalities: { video: { enabled: true, price_minor: 100_00 } },
            matcher_hints: { examples: tokens.map((t) => `${t} other`) },
          },
          {
            service_id: sid('other'),
            service_key: 'other',
            label: 'Other',
            modalities: { video: { enabled: true, price_minor: 90_00 } },
          },
        ],
      };

      const overlaps = detectSiblingExampleOverlaps(cat);
      expect(overlaps).toHaveLength(5);
      // Deterministic: token-asc order, first 5 of the alphabet.
      expect(overlaps.map((o) => o.token)).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    });

    it('buildServiceCatalogLlmSystemPrompt: injects "Disambiguation hints" block when sibling overlap exists', () => {
      const cat = catalogTwoSkinSiblings();
      const p = buildServiceCatalogLlmSystemPrompt(cat);

      // Rule 6 mentions "Disambiguation hints" in prose, so we anchor on the block-only
      // parenthetical header to prove the actual block was rendered.
      expect(p).toContain('Disambiguation hints (rows whose');
      expect(p).toContain("apply the sibling tie-breaker rule");
      // Block lists the shared token + the rows that share it.
      expect(p).toMatch(/"skin" appears in example phrases of rows: skin_consult, skin_hair_combo/);
      expect(p).toMatch(/"rash" appears in example phrases of rows: skin_consult, skin_hair_combo/);
    });

    it('buildServiceCatalogLlmSystemPrompt: omits "Disambiguation hints" block when no overlap (clean catalogs stay clean)', () => {
      const cat = catalogSkinGpOther();
      // Default catalog has no example phrases on any row → no overlap → no block.
      // Rule 6 still mentions "Disambiguation hints" in prose; we anchor on the
      // block-only parenthetical header that only appears when the block renders.
      const p = buildServiceCatalogLlmSystemPrompt(cat);
      expect(p).not.toContain('Disambiguation hints (rows whose');
    });

    it('buildServiceCatalogLlmSystemPrompt: encodes the new sibling tie-breaker rule (rule 6) and renumbers downstream rules', () => {
      const cat = catalogSkinGpOther();
      const p = buildServiceCatalogLlmSystemPrompt(cat);

      // Rule 6 is the new sibling tie-breaker.
      expect(p).toMatch(/6\. Sibling tie-breaker/);
      expect(p).toContain('more specific phrase that the patient text matched verbatim');
      expect(p).toContain('split the difference');
      // Rule 7 is now specialty-aware (was rule 6).
      expect(p).toMatch(/7\. Specialty-aware defaults/);
      expect(p).toContain('general medicine, family medicine, internal medicine, GP');
      // Rule 8 is now the "use other" fallback (was rule 7), and references rules 1–7.
      expect(p).toMatch(/8\. Use service_key "other" when no non-other row plausibly fits after applying rules 1–7/);
    });

    it('buildServiceCatalogLlmSystemPrompt: disambiguation block is positioned between Schema and Allowed service_key values', () => {
      const cat = catalogTwoSkinSiblings();
      const p = buildServiceCatalogLlmSystemPrompt(cat);

      const schemaIdx = p.indexOf('Schema:');
      // The literal block header is unique — rule 6 mentions "Disambiguation hints"
      // in prose, but only the rendered block has the parenthetical "(rows whose…".
      const disambigIdx = p.indexOf('Disambiguation hints (rows whose');
      const allowlistIdx = p.indexOf('Allowed service_key values:');

      expect(schemaIdx).toBeGreaterThan(-1);
      expect(disambigIdx).toBeGreaterThan(schemaIdx);
      expect(allowlistIdx).toBeGreaterThan(disambigIdx);
    });
  });

  it('skipLlm: competing buckets text falls back to catch-all without LLM', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'fasting blood sugar 209 and burning stomach pain',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('other');
    expect(r?.pendingStaffReview).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH);
  });

  it('returns null for empty catalog', async () => {
    const r = await matchServiceCatalogOffering(
      {
        catalog: null,
        reasonForVisitText: 'rash',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r).toBeNull();
  });

  it('Stage A: single non-catch offering + other → high, auto-finalize', async () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('only'),
          service_key: 'only_svc',
          label: 'Only specialty',
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
        {
          service_id: sid('other'),
          service_key: 'other',
          label: 'Other',
          modalities: { video: { enabled: true, price_minor: 50_00 } },
        },
      ],
    };
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'anything',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('only_svc');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.pendingStaffReview).toBe(false);
    expect(r?.source).toBe('deterministic');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_SERVICE_CATALOG);
  });

  it('Stage A: unique label substring → high, finalize', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'I need dermatology for a rash',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('skin');
    expect(r?.confidence).toBe('high');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH);
  });

  it('Stage A: ARM-02 matcher_hints unique winner → medium, staff review', async () => {
    const catalog = catalogSkinGpOther();
    catalog.services[1]!.matcher_hints = {
      keywords: 'fever, cold',
      include_when: '',
      exclude_when: '',
    };

    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'fever since yesterday',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('gp');
    expect(r?.confidence).toBe('medium');
    expect(r?.autoFinalize).toBe(false);
    expect(r?.pendingStaffReview).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.KEYWORD_HINT_MATCH);
  });

  it('skipLlm + no Stage A match → fallback other, low', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'something vague',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.catalogServiceKey).toBe('other');
    expect(r?.confidence).toBe('low');
    expect(r?.source).toBe('fallback');
    expect(r?.pendingStaffReview).toBe(true);
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH);
  });

  it('mock LLM returns valid key → llm source', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'unclear symptoms',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'skin',
            modality: 'video',
            match_confidence: 'high',
          }),
      }
    );
    expect(r?.source).toBe('llm');
    expect(r?.catalogServiceKey).toBe('skin');
    expect(r?.autoFinalize).toBe(true);
    expect(r?.suggestedModality).toBe('video');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SERVICE_MATCH_LLM);
  });

  it('Task 05: prompt schema and rules include mixed_complaints flag', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);

    // Schema line explicitly contains the field.
    expect(p).toMatch(/"mixed_complaints":\s*true\|false/);
    // Rule explains when to set it true (unrelated) vs false (related symptom cluster).
    expect(p).toMatch(/mixed_complaints"?:\s*true/i);
    expect(p).toMatch(/clinically UNRELATED/i);
    expect(p).toMatch(/cough\s*\+\s*fever\s*\+\s*sore throat/);
    expect(p).toMatch(/advisory/i);
  });

  it('Task 05: LLM response with mixed_complaints=true surfaces flag on result', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'multiple unrelated concerns today',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'low',
            mixed_complaints: true,
          }),
      }
    );
    expect(r?.source).toBe('llm');
    expect(r?.catalogServiceKey).toBe('gp');
    expect(r?.confidence).toBe('low');
    expect(r?.mixedComplaints).toBe(true);
  });

  it('Task 05: LLM response without mixed_complaints defaults to false', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'cough and fever',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'medium',
            // mixed_complaints omitted
          }),
      }
    );
    expect(r?.source).toBe('llm');
    expect(r?.mixedComplaints).toBe(false);
  });

  it('Task 05: deterministic path always reports mixedComplaints=false', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'I need dermatology for a rash',
        correlationId,
      },
      { skipLlm: true }
    );
    expect(r?.source).toBe('deterministic');
    expect(r?.mixedComplaints).toBe(false);
    expect(r?.concerns).toBeUndefined();
  });

  it('Task 09: prompt schema and rules include concerns array spec', () => {
    const cat = catalogSkinGpOther();
    const p = buildServiceCatalogLlmSystemPrompt(cat);
    expect(p).toMatch(/"concerns":\s*\["<label1>"/);
    expect(p).toMatch(/≤\s*40\s*characters/i);
    expect(p).toMatch(/only when mixed_complaints is true/i);
    expect(p).toMatch(/omit the "concerns" field entirely/i);
  });

  it('Task 09: LLM response with mixed_complaints=true + concerns surfaces the list', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        // Neutral reason text so Stage A doesn't short-circuit into a deterministic match; we
        // need the LLM path here to exercise `concerns` surfacing.
        reasonForVisitText: 'multiple things to discuss',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'low',
            mixed_complaints: true,
            concerns: ['Headache', 'Diabetes follow-up', 'Skin rash'],
          }),
      }
    );
    expect(r?.mixedComplaints).toBe(true);
    expect(r?.concerns).toEqual(['Headache', 'Diabetes follow-up', 'Skin rash']);
  });

  it('Task 09: LLM concerns list is trimmed to ≤ 40 chars per entry and capped at 5', async () => {
    const catalog = catalogSkinGpOther();
    const longLabel = 'This is a very long complaint description that absolutely must be truncated';
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'lots of things',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'low',
            mixed_complaints: true,
            concerns: [longLabel, 'A', 'B', 'C', 'D', 'E', 'F'],
          }),
      }
    );
    expect(r?.concerns).toBeDefined();
    expect(r!.concerns!.length).toBeLessThanOrEqual(5);
    for (const c of r!.concerns!) {
      expect(c.length).toBeLessThanOrEqual(40);
    }
    expect(r!.concerns![0].endsWith('…')).toBe(true);
  });

  it('Task 09: LLM concerns list is deduped case-insensitively (first occurrence wins)', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'duplicates in llm output',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'low',
            mixed_complaints: true,
            concerns: ['Headache', 'headache', 'HEADACHE', 'Back pain'],
          }),
      }
    );
    expect(r?.concerns).toEqual(['Headache', 'Back pain']);
  });

  it('Task 09: concerns is ignored when mixed_complaints=false (hallucinated list)', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'cough and fever',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'medium',
            mixed_complaints: false,
            concerns: ['Headache', 'Back pain'],
          }),
      }
    );
    expect(r?.mixedComplaints).toBe(false);
    expect(r?.concerns).toBeUndefined();
  });

  it('Task 09: concerns drops non-string / empty entries and returns undefined when < 2 valid remain', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'edge case',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'gp',
            modality: 'video',
            match_confidence: 'low',
            mixed_complaints: true,
            concerns: ['Headache', 42, '', '   ', null],
          }),
      }
    );
    expect(r?.mixedComplaints).toBe(true);
    expect(r?.concerns).toBeUndefined();
  });

  it('Task 09: single-fee short-circuit reports concerns=undefined', async () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('consultation'),
          service_key: 'consultation',
          label: 'Consultation',
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
      ],
    };
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'anything',
        correlationId,
        catalogMode: 'single_fee',
      },
      { skipLlm: true }
    );
    expect(r?.mixedComplaints).toBe(false);
    expect(r?.concerns).toBeUndefined();
  });

  it('mock LLM returns hallucinated key → fallback other', async () => {
    const catalog = catalogSkinGpOther();
    const r = await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'test',
        correlationId,
      },
      {
        skipLlm: false,
        runLlm: async () =>
          JSON.stringify({
            service_key: 'fake_neurology',
            modality: null,
            match_confidence: 'high',
          }),
      }
    );
    expect(r?.catalogServiceKey).toBe('other');
    expect(r?.source).toBe('fallback');
    expect(r?.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.MATCHER_ERROR);
  });

  it('resolveCatalogOfferingByKey rejects unknown key', () => {
    const catalog = catalogSkinGpOther();
    expect(resolveCatalogOfferingByKey(catalog, 'nope')).toBeNull();
    expect(resolveCatalogOfferingByKey(catalog, 'skin')?.service_key).toBe('skin');
  });

  it('pickSuggestedModality returns undefined when multiple enabled', () => {
    const catalog = catalogSkinGpOther();
    const gp = catalog.services.find((s) => s.service_key === 'gp')!;
    expect(pickSuggestedModality(gp)).toBeUndefined();
    const skin = catalog.services.find((s) => s.service_key === 'skin')!;
    expect(pickSuggestedModality(skin)).toBe('video');
  });

  it('metrics hook receives events', async () => {
    const catalog = catalogSkinGpOther();
    const events: ServiceCatalogMatchMetricEvent[] = [];
    await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'dermatology',
        correlationId,
      },
      {
        skipLlm: true,
        metrics: (e) => events.push(e),
      }
    );
    expect(events.length).toBe(1);
    expect(events[0]!.source).toBe('deterministic');
    expect(events[0]!.llmParseFailed).toBe(false);
  });

  it('runDeterministicServiceCatalogMatchStageA returns null when ambiguous hints tie', () => {
    const catalog = catalogSkinGpOther();
    catalog.services[0]!.matcher_hints = { keywords: 'pain' };
    catalog.services[1]!.matcher_hints = { keywords: 'pain' };
    const a = runDeterministicServiceCatalogMatchStageA(catalog, 'pain in body');
    expect(a).toBeNull();
  });

  it('Stage A: unique description substring → medium, staff review', () => {
    const catalog = catalogSkinGpOther();
    catalog.services[1]!.description =
      'acute fevers colds and general symptoms evaluation in person or video';
    const a = runDeterministicServiceCatalogMatchStageA(
      catalog,
      'acute fevers colds and general symptoms evaluation in person or video please'
    );
    expect(a?.offering.service_key).toBe('gp');
    expect(a?.confidence).toBe('medium');
    expect(a?.autoFinalize).toBe(false);
  });

  it('buildServiceCatalogLlmSystemPrompt includes practice and specialty', () => {
    const catalog = catalogSkinGpOther();
    const prompt = buildServiceCatalogLlmSystemPrompt(catalog, {
      practiceName: "Dr Zurb's Clinic",
      specialty: 'General medicine',
    });
    expect(prompt).toContain("Dr Zurb's Clinic");
    expect(prompt).toContain('General medicine');
    expect(prompt).toContain('Allowed service_key values:');
  });

  it('passes doctorProfile through to LLM system prompt', async () => {
    const catalog = catalogSkinGpOther();
    let seen = '';
    await matchServiceCatalogOffering(
      {
        catalog,
        reasonForVisitText: 'headache',
        correlationId,
        doctorProfile: { specialty: 'General medicine', practiceName: 'Clinic A' },
      },
      {
        runLlm: async ({ systemPrompt }) => {
          seen = systemPrompt;
          return JSON.stringify({ service_key: 'gp', modality: null, match_confidence: 'high' });
        },
      }
    );
    expect(seen).toContain('General medicine');
    expect(seen).toContain('Clinic A');
  });

  // Task 10 (Plan 03): mode-aware short-circuit. Single-fee doctors get a synthetic one-entry
  // catalog (Task 09) — the matcher must return that entry immediately with `SINGLE_FEE_MODE`
  // reason code and never invoke the deterministic/LLM paths.
  describe('Task 10: catalog_mode="single_fee" short-circuit', () => {
    function catalogSingleFee(): ServiceCatalogV1 {
      return {
        version: 1,
        services: [
          {
            service_id: sid('consultation'),
            service_key: 'consultation',
            label: 'Consultation',
            modalities: {
              text: { enabled: true, price_minor: 500_00 },
              voice: { enabled: true, price_minor: 500_00 },
              video: { enabled: true, price_minor: 500_00 },
            },
          },
        ],
      };
    }

    it('returns the synthetic single-service result without invoking the LLM', async () => {
      const catalog = catalogSingleFee();
      let llmCalls = 0;
      const r = await matchServiceCatalogOffering(
        {
          catalog,
          reasonForVisitText: 'I have a rash and also some back pain',
          correlationId,
          catalogMode: 'single_fee',
          doctorId: 'doc-single-fee',
        },
        {
          skipLlm: false,
          runLlm: async () => {
            llmCalls += 1;
            return JSON.stringify({ service_key: 'other', modality: null, match_confidence: 'high' });
          },
        }
      );
      expect(r).not.toBeNull();
      expect(r!.catalogServiceKey).toBe('consultation');
      expect(r!.confidence).toBe('high');
      expect(r!.source).toBe('deterministic');
      expect(r!.autoFinalize).toBe(true);
      expect(r!.pendingStaffReview).toBe(false);
      expect(r!.mixedComplaints).toBe(false);
      expect(r!.reasonCodes).toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE);
      expect(llmCalls).toBe(0);
    });

    it('keeps the existing (deterministic/LLM) path for catalog_mode="multi_service"', async () => {
      const catalog = catalogSkinGpOther();
      const r = await matchServiceCatalogOffering(
        {
          catalog,
          reasonForVisitText: 'dermatology rash',
          correlationId,
          catalogMode: 'multi_service',
        },
        { skipLlm: true }
      );
      expect(r?.source).toBe('deterministic');
      expect(r?.reasonCodes).not.toContain(SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE);
    });

    it('keeps the existing path when catalog_mode is null/undefined', async () => {
      const catalog = catalogSkinGpOther();
      const rNull = await matchServiceCatalogOffering(
        {
          catalog,
          reasonForVisitText: 'dermatology rash',
          correlationId,
          catalogMode: null,
        },
        { skipLlm: true }
      );
      expect(rNull?.reasonCodes).not.toContain(
        SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE
      );

      const rMissing = await matchServiceCatalogOffering(
        {
          catalog,
          reasonForVisitText: 'dermatology rash',
          correlationId,
        },
        { skipLlm: true }
      );
      expect(rMissing?.reasonCodes).not.toContain(
        SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE
      );
    });
  });
});
