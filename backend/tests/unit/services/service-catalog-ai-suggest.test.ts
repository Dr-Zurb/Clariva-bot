/**
 * Plan 02 / Task 06 — unit tests for service-catalog-ai-suggest.
 *
 * Covers:
 *   - Mode dispatch (single_card / starter / review)
 *   - Server-side guards:
 *     1. serviceOfferingV1Schema.parse runs on every card
 *     2. catch-all key is force-flexible (and rejected in single_card mode)
 *     3. modalities filtered against doctor's `consultation_types`
 *     4. per-modality prices clamped to [0.3x, 1.5x] of appointment_fee_minor
 *   - 422 AiSuggestProfileIncompleteError when specialty missing
 *   - Empty catalog → review returns the gap issue without calling the LLM
 *   - Starter mode auto-injects catch-all when LLM forgets it
 *   - Malformed JSON / missing "cards" / missing "issues" map to InternalError
 *   - ValidationError on unknown mode / required-payload-missing for single_card
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the doctor-settings-service before importing the SUT so that the SUT
// picks up the mock when it does its own module-level import.
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettingsForUser: jest.fn(),
}));

// Mock audit logger so tests don't try to write to a real DB.
jest.mock('../../../src/utils/audit-logger', () => ({
  logAIClassification: jest.fn(async () => undefined),
}));

// Plan service-catalog-matcher-routing-v2 / Task 12: tests below exercise the
// real `defaultRunAiSuggestLlm` path (per-mode `max_completion_tokens` lookup +
// `finish_reason: 'length'` truncation handling). We mock the OpenAI config so
// `getOpenAIClient()` returns a stub whose `chat.completions.create` we can
// program per-test without an API key. Tests that inject `runLlm` via options
// are unaffected — they bypass the default runner entirely.
// Cast through `unknown` so per-test `mockResolvedValue` calls accept any
// completion shape — the real OpenAI SDK return type is large and we only
// project a handful of fields in `defaultRunAiSuggestLlm`.
const mockChatCompletionsCreate = jest.fn(
  async (_args: unknown): Promise<unknown> => undefined
);
jest.mock('../../../src/config/openai', () => ({
  getOpenAIClient: jest.fn(() => ({
    chat: { completions: { create: mockChatCompletionsCreate } },
  })),
  getOpenAIConfig: jest.fn(() => ({ model: 'gpt-test', maxTokens: 256 })),
}));

import {
  AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE,
  AiSuggestProfileIncompleteError,
  buildReviewPrompt,
  buildSingleCardPrompt,
  buildStarterCatalogPrompt,
  generateAiCatalogSuggestion,
  loadAiSuggestContext,
  MODALITY_RULE_BLOCK,
  PRICING_RULE_BLOCK,
  REGIONAL_TERMINOLOGY_RULE_BLOCK,
  runDeterministicCatalogReview,
  SCOPE_MODE_RULE_BLOCK,
  type AiSuggestContext,
  type AiSuggestRunLlm,
} from '../../../src/services/service-catalog-ai-suggest';
import * as auditLogger from '../../../src/utils/audit-logger';
import {
  DETERMINISTIC_ISSUE_TYPES,
  LLM_ISSUE_TYPES,
} from '../../../src/types/catalog-quality-issues';
import { InternalError, ValidationError } from '../../../src/utils/errors';
import {
  CATALOG_CATCH_ALL_SERVICE_KEY,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';
import * as doctorSettingsService from '../../../src/services/doctor-settings-service';
import { aiSuggestRequestSchemaForTests } from '../../../src/routes/api/v1/catalog';

const mockedGetDoctorSettingsForUser = (
  doctorSettingsService as unknown as { getDoctorSettingsForUser: jest.Mock }
).getDoctorSettingsForUser;

const correlationId = 'corr-aisuggest-test-001';
const doctorId = '550e8400-e29b-41d4-a716-446655440099';

interface DoctorSettingsRowLike {
  doctor_id: string;
  appointment_fee_minor: number | null;
  appointment_fee_currency: string | null;
  country: string | null;
  practice_name: string | null;
  specialty: string | null;
  address_summary: string | null;
  consultation_types: string | null;
  service_offerings_json: unknown;
  // remaining DoctorSettingsRow fields can stay undefined for our tests since
  // we only project the subset listed above into AiSuggestContext.
}

function settingsFixture(overrides: Partial<DoctorSettingsRowLike> = {}): DoctorSettingsRowLike {
  return {
    doctor_id: doctorId,
    appointment_fee_minor: 50000, // ₹500 base
    appointment_fee_currency: 'INR',
    country: 'IN',
    practice_name: 'Test Clinic',
    specialty: 'Dermatology',
    address_summary: 'Bengaluru, KA',
    consultation_types: 'Video, Voice',
    service_offerings_json: null,
    ...overrides,
  };
}

function makeStubLlm(jsonByMode: Record<string, string>): AiSuggestRunLlm {
  // The SUT only sends a system prompt — we infer mode by scanning prompt content.
  return jest.fn(async (params: { systemPrompt: string; correlationId: string }) => {
    const p = params.systemPrompt;
    if (p.includes('You generate ONE service card')) return jsonByMode.single_card ?? null;
    if (p.includes('You generate a starter teleconsultation catalog')) return jsonByMode.starter ?? null;
    if (p.includes('You audit a doctor')) return jsonByMode.review ?? null;
    return null;
  }) as unknown as AiSuggestRunLlm;
}

beforeEach(() => {
  mockedGetDoctorSettingsForUser.mockReset();
});

describe('loadAiSuggestContext (Task 06)', () => {
  it('throws AiSuggestProfileIncompleteError (422) when specialty is missing', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture({ specialty: null }) as never);
    await expect(loadAiSuggestContext(doctorId, doctorId, correlationId)).rejects.toMatchObject({
      statusCode: 422,
      missing: ['specialty'],
    });
  });

  it('hydrates non-PHI fields from doctor_settings', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        consultation_types: '  Video only  ',
        practice_name: '  Asha Skin Care  ',
        country: ' IN ',
      }) as never
    );
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId);
    expect(ctx.specialty).toBe('Dermatology');
    expect(ctx.practiceName).toBe('Asha Skin Care');
    expect(ctx.country).toBe('IN');
    expect(ctx.consultationTypes).toBe('Video only');
    expect(ctx.appointmentFeeMinor).toBe(50000);
    expect(ctx.appointmentFeeCurrency).toBe('INR');
    expect(ctx.catalog).toBeNull(); // service_offerings_json is null in fixture
  });
});

describe('prompt builders (Task 06)', () => {
  const ctx: AiSuggestContext = {
    doctorId,
    specialty: 'Dermatology',
    practiceName: 'Test Clinic',
    addressSummary: 'Bengaluru, KA',
    country: 'IN',
    consultationTypes: 'Video, Voice',
    appointmentFeeMinor: 50000,
    appointmentFeeCurrency: 'INR',
    catalog: null,
  };

  it('every prompt embeds the four shared rule blocks', () => {
    for (const builder of [
      () => buildSingleCardPrompt(ctx, { label: 'Acne consult' }),
      () => buildStarterCatalogPrompt(ctx),
      () => buildReviewPrompt(ctx),
    ]) {
      const out = builder();
      expect(out).toContain(SCOPE_MODE_RULE_BLOCK);
      expect(out).toContain(MODALITY_RULE_BLOCK);
      expect(out).toContain(PRICING_RULE_BLOCK);
      expect(out).toContain(REGIONAL_TERMINOLOGY_RULE_BLOCK);
    }
  });

  it('single_card prompt forbids reusing the catch-all key', () => {
    const out = buildSingleCardPrompt(ctx, { label: 'Acne consult' });
    expect(out).toMatch(/Do NOT use service_key "other"/);
  });

  it('starter prompt always demands the catch-all row', () => {
    const out = buildStarterCatalogPrompt(ctx);
    expect(out).toContain(`mandatory catch-all card with service_key "${CATALOG_CATCH_ALL_SERVICE_KEY}"`);
  });
});

describe('generateAiCatalogSuggestion — single_card mode (Task 06)', () => {
  beforeEach(() => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
  });

  it('returns one validated card with default scope_mode honored', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'acne_consult',
          label: 'Acne consultation',
          description: 'Initial acne workup',
          scope_mode: 'strict',
          matcher_hints: {
            keywords: 'acne, pimples, breakouts',
            include_when: 'patient describes acne or pimples',
            exclude_when: 'pregnancy, severe rash needing biopsy',
          },
          modalities: {
            video: { enabled: true, price_minor: 50000 },
            voice: { enabled: true, price_minor: 35000 },
            text: { enabled: false, price_minor: 0 },
          },
        },
      ],
    });
    const runLlm = makeStubLlm({ single_card: llmJson });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Acne' } },
      correlationId,
      { runLlm }
    );
    expect(result.mode).toBe('single_card');
    if (result.mode !== 'single_card') throw new Error('unreachable');
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.service_key).toBe('acne_consult');
    expect(result.cards[0]?.scope_mode).toBe('strict');
    // Modalities filter: doctor has Video + Voice → text was disabled by LLM, OK.
    expect(result.cards[0]?.modalities.video?.enabled).toBe(true);
    expect(result.cards[0]?.modalities.voice?.enabled).toBe(true);
    expect(result.cards[0]?.modalities.text?.enabled).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('clamps prices outside [0.3x, 1.5x] of appointment_fee_minor and emits a price_clamped warning', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'pricey_card',
          label: 'Premium',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'premium' },
          modalities: {
            video: { enabled: true, price_minor: 999999 }, // way above 1.5x of 50000 = 75000
            voice: { enabled: true, price_minor: 100 }, // below 0.3x of 50000 = 15000
          },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Premium' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );
    if (result.mode !== 'single_card') throw new Error('unreachable');
    expect(result.cards[0]?.modalities.video?.price_minor).toBe(75000);
    expect(result.cards[0]?.modalities.voice?.price_minor).toBe(15000);
    const clamped = result.warnings.filter((w) => w.kind === 'price_clamped');
    expect(clamped).toHaveLength(2);
  });

  it('filters modalities the doctor has not configured globally', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({ consultation_types: 'Video' }) as never
    );
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'derm_followup',
          label: 'Derm follow-up',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'follow up' },
          modalities: {
            video: { enabled: true, price_minor: 50000 },
            voice: { enabled: true, price_minor: 30000 },
            text: { enabled: true, price_minor: 20000 },
          },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Follow-up' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );
    if (result.mode !== 'single_card') throw new Error('unreachable');
    expect(result.cards[0]?.modalities.video?.enabled).toBe(true);
    expect(result.cards[0]?.modalities.voice?.enabled).toBeUndefined();
    expect(result.cards[0]?.modalities.text?.enabled).toBeUndefined();
    const filtered = result.warnings.filter((w) => w.kind === 'modality_disabled_no_global_setup');
    expect(filtered.map((w) => w.kind === 'modality_disabled_no_global_setup' && w.modality).sort()).toEqual([
      'text',
      'voice',
    ]);
  });

  it('rejects when LLM tries to use the reserved catch-all key in single_card mode', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
          label: 'Other',
          scope_mode: 'flexible',
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });
    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'whatever' } },
        correlationId,
        { runLlm: makeStubLlm({ single_card: llmJson }) }
      )
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('maps malformed JSON from the LLM to InternalError', async () => {
    const runLlm = (jest.fn(async () => 'not json at all')) as unknown as AiSuggestRunLlm;
    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'x' } },
        correlationId,
        { runLlm }
      )
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe('generateAiCatalogSuggestion — starter mode (Task 06)', () => {
  beforeEach(() => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
  });

  it('returns multiple cards and force-injects the catch-all if missing', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'acne_consult',
          label: 'Acne',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'acne' },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
        {
          service_key: 'eczema_consult',
          label: 'Eczema',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'eczema' },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'starter' },
      correlationId,
      { runLlm: makeStubLlm({ starter: llmJson }) }
    );
    if (result.mode !== 'starter') throw new Error('unreachable');
    const keys = result.cards.map((c) => c.service_key).sort();
    expect(keys).toContain(CATALOG_CATCH_ALL_SERVICE_KEY);
    expect(keys).toContain('acne_consult');
    expect(keys).toContain('eczema_consult');
    const catchAll = result.cards.find((c) => c.service_key === CATALOG_CATCH_ALL_SERVICE_KEY);
    expect(catchAll?.scope_mode).toBe('flexible');
  });

  it('forces catch-all row to flexible even if LLM emits strict', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
          label: 'Other',
          scope_mode: 'strict', // wrong on purpose
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'starter' },
      correlationId,
      { runLlm: makeStubLlm({ starter: llmJson }) }
    );
    if (result.mode !== 'starter') throw new Error('unreachable');
    const catchAll = result.cards.find((c) => c.service_key === CATALOG_CATCH_ALL_SERVICE_KEY);
    expect(catchAll?.scope_mode).toBe('flexible');
    const forced = result.warnings.find((w) => w.kind === 'catch_all_scope_forced_flexible');
    expect(forced).toBeDefined();
  });

  it('skips cards that fail per-card validation but keeps the rest', async () => {
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'good_card',
          label: 'Good',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'good' },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
        {
          // missing label — should be dropped, not crash the whole response
          service_key: 'bad_card',
          scope_mode: 'strict',
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'starter' },
      correlationId,
      { runLlm: makeStubLlm({ starter: llmJson }) }
    );
    if (result.mode !== 'starter') throw new Error('unreachable');
    const keys = result.cards.map((c) => c.service_key);
    expect(keys).toContain('good_card');
    expect(keys).not.toContain('bad_card');
    expect(keys).toContain(CATALOG_CATCH_ALL_SERVICE_KEY); // auto-injected
  });
});

// ----------------------------------------------------------------------------
// Task 07 — helpers for building catalog fixtures for review tests
// ----------------------------------------------------------------------------

function cardFixture(overrides: Partial<ServiceCatalogV1['services'][number]> = {}): ServiceCatalogV1['services'][number] {
  return {
    service_id: '11111111-1111-4111-8111-111111111111',
    service_key: 'card_a',
    label: 'Card A',
    scope_mode: 'strict',
    matcher_hints: { keywords: 'alpha, beta, gamma' },
    modalities: { video: { enabled: true, price_minor: 50000 } },
    ...overrides,
  };
}

function catalogFixture(services: ServiceCatalogV1['services']): ServiceCatalogV1 {
  return { version: 1, services };
}

const CATCH_ALL_CARD = cardFixture({
  service_id: '99999999-9999-4999-8999-999999999999',
  service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
  label: 'Other / not listed',
  scope_mode: 'flexible',
  matcher_hints: undefined,
  modalities: { video: { enabled: true, price_minor: 50000 } },
});

// ----------------------------------------------------------------------------
// Task 07 — runDeterministicCatalogReview (pure, no LLM)
// ----------------------------------------------------------------------------

describe('runDeterministicCatalogReview (Task 07)', () => {
  it('fires missing_catchall as an error when the catch-all card is absent', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([cardFixture({ service_key: 'acne_consult', label: 'Acne consult' })])
    );
    const missing = issues.find((i) => i.type === 'missing_catchall');
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe('error');
    expect(missing?.autoFixAvailable).toBe(true);
    expect(missing?.suggestedCard?.service_key).toBe(CATALOG_CATCH_ALL_SERVICE_KEY);
  });

  it('fires strict_empty_hints (error) on a strict card with no hints', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'acne_consult',
          label: 'Acne consult',
          scope_mode: 'strict',
          matcher_hints: undefined,
        }),
        CATCH_ALL_CARD,
      ])
    );
    const hit = issues.find((i) => i.type === 'strict_empty_hints');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('error');
    expect(hit?.services).toEqual(['acne_consult']);
    // Must offer at least the two action choices the task spec calls for.
    const actions = (hit?.suggestions ?? []).map((s) => s.action);
    expect(actions).toEqual(expect.arrayContaining(['fill_with_ai', 'switch_to_flexible']));
  });

  it('fires strict_thin_keywords (warning) but NOT strict_empty_hints on the same card', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'acne_consult',
          label: 'Acne consult',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'acne' }, // only 1 token, short include_when absent
        }),
        CATCH_ALL_CARD,
      ])
    );
    const thin = issues.find((i) => i.type === 'strict_thin_keywords');
    expect(thin).toBeDefined();
    expect(thin?.severity).toBe('warning');
    // strict_empty_hints must NOT also fire — the service `continue`s after that branch.
    expect(issues.some((i) => i.type === 'strict_empty_hints')).toBe(false);
  });

  it('fires empty_hints (suggestion) on a flexible card with no hints', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'general',
          label: 'General consult',
          scope_mode: 'flexible',
          matcher_hints: undefined,
        }),
        CATCH_ALL_CARD,
      ])
    );
    const hit = issues.find((i) => i.type === 'empty_hints');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('suggestion');
  });

  it('fires flexible_should_be_strict (warning) when a flexible card names a narrow condition', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'diabetes_card',
          label: 'Diabetes',
          scope_mode: 'flexible',
          matcher_hints: { keywords: 'dm' },
        }),
        CATCH_ALL_CARD,
      ])
    );
    const hit = issues.find((i) => i.type === 'flexible_should_be_strict');
    expect(hit).toBeDefined();
    expect(hit?.suggestions?.[0]?.action).toBe('switch_to_strict_and_fill');
  });

  it('does NOT fire flexible_should_be_strict on a broad label like "General consultation"', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'general',
          label: 'General consultation',
          scope_mode: 'flexible',
          matcher_hints: { keywords: 'general' },
        }),
        CATCH_ALL_CARD,
      ])
    );
    expect(issues.some((i) => i.type === 'flexible_should_be_strict')).toBe(false);
  });

  it('fires pricing_anomaly when text_price > voice_price on a single card', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'acne_consult',
          label: 'Acne consult',
          scope_mode: 'strict',
          matcher_hints: { keywords: 'acne, pimples, breakouts, spots' },
          modalities: {
            text: { enabled: true, price_minor: 80000 },
            voice: { enabled: true, price_minor: 50000 },
            video: { enabled: true, price_minor: 100000 },
          },
        }),
        CATCH_ALL_CARD,
      ])
    );
    const hit = issues.find((i) => i.type === 'pricing_anomaly');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('warning');
    expect(hit?.services).toEqual(['acne_consult']);
  });

  it('does NOT emit deterministic issues for the catch-all card itself', () => {
    const issues = runDeterministicCatalogReview(catalogFixture([CATCH_ALL_CARD]));
    // Catch-all present ⇒ no missing_catchall; no issues at all for the catch-all.
    expect(issues).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
// Task 07 — review mode end-to-end (deterministic + LLM merge + sort)
// ----------------------------------------------------------------------------

describe('generateAiCatalogSuggestion — review mode (Task 07)', () => {
  it('returns only missing_catchall deterministically when catalog is empty (no LLM call)', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({ service_offerings_json: null }) as never
    );
    const runLlm = jest.fn() as unknown as AiSuggestRunLlm;
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.type).toBe('missing_catchall');
    expect(result.issues[0]?.severity).toBe('error');
    expect((runLlm as unknown as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('merges deterministic + LLM issues and sorts errors before warnings before suggestions', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            // flexible + narrow clinical noun → deterministic warning
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'diabetes_card',
              label: 'Diabetes',
              scope_mode: 'flexible',
              matcher_hints: { keywords: 'dm' },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            // strict + empty hints → deterministic error
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: 'acne_consult',
              label: 'Acne consult',
              scope_mode: 'strict',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '33333333-3333-4333-8333-333333333333',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    // LLM contributes one overlap warning and one gap suggestion.
    const llmJson = JSON.stringify({
      issues: [
        {
          type: 'overlap',
          severity: 'warning',
          services: ['acne_consult', 'diabetes_card'],
          message: 'Acne and diabetes cards share too many keywords.',
          suggestions: [{ action: 'apply_exclude_when_suggestion' }],
          autoFixAvailable: true,
        },
        {
          type: 'gap',
          severity: 'suggestion',
          services: [],
          message: 'No card covers thyroid follow-up, which is common for this specialty.',
          suggestedCard: {
            service_key: 'thyroid_followup',
            label: 'Thyroid follow-up',
            scope_mode: 'strict',
          },
          suggestions: [{ action: 'add_card' }],
          autoFixAvailable: true,
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm: makeStubLlm({ review: llmJson }) }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    const types = result.issues.map((i) => i.type);
    // Deterministic error first, then warnings, then suggestion.
    expect(types[0]).toBe('strict_empty_hints');
    const errorCount = result.issues.filter((i) => i.severity === 'error').length;
    const warningIdx = result.issues.findIndex((i) => i.severity === 'warning');
    const suggestionIdx = result.issues.findIndex((i) => i.severity === 'suggestion');
    expect(errorCount).toBeGreaterThanOrEqual(1);
    expect(warningIdx).toBeGreaterThan(0);
    expect(suggestionIdx).toBeGreaterThan(warningIdx);
    // Merge sanity: contains both deterministic-only types and LLM-only types.
    expect(types).toEqual(expect.arrayContaining(['strict_empty_hints', 'flexible_should_be_strict']));
    expect(types).toEqual(expect.arrayContaining(['overlap', 'gap']));
  });

  it('drops LLM-emitted deterministic kinds (tokens we already produce locally)', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'gp',
              label: 'General consult',
              scope_mode: 'flexible',
              matcher_hints: { keywords: 'cough, cold, fever' },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    const llmJson = JSON.stringify({
      issues: [
        // LLM wrongly re-emits a deterministic kind — must be filtered.
        {
          type: 'strict_empty_hints',
          severity: 'error',
          services: ['gp'],
          message: 'should be dropped',
          autoFixAvailable: false,
        },
        // LLM emits a legitimate semantic kind — must be kept.
        {
          type: 'service_suggestion',
          severity: 'suggestion',
          services: [],
          message: 'Consider adding a BP/hypertension follow-up card.',
          suggestedCard: {
            service_key: 'htn_followup',
            label: 'Hypertension follow-up',
            scope_mode: 'strict',
          },
          suggestions: [{ action: 'add_card' }],
          autoFixAvailable: true,
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm: makeStubLlm({ review: llmJson }) }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    const types = result.issues.map((i) => i.type);
    // The deterministic-from-LLM is filtered, but the real deterministic pass
    // also runs and is free to fire its own issues (not strict_empty_hints here
    // because GP card is flexible, so only service_suggestion should land).
    expect(types.filter((t) => t === 'strict_empty_hints')).toHaveLength(0);
    expect(types).toContain('service_suggestion');
  });

  it('fills in default severity and autoFixAvailable when the LLM omits them', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'a_card',
              label: 'A',
              scope_mode: 'flexible',
              matcher_hints: { keywords: 'a, b, c' },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    const llmJson = JSON.stringify({
      issues: [
        {
          type: 'contradiction',
          // severity & services & autoFixAvailable omitted
          message: 'include_when and exclude_when overlap on a_card.',
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm: makeStubLlm({ review: llmJson }) }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    const contradiction = result.issues.find((i) => i.type === 'contradiction');
    expect(contradiction).toBeDefined();
    expect(contradiction?.severity).toBe('warning');
    expect(contradiction?.services).toEqual([]);
    expect(contradiction?.autoFixAvailable).toBe(false);
  });

  it('drops individual invalid LLM issues without failing the whole review', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'a_card',
              label: 'A',
              scope_mode: 'flexible',
              matcher_hints: { keywords: 'a, b, c' },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    const llmJson = JSON.stringify({
      issues: [
        // invalid: empty message → schema rejects
        { type: 'overlap', severity: 'warning', services: ['a_card'], message: '' },
        // invalid: unknown type
        { type: 'made_up_kind', severity: 'warning', services: [], message: 'nope' },
        // valid
        {
          type: 'modality_mismatch',
          severity: 'warning',
          services: ['a_card'],
          message: 'Video-only may miss patients without a camera.',
          suggestions: [{ action: 'enable_modality' }],
          autoFixAvailable: true,
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm: makeStubLlm({ review: llmJson }) }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    const llmTypes = result.issues
      .filter((i) => LLM_ISSUE_TYPES.includes(i.type))
      .map((i) => i.type);
    expect(llmTypes).toEqual(['modality_mismatch']);
  });

  it('returns InternalError when LLM omits the "issues" array', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'gp',
              label: 'General',
              scope_mode: 'flexible',
              matcher_hints: { keywords: 'cough, cold, fever' },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'review' },
        correlationId,
        { runLlm: makeStubLlm({ review: JSON.stringify({}) }) }
      )
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('every returned issue carries a valid type and severity', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({ service_offerings_json: null }) as never
    );
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'review' },
      correlationId,
      { runLlm: jest.fn() as unknown as AiSuggestRunLlm }
    );
    if (result.mode !== 'review') throw new Error('unreachable');
    for (const i of result.issues) {
      expect([...DETERMINISTIC_ISSUE_TYPES, ...LLM_ISSUE_TYPES]).toContain(i.type);
      expect(['error', 'warning', 'suggestion']).toContain(i.severity);
    }
  });
});

describe('generateAiCatalogSuggestion — input validation (Task 06)', () => {
  it('rejects unknown mode with ValidationError', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        // @ts-expect-error — purposely pass an invalid mode
        { mode: 'nope' },
        correlationId,
        { runLlm: makeStubLlm({}) }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('propagates AiSuggestProfileIncompleteError unchanged', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture({ specialty: '   ' }) as never);
    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'starter' },
        correlationId,
        { runLlm: makeStubLlm({}) }
      )
    ).rejects.toBeInstanceOf(AiSuggestProfileIncompleteError);
  });
});

/**
 * Bug-fix (post Plan 04): the editor sends its current on-screen draft so the
 * AI critiques the unsaved state, not `service_offerings_json`. These tests
 * lock the contract on `AiSuggestRequest.catalog`:
 *   - `undefined` → DB load (legacy path, must keep working).
 *   - `null`      → empty-catalog signal without touching the DB.
 *   - object      → exact override; DB column is ignored.
 *
 * Both `loadAiSuggestContext` (unit-level) and `generateAiCatalogSuggestion`
 * (end-to-end via review mode) are covered so we catch regressions at either
 * layer if a future caller drops the override accidentally.
 */
describe('catalog override (post-Plan-04 bug-fix)', () => {
  const dbCatalog: ServiceCatalogV1 = {
    version: 1,
    services: [
      {
        service_id: '11111111-1111-4111-8111-111111111111',
        service_key: 'db_card',
        label: 'DB Card',
        scope_mode: 'flexible',
        matcher_hints: { keywords: 'db, card' },
        modalities: { video: { enabled: true, price_minor: 50000 } },
      },
      {
        service_id: '22222222-2222-4222-8222-222222222222',
        service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
        label: 'Other',
        scope_mode: 'flexible',
        modalities: { video: { enabled: true, price_minor: 50000 } },
      },
    ],
  };

  const draftCatalog: ServiceCatalogV1 = {
    version: 1,
    services: [
      {
        service_id: '33333333-3333-4333-8333-333333333333',
        service_key: 'draft_card',
        label: 'Draft Card',
        scope_mode: 'flexible',
        matcher_hints: { keywords: 'draft, only, in, editor' },
        modalities: { video: { enabled: true, price_minor: 50000 } },
      },
      {
        service_id: '44444444-4444-4444-8444-444444444444',
        service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
        label: 'Other',
        scope_mode: 'flexible',
        modalities: { video: { enabled: true, price_minor: 50000 } },
      },
    ],
  };

  beforeEach(() => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({ service_offerings_json: dbCatalog }) as never
    );
  });

  it('loadAiSuggestContext: undefined override falls back to DB', async () => {
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId);
    expect(ctx.catalog?.services.map((s) => s.service_key)).toEqual([
      'db_card',
      CATALOG_CATCH_ALL_SERVICE_KEY,
    ]);
  });

  it('loadAiSuggestContext: object override is used verbatim, DB column ignored', async () => {
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId, {
      catalogOverride: draftCatalog,
    });
    expect(ctx.catalog?.services.map((s) => s.service_key)).toEqual([
      'draft_card',
      CATALOG_CATCH_ALL_SERVICE_KEY,
    ]);
  });

  it('loadAiSuggestContext: null override means empty draft (no DB read for catalog)', async () => {
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId, {
      catalogOverride: null,
    });
    expect(ctx.catalog).toBeNull();
  });

  it(
    'generateAiCatalogSuggestion (review): override drives the LLM prompt and ' +
      'deterministic checks, not the DB row',
    async () => {
      // Spy on the prompt the LLM sees so we can assert the draft summary made
      // it through and the DB summary did not.
      const seenPrompts: string[] = [];
      const runLlm: AiSuggestRunLlm = jest.fn(
        async (params: { systemPrompt: string; correlationId: string }) => {
          seenPrompts.push(params.systemPrompt);
          return JSON.stringify({ issues: [] });
        }
      ) as unknown as AiSuggestRunLlm;

      const result = await generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'review', catalog: draftCatalog },
        correlationId,
        { runLlm }
      );

      if (result.mode !== 'review') throw new Error('unreachable');
      expect(seenPrompts).toHaveLength(1);
      expect(seenPrompts[0]).toContain('draft_card');
      expect(seenPrompts[0]).not.toContain('db_card');
      // No `missing_catchall` because the override carries the catch-all.
      expect(result.issues.find((i) => i.type === 'missing_catchall')).toBeUndefined();
    }
  );

  it(
    'generateAiCatalogSuggestion (review): null override fires deterministic ' +
      'missing_catchall and skips the LLM call entirely',
    async () => {
      const runLlm = jest.fn(async () => null) as unknown as AiSuggestRunLlm;

      const result = await generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'review', catalog: null },
        correlationId,
        { runLlm }
      );

      if (result.mode !== 'review') throw new Error('unreachable');
      expect(runLlm).not.toHaveBeenCalled();
      expect(result.issues.some((i) => i.type === 'missing_catchall')).toBe(true);
    }
  );

  it(
    'generateAiCatalogSuggestion (review): omitted catalog (legacy callers) ' +
      'still loads from the DB',
    async () => {
      const seenPrompts: string[] = [];
      const runLlm: AiSuggestRunLlm = jest.fn(
        async (params: { systemPrompt: string; correlationId: string }) => {
          seenPrompts.push(params.systemPrompt);
          return JSON.stringify({ issues: [] });
        }
      ) as unknown as AiSuggestRunLlm;

      await generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'review' },
        correlationId,
        { runLlm }
      );

      expect(seenPrompts[0]).toContain('db_card');
      expect(seenPrompts[0]).not.toContain('draft_card');
    }
  );

  it(
    'generateAiCatalogSuggestion (single_card): override flows into the ' +
      'sibling-summary block of the prompt',
    async () => {
      const seenPrompts: string[] = [];
      const runLlm: AiSuggestRunLlm = jest.fn(
        async (params: { systemPrompt: string; correlationId: string }) => {
          seenPrompts.push(params.systemPrompt);
          return JSON.stringify({
            cards: [
              {
                service_key: 'new_followup',
                label: 'New follow-up',
                scope_mode: 'strict',
                matcher_hints: { keywords: 'follow up, review, recheck' },
                modalities: { video: { enabled: true, price_minor: 50000 } },
              },
            ],
          });
        }
      ) as unknown as AiSuggestRunLlm;

      const result = await generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        {
          mode: 'single_card',
          payload: { label: 'Follow-up' },
          catalog: draftCatalog,
        },
        correlationId,
        { runLlm }
      );

      if (result.mode !== 'single_card') throw new Error('unreachable');
      expect(seenPrompts[0]).toContain('draft_card');
      expect(seenPrompts[0]).not.toContain('db_card');
      expect(result.cards[0]?.service_key).toBe('new_followup');
    }
  );
});

// ----------------------------------------------------------------------------
// Plan service-catalog-matcher-routing-v2 — Task 05
// AI suggest + review consume `resolveMatcherRouting` (no direct keywords reads)
// ----------------------------------------------------------------------------

describe('routing v2 — AI suggest + review use resolveMatcherRouting (Task 05)', () => {
  it('summarizeExistingCatalogForLlm renders v2 examples-only row as examples="…" (Task 11 label flip)', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'acne_card',
              label: 'Acne consult',
              scope_mode: 'strict',
              matcher_hints: { examples: ['my acne is flaring', 'pimples on my chin'] },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId);
    const prompt = buildSingleCardPrompt(ctx, { label: 'Hair fall' });
    expect(prompt).toContain('- acne_card [scope:strict]');
    expect(prompt).toContain('examples="my acne is flaring, pimples on my chin"');
    // Legacy label must be gone from the catalog summary line on a v2 row.
    expect(prompt).not.toContain('keywords="my acne is flaring');
  });

  it('summarizeExistingCatalogForLlm prefers v2 examples over legacy keywords on the same row', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'mixed_card',
              label: 'Mixed',
              scope_mode: 'strict',
              matcher_hints: {
                examples: ['v2 phrase one', 'v2 phrase two'],
                keywords: 'legacy, kw, ignored',
                include_when: 'legacy include ignored for v2 row',
              },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    const ctx = await loadAiSuggestContext(doctorId, doctorId, correlationId);
    const prompt = buildStarterCatalogPrompt(ctx);
    expect(prompt).toContain('examples="v2 phrase one, v2 phrase two"');
    expect(prompt).not.toContain('legacy, kw, ignored');
  });

  it('runDeterministicCatalogReview: v2 examples-only row with thin examples fires strict_thin_keywords', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'thin_v2',
          label: 'Thin v2',
          scope_mode: 'strict',
          matcher_hints: { examples: ['only one phrase'] }, // 1 < 3 phrases
        }),
        CATCH_ALL_CARD,
      ])
    );
    const thin = issues.find((i) => i.type === 'strict_thin_keywords');
    expect(thin).toBeDefined();
    expect(thin?.services).toEqual(['thin_v2']);
  });

  it('runDeterministicCatalogReview: v2 examples-only row with enough examples does NOT fire strict_thin_keywords', () => {
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'rich_v2',
          label: 'Rich v2',
          scope_mode: 'strict',
          matcher_hints: {
            examples: ['phrase one', 'phrase two', 'phrase three', 'phrase four'],
          },
        }),
        CATCH_ALL_CARD,
      ])
    );
    expect(issues.some((i) => i.type === 'strict_thin_keywords' && i.services.includes('rich_v2'))).toBe(false);
    expect(issues.some((i) => i.type === 'strict_empty_hints' && i.services.includes('rich_v2'))).toBe(false);
  });

  it('runDeterministicCatalogReview: strict_empty_hints is NOT raised on a v2 examples-only row', () => {
    // Pre-v2, "empty" only checked legacy keywords + include_when. Routing v2 must
    // also count `examples[]` as routing signal so a strict v2 card with examples
    // doesn't get flagged as empty.
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'v2_filled',
          label: 'V2 Filled',
          scope_mode: 'strict',
          matcher_hints: { examples: ['p1', 'p2', 'p3'] },
        }),
        CATCH_ALL_CARD,
      ])
    );
    expect(issues.some((i) => i.type === 'strict_empty_hints' && i.services.includes('v2_filled'))).toBe(false);
  });

  it('runDeterministicCatalogReview: strict card with only exclude_when is still treated as empty', () => {
    // exclude_when is a red-flag filter, not a positive routing signal — preserves
    // the pre-v2 asymmetry now that the resolver explicitly omits exclude_when from
    // the empty-check.
    const issues = runDeterministicCatalogReview(
      catalogFixture([
        cardFixture({
          service_key: 'only_exclude',
          label: 'Only exclude',
          scope_mode: 'strict',
          matcher_hints: { exclude_when: 'never route here for chest pain' },
        }),
        CATCH_ALL_CARD,
      ])
    );
    expect(issues.some((i) => i.type === 'strict_empty_hints' && i.services.includes('only_exclude'))).toBe(true);
  });

  it('maxSiblingKeywordOverlap: v2 examples-only siblings still trigger overlap warning', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'sibling_a',
              label: 'Sibling A',
              scope_mode: 'strict',
              matcher_hints: { examples: ['acne flare', 'pimples breakout', 'oily skin'] },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    // LLM emits a near-duplicate examples-only card → resolver-driven token overlap
    // should flag the sibling collision.
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'sibling_b',
          label: 'Sibling B',
          scope_mode: 'strict',
          matcher_hints: { examples: ['acne flare', 'pimples breakout', 'oily skin'] },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });
    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Acne look-alike' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );
    if (result.mode !== 'single_card') throw new Error('unreachable');
    const overlap = result.warnings.find((w) => w.kind === 'keyword_overlap_with_sibling');
    expect(overlap).toBeDefined();
    expect(overlap?.service_key).toBe('sibling_b');
    expect(overlap?.sibling_service_key).toBe('sibling_a');
  });
});

// ============================================================================
// Routing v2 Task 06 — existingHints.examples plumbed into single_card prompt
// ============================================================================

describe('buildSingleCardPrompt — existingHints.examples (Routing v2 Task 06)', () => {
  const ctx: AiSuggestContext = {
    doctorId: 'doc-001',
    specialty: 'Dermatology',
    practiceName: 'Test Clinic',
    addressSummary: 'Bengaluru, KA',
    country: 'IN',
    consultationTypes: 'Video, Voice',
    appointmentFeeMinor: 50000,
    appointmentFeeCurrency: 'INR',
    catalog: null,
  };

  it('renders examples on a dedicated line and suppresses legacy keywords/include_when when both are sent', () => {
    // Frontend may legitimately ship both `examples` and the legacy fields during
    // the migration window (un-saved drafts that haven't been round-tripped).
    // Routing v2 contract: the prompt prefers `examples` so the LLM never sees
    // two competing routing vocabularies for the same card.
    const out = buildSingleCardPrompt(ctx, {
      label: 'Acne consult',
      existingHints: {
        examples: ['my acne is flaring', 'pimples on my chin'],
        keywords: 'legacy, kw, ignored',
        include_when: 'legacy include ignored',
        exclude_when: 'pregnancy',
      },
    });
    expect(out).toContain('examples: my acne is flaring | pimples on my chin');
    expect(out).toContain('exclude_when: pregnancy');
    expect(out).not.toContain('keywords: legacy, kw, ignored');
    expect(out).not.toContain('include_when: legacy include ignored');
  });

  it('falls back to legacy keywords/include_when (under a legacy header) when examples is absent or empty', () => {
    // Task 11: when the editor sends only legacy fields (un-migrated row), the
    // prompt now renders them under a "legacy — please convert to examples"
    // header so the LLM is explicitly told to migrate, not to mirror.
    const outAbsent = buildSingleCardPrompt(ctx, {
      label: 'Acne consult',
      existingHints: {
        keywords: 'acne, pimples',
        include_when: 'breakouts',
      },
    });
    expect(outAbsent).toContain('keywords (legacy): acne, pimples');
    expect(outAbsent).toContain('include_when (legacy): breakouts');
    expect(outAbsent).toContain('please convert to `examples[]`');

    const outEmpty = buildSingleCardPrompt(ctx, {
      label: 'Acne consult',
      existingHints: {
        examples: [],
        keywords: 'acne, pimples',
      },
    });
    expect(outEmpty).toContain('keywords (legacy): acne, pimples');
    expect(outEmpty).toContain('please convert to `examples[]`');
  });

  it('aiSuggestRequestSchema accepts existingHints.examples and counts it toward "has input"', () => {
    const ok = aiSuggestRequestSchemaForTests.safeParse({
      mode: 'single_card',
      payload: {
        existingHints: {
          examples: ['phrase A', 'phrase B'],
        },
      },
    });
    expect(ok.success).toBe(true);
  });

  it('aiSuggestRequestSchema rejects unknown matcher-hint fields (strict)', () => {
    const bad = aiSuggestRequestSchemaForTests.safeParse({
      mode: 'single_card',
      payload: {
        label: 'X',
        existingHints: {
          examples: ['p1'],
          unknown_field: 'nope',
        } as unknown as { examples: string[] },
      },
    });
    expect(bad.success).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Plan service-catalog-matcher-routing-v2 — Task 12
// Per-mode `max_completion_tokens` + `finish_reason: 'length'` truncation
// surfaces a doctor-facing error instead of "AI returned malformed JSON".
//
// These tests exercise the real `defaultRunAiSuggestLlm` (no `runLlm` injection)
// against a mocked `chat.completions.create` so we can assert the per-mode cap
// is wired correctly, the truncation marker reaches the audit logger, and the
// success / malformed-JSON / empty-completion paths still behave as before.
// ----------------------------------------------------------------------------

describe('Task 12 — per-mode token budget + truncation handling', () => {
  const mockedLogAIClassification = (
    auditLogger as unknown as { logAIClassification: jest.Mock }
  ).logAIClassification;

  beforeEach(() => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
    mockChatCompletionsCreate.mockReset();
    mockedLogAIClassification.mockClear();
  });

  /**
   * The per-mode cap map is the contract — pin it explicitly so a future
   * accidental edit (e.g. dropping `starter` back to 1500 to "save tokens")
   * fails CI rather than silently re-introducing the truncation bug.
   */
  it('AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE has the expected per-mode caps', () => {
    expect(AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE).toEqual({
      single_card: 1500,
      starter: 6000,
      review: 4000,
    });
  });

  it('passes max_completion_tokens=1500 to OpenAI for single_card mode', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              cards: [
                {
                  service_key: 'acne_consult',
                  label: 'Acne consultation',
                  scope_mode: 'strict',
                  matcher_hints: { keywords: 'acne' },
                  modalities: { video: { enabled: true, price_minor: 50000 } },
                },
              ],
            }),
          },
        },
      ],
      usage: { total_tokens: 800 },
    });

    await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Acne' } },
      correlationId
    );

    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(mockChatCompletionsCreate.mock.calls[0]![0]).toMatchObject({
      max_completion_tokens: 1500,
      response_format: { type: 'json_object' },
    });
  });

  it('passes max_completion_tokens=6000 to OpenAI for starter mode', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              cards: [
                {
                  service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
                  label: 'Other',
                  scope_mode: 'flexible',
                  modalities: { video: { enabled: true, price_minor: 50000 } },
                },
              ],
            }),
          },
        },
      ],
      usage: { total_tokens: 4000 },
    });

    await generateAiCatalogSuggestion(doctorId, doctorId, { mode: 'starter' }, correlationId);

    expect(mockChatCompletionsCreate.mock.calls[0]![0]).toMatchObject({
      max_completion_tokens: 6000,
    });
  });

  it('passes max_completion_tokens=4000 to OpenAI for review mode', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(
      settingsFixture({
        service_offerings_json: {
          version: 1,
          services: [
            {
              service_id: '11111111-1111-4111-8111-111111111111',
              service_key: 'acne_card',
              label: 'Acne consult',
              scope_mode: 'strict',
              matcher_hints: { examples: ['my acne is flaring'] },
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
            {
              service_id: '22222222-2222-4222-8222-222222222222',
              service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
              label: 'Other',
              scope_mode: 'flexible',
              modalities: { video: { enabled: true, price_minor: 50000 } },
            },
          ],
        },
      }) as never
    );
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ issues: [] }) },
        },
      ],
      usage: { total_tokens: 2200 },
    });

    await generateAiCatalogSuggestion(doctorId, doctorId, { mode: 'review' }, correlationId);

    expect(mockChatCompletionsCreate.mock.calls[0]![0]).toMatchObject({
      max_completion_tokens: 4000,
    });
  });

  it('finish_reason="length" throws a doctor-facing truncation error (not "malformed JSON")', async () => {
    // Valid JSON prefix that abruptly ends mid-string — exactly what we'd see
    // from OpenAI when `max_completion_tokens` is hit while emitting a value.
    const truncatedPrefix = '{"cards":[{"service_key":"acne","label":"Acn';
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'length',
          message: { content: truncatedPrefix },
        },
      ],
      usage: { total_tokens: 1500 },
    });

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining('cut short'),
    });

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('finish_reason="length" emits service_catalog_ai_suggest_truncated to the audit log', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'length',
          message: { content: '{"cards":[{"service_key":"x"' },
        },
      ],
      usage: { total_tokens: 1500 },
    });

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toThrow();

    // The truncation branch must log the new marker (and not the legacy
    // *_openai_error or *_empty_completion markers).
    expect(mockedLogAIClassification).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failure',
        errorMessage: 'service_catalog_ai_suggest_truncated',
        tokens: 1500,
      })
    );
    const calls = mockedLogAIClassification.mock.calls.flat();
    for (const c of calls) {
      const obj = c as { errorMessage?: string };
      expect(obj.errorMessage).not.toBe('service_catalog_ai_suggest_openai_error');
      expect(obj.errorMessage).not.toBe('service_catalog_ai_suggest_empty_completion');
    }
  });

  it('finish_reason="stop" with valid JSON: success path is unchanged (no truncation marker)', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              cards: [
                {
                  service_key: 'acne_consult',
                  label: 'Acne',
                  scope_mode: 'strict',
                  matcher_hints: { keywords: 'acne' },
                  modalities: { video: { enabled: true, price_minor: 50000 } },
                },
              ],
            }),
          },
        },
      ],
      usage: { total_tokens: 600 },
    });

    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Acne' } },
      correlationId
    );

    if (result.mode !== 'single_card') throw new Error('unreachable');
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.service_key).toBe('acne_consult');

    // Audit log got a success row — never a truncation marker.
    expect(mockedLogAIClassification).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', tokens: 600 })
    );
    for (const c of mockedLogAIClassification.mock.calls.flat()) {
      expect((c as { errorMessage?: string }).errorMessage).not.toBe(
        'service_catalog_ai_suggest_truncated'
      );
    }
  });

  it('finish_reason="stop" with invalid JSON: still surfaces "malformed JSON" (truncation branch is not triggered)', async () => {
    // The model finished cleanly (`stop`) but emitted non-JSON. This is a true
    // model bug (not truncation) — keep the existing "malformed JSON" copy and
    // do NOT log the truncation marker.
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'definitely not json' },
        },
      ],
      usage: { total_tokens: 200 },
    });

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining('malformed JSON'),
    });

    for (const c of mockedLogAIClassification.mock.calls.flat()) {
      expect((c as { errorMessage?: string }).errorMessage).not.toBe(
        'service_catalog_ai_suggest_truncated'
      );
    }
  });

  it('empty completion (null content, finish_reason="stop"): existing *_empty_completion marker preserved', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: null } }],
      usage: { total_tokens: 0 },
    });

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toThrow();

    expect(mockedLogAIClassification).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failure',
        errorMessage: 'service_catalog_ai_suggest_empty_completion',
      })
    );
  });

  it('SDK throws (network / 5xx): existing *_openai_error marker preserved + ServiceUnavailableError', async () => {
    mockChatCompletionsCreate.mockRejectedValue(new Error('socket hang up'));

    await expect(
      generateAiCatalogSuggestion(
        doctorId,
        doctorId,
        { mode: 'single_card', payload: { label: 'Acne' } },
        correlationId
      )
    ).rejects.toMatchObject({
      // ServiceUnavailableError surfaces this exact copy today.
      message: expect.stringContaining('AI suggestion service is unavailable'),
    });

    expect(mockedLogAIClassification).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failure',
        errorMessage: 'service_catalog_ai_suggest_openai_error',
      })
    );
  });
});

// ----------------------------------------------------------------------------
// Plan service-catalog-matcher-routing-v2 — Task 11
// AI suggest prompts emit `matcher_hints.examples[]`, not legacy keywords /
// include_when. Closes the autofill loop so AI-generated cards never re-create
// legacy-shaped hints after the editor + resolver + matcher already migrated.
// ----------------------------------------------------------------------------

describe('Task 11 — AI suggest prompts emit examples[] (no legacy keywords/include_when)', () => {
  const ctx: AiSuggestContext = {
    doctorId,
    specialty: 'Dermatology',
    practiceName: 'Test Clinic',
    addressSummary: 'Bengaluru, KA',
    country: 'IN',
    consultationTypes: 'Video, Voice',
    appointmentFeeMinor: 50000,
    appointmentFeeCurrency: 'INR',
    catalog: null,
  };

  // ---------------------- Schema-block flips ----------------------

  it('SCOPE_MODE_RULE_BLOCK references `examples[]`, not "keywords / include_when"', () => {
    expect(SCOPE_MODE_RULE_BLOCK).toContain('concrete `examples[]`');
    expect(SCOPE_MODE_RULE_BLOCK).toContain('non-empty `examples[]` array');
    // The v1 wording referenced "concrete keywords / include_when" — must be gone
    // so the LLM no longer sees it embedded in every prompt.
    expect(SCOPE_MODE_RULE_BLOCK).not.toContain('concrete keywords / include_when');
    expect(SCOPE_MODE_RULE_BLOCK).not.toContain('non-empty keywords or include_when');
  });

  it('single_card prompt: schema instructs `matcher_hints.examples` and forbids legacy keys', () => {
    const out = buildSingleCardPrompt(ctx, { label: 'Acne consult' });
    // Positive: the new schema field is present in the JSON-only schema block.
    expect(out).toContain('"examples":');
    expect(out).toContain('"matcher_hints"');
    expect(out).toContain('Do NOT emit "keywords" or "include_when"');
    // Negative: the legacy schema sub-keys (`"keywords":` and `"include_when":`)
    // must not appear inside the JSON schema block. We anchor on the colon to
    // avoid false-positives on prose mentions elsewhere in the prompt.
    expect(out).not.toMatch(/"keywords"\s*:\s*"/);
    expect(out).not.toMatch(/"include_when"\s*:\s*"/);
  });

  it('starter prompt: schema instructs `matcher_hints.examples` and forbids legacy keys', () => {
    const out = buildStarterCatalogPrompt(ctx);
    expect(out).toContain('"examples":');
    expect(out).toContain('Do NOT emit "keywords" or "include_when"');
    expect(out).not.toMatch(/"keywords"\s*:\s*"/);
    expect(out).not.toMatch(/"include_when"\s*:\s*"/);
  });

  it('review prompt: suggestedCard.matcher_hints uses `examples`, not legacy keys', () => {
    const out = buildReviewPrompt(ctx);
    // The review schema's `suggestedCard` block must carry the examples array.
    expect(out).toMatch(/"matcher_hints"\s*:\s*\{\s*"examples"\s*:/);
    // The literal legacy KV pair (`"keywords": "..."`) inside the suggestedCard
    // block must be gone. Note: the prose `overlap` description still mentions
    // "legacy keywords / include_when text" for un-migrated rows — that's
    // intentional context, not a schema instruction. We anchor on the JSON
    // KV form so prose mentions don't trip the assertion.
    expect(out).not.toMatch(/"keywords"\s*:\s*"\.{3}"/);
    expect(out).not.toMatch(/"include_when"\s*:\s*"\.{3}"/);
  });

  // ---------------------- Existing-hints rendering ----------------------

  it('single_card existing-hints block: legacy-only payload renders under a "please convert" header', () => {
    const out = buildSingleCardPrompt(ctx, {
      label: 'Acne consult',
      existingHints: { keywords: 'acne, pimples', include_when: 'breakouts' },
    });
    expect(out).toContain('legacy — please convert to `examples[]`');
    expect(out).toContain('keywords (legacy): acne, pimples');
    expect(out).toContain('include_when (legacy): breakouts');
    // Without the legacy header, pre-Task-11 the LLM routinely mirrored these
    // back as `keywords` / `include_when` on the generated card.
  });

  it('single_card existing-hints block: examples-bearing payload does NOT render the legacy header', () => {
    const out = buildSingleCardPrompt(ctx, {
      label: 'Acne consult',
      existingHints: { examples: ['my acne keeps flaring'] },
    });
    expect(out).not.toContain('legacy — please convert');
    expect(out).toContain('examples: my acne keeps flaring');
  });

  // ---------------------- Normalizer defense ----------------------

  it('normalizer defense: when LLM emits BOTH examples + legacy keywords/include_when, the saved card keeps only examples', async () => {
    // A model that ignores the new schema and emits both shapes must not be
    // allowed to silently re-introduce dual-write. The normalizer drops the
    // legacy fields whenever `examples` is present.
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'acne_consult',
          label: 'Acne consultation',
          scope_mode: 'strict',
          matcher_hints: {
            examples: ['my acne keeps flaring', 'pimples on my chin'],
            keywords: 'acne, pimples, breakouts',
            include_when: 'patient describes acne or pimples',
            exclude_when: 'pregnancy',
          },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });

    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Acne' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );

    if (result.mode !== 'single_card') throw new Error('unreachable');
    const hints = result.cards[0]?.matcher_hints;
    expect(hints?.examples).toEqual(['my acne keeps flaring', 'pimples on my chin']);
    expect(hints?.exclude_when).toBe('pregnancy');
    // The defense: legacy fields stripped even though the LLM emitted them.
    expect(hints?.keywords).toBeUndefined();
    expect(hints?.include_when).toBeUndefined();
  });

  it('normalizer back-compat: when LLM emits only legacy keywords (no examples), legacy fields still flow through', async () => {
    // The migration-window contract: an old or schema-ignoring model that emits
    // only legacy fields must still produce a savable card. The doctor will see
    // the amber "older matching hints" callout (Task 07) and can convert with
    // one tap. Pre-Task-13 the staff-feedback writer still appends to legacy
    // fields too, so dropping legacy entirely here would lose data.
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'old_school',
          label: 'Old school card',
          scope_mode: 'strict',
          matcher_hints: {
            keywords: 'legacy, kw, only',
            include_when: 'no examples here',
          },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });

    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Old' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );

    if (result.mode !== 'single_card') throw new Error('unreachable');
    const hints = result.cards[0]?.matcher_hints;
    expect(hints?.examples).toBeUndefined();
    expect(hints?.keywords).toBe('legacy, kw, only');
    expect(hints?.include_when).toBe('no examples here');
  });

  // ---------------------- End-to-end single_card v2 ----------------------

  it('end-to-end single_card: a v2-shaped LLM response round-trips cleanly with examples[] only', async () => {
    mockedGetDoctorSettingsForUser.mockResolvedValue(settingsFixture() as never);
    const llmJson = JSON.stringify({
      cards: [
        {
          service_key: 'eczema_consult',
          label: 'Eczema consultation',
          description: 'Initial eczema workup',
          scope_mode: 'strict',
          matcher_hints: {
            examples: [
              'my eczema is flaring up',
              'itchy patches on my arms',
              'dry red skin behind my knees',
            ],
            exclude_when: 'open wounds, infected skin',
          },
          modalities: { video: { enabled: true, price_minor: 50000 } },
        },
      ],
    });

    const result = await generateAiCatalogSuggestion(
      doctorId,
      doctorId,
      { mode: 'single_card', payload: { label: 'Eczema' } },
      correlationId,
      { runLlm: makeStubLlm({ single_card: llmJson }) }
    );

    if (result.mode !== 'single_card') throw new Error('unreachable');
    const card = result.cards[0]!;
    expect(card.service_key).toBe('eczema_consult');
    expect(card.scope_mode).toBe('strict');
    expect(card.matcher_hints?.examples).toEqual([
      'my eczema is flaring up',
      'itchy patches on my arms',
      'dry red skin behind my knees',
    ]);
    expect(card.matcher_hints?.exclude_when).toBe('open wounds, infected skin');
    expect(card.matcher_hints?.keywords).toBeUndefined();
    expect(card.matcher_hints?.include_when).toBeUndefined();
  });
});
