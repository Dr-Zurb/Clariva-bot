import { describe, it, expect } from '@jest/globals';
import {
  matchServiceCatalogOffering,
  resolveCatalogOfferingByKey,
  runDeterministicServiceCatalogMatchStageA,
  pickSuggestedModality,
  buildServiceCatalogLlmSystemPrompt,
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
