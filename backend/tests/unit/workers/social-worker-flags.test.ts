import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockEnv: {
  NODE_ENV: 'development' | 'production' | 'test';
  SOCIAL_CARD_PUBLISH_WORKER_ENABLED?: boolean;
  SOCIAL_INSIGHTS_WORKER_ENABLED?: boolean;
} = {
  NODE_ENV: 'test',
};

jest.mock('../../../src/config/env', () => ({
  env: mockEnv,
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/social-card-publish-service', () => ({
  runSocialCardPublishJob: jest.fn(),
}));

jest.mock('../../../src/services/social-insights-service', () => ({
  runSocialInsightsJob: jest.fn(),
}));

import { __testInternals as cardInternals } from '../../../src/workers/social-card-publish-cron';
import { __testInternals as insightsInternals } from '../../../src/workers/social-insights-cron';

afterEach(() => {
  mockEnv.NODE_ENV = 'test';
  delete mockEnv.SOCIAL_CARD_PUBLISH_WORKER_ENABLED;
  delete mockEnv.SOCIAL_INSIGHTS_WORKER_ENABLED;
});

describe('social worker flags', () => {
  it('stays off in development when unset', () => {
    mockEnv.NODE_ENV = 'development';
    expect(cardInternals.isWorkerEnabled()).toBe(false);
    expect(insightsInternals.isWorkerEnabled()).toBe(false);
  });

  it('is on in production when unset', () => {
    mockEnv.NODE_ENV = 'production';
    expect(cardInternals.isWorkerEnabled()).toBe(true);
    expect(insightsInternals.isWorkerEnabled()).toBe(true);
  });

  it('honours an explicit override', () => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.SOCIAL_CARD_PUBLISH_WORKER_ENABLED = true;
    expect(cardInternals.isWorkerEnabled()).toBe(true);

    mockEnv.NODE_ENV = 'production';
    mockEnv.SOCIAL_INSIGHTS_WORKER_ENABLED = false;
    expect(insightsInternals.isWorkerEnabled()).toBe(false);
  });
});
