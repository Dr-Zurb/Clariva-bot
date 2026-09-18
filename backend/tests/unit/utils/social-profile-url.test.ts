import { describe, it, expect } from '@jest/globals';
import { buildPublicSocialProfileUrl } from '../../../src/utils/social-profile-url';

describe('buildPublicSocialProfileUrl', () => {
  it('builds Instagram vanity URL and strips leading @', () => {
    expect(buildPublicSocialProfileUrl('instagram', '@halo.aid')).toBe(
      'https://www.instagram.com/halo.aid/'
    );
  });

  it('builds Facebook vanity URL', () => {
    expect(buildPublicSocialProfileUrl('facebook', 'SomePage')).toBe(
      'https://www.facebook.com/SomePage'
    );
  });

  it('returns null for display names with spaces (not linkable)', () => {
    expect(buildPublicSocialProfileUrl('instagram', 'Jane Doe')).toBeNull();
  });

  it('returns null for empty / whatsapp', () => {
    expect(buildPublicSocialProfileUrl('instagram', null)).toBeNull();
    expect(buildPublicSocialProfileUrl('whatsapp', 'anyone')).toBeNull();
  });
});
