/**
 * chat-push-listener unit tests (task-text-D6b).
 */

import { describe, expect, it } from '@jest/globals';
import { redactBodyForPush, senderDisplayName } from '../../../src/services/chat-push-listener';

describe('chat-push-listener · redactBodyForPush', () => {
  it('returns a fallback for empty bodies', () => {
    expect(redactBodyForPush(null)).toBe('New message');
    expect(redactBodyForPush('   ')).toBe('New message');
  });

  it('passes through short previews unchanged', () => {
    expect(redactBodyForPush('Take 5mg twice a day')).toBe('Take 5mg twice a day');
  });

  it('truncates long bodies to 80 characters with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = redactBodyForPush(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain(long);
  });
});

describe('chat-push-listener · senderDisplayName', () => {
  it('uses the doctor name when provided', () => {
    expect(senderDisplayName('doctor', 'Dr. Sharma')).toBe('Dr. Sharma sent a message');
  });

  it('falls back to generic doctor copy', () => {
    expect(senderDisplayName('doctor')).toBe('Your doctor sent a message');
  });

  it('labels patient senders', () => {
    expect(senderDisplayName('patient')).toBe('Your patient sent a message');
  });
});

describe('chat-push-listener · PHI hygiene contract', () => {
  it('truncation helper never expands the input', () => {
    const phi = 'Patient reports chest pain radiating to left arm';
    const preview = redactBodyForPush(phi);
    expect(phi.includes(preview.replace(/…$/, ''))).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(80);
  });
});
