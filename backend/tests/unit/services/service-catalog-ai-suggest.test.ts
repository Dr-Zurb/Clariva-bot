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

import {
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
