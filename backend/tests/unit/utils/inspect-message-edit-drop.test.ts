/**
 * RBH-11: inspectInstagramMessageEditDrop — booleans only, no PHI.
 */

import { describe, it, expect } from '@jest/globals';
import { inspectInstagramMessageEditDrop } from '../../../src/utils/webhook-event-id';

describe('inspectInstagramMessageEditDrop', () => {
  it('returns null for message payloads', () => {
    expect(
      inspectInstagramMessageEditDrop({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'u1' },
                message: { mid: 'm1', text: 'hi' },
              },
            ],
          },
        ],
      })
    ).toBeNull();
  });

  it('extracts booleans and numEdit without exposing text', () => {
    const result = inspectInstagramMessageEditDrop({
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'u1' },
              message_edit: { mid: 'm1', text: 'secret patient text', num_edit: 2 },
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      hasText: true,
      hasSender: true,
      hasMid: true,
      numEdit: 2,
    });
  });

  it('handles edit without sender (Meta-shaped)', () => {
    const result = inspectInstagramMessageEditDrop({
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              message_edit: { mid: 'm1', text: 'echo' },
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      hasText: true,
      hasSender: false,
      hasMid: true,
      numEdit: undefined,
    });
  });

  it('treats whitespace-only text as hasText false', () => {
    const result = inspectInstagramMessageEditDrop({
      object: 'instagram',
      entry: [
        {
          messaging: [{ message_edit: { mid: 'm1', text: '   ' } }],
        },
      ],
    });
    expect(result?.hasText).toBe(false);
  });
});
