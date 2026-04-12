import { describe, it, expect } from '@jest/globals';
import { buildPolicyNotificationCopy } from '../../../src/services/service-match-learning-policy-service';

describe('service-match-learning-policy-service', () => {
  it('buildPolicyNotificationCopy includes counts and keys without patient text', () => {
    const { title, body } = buildPolicyNotificationCopy({
      resolutionCount: 7,
      windowDays: 30,
      proposedCatalogServiceKey: 'general_consult',
      finalCatalogServiceKey: 'teleconsult',
    });
    expect(title).toContain('Repeated');
    expect(body).toContain('7');
    expect(body).toContain('30');
    expect(body).toContain('general_consult');
    expect(body).toContain('teleconsult');
    expect(body).toContain('structured');
  });
});
