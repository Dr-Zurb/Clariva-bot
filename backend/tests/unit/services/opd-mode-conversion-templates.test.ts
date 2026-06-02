/**
 * DL-6 template unit tests (pdm-06).
 */

import { describe, it, expect } from '@jest/globals';
import {
  pickTemplate,
  queueToSlotOverflowTemplate,
  queueToSlotRegularTemplate,
  slotToQueueTemplate,
  type TemplateVars,
} from '../../../src/services/opd/opd-mode-conversion-templates';

const baseVars: TemplateVars = {
  doctorName: 'Patel',
  date: 'Mon, May 18',
  time: '10:00 AM',
  tokenNumber: 3,
  eta: '30',
  rescheduleUrl: 'https://example.com/book?token=abc',
};

describe('pickTemplate', () => {
  it('slot → queue', () => {
    expect(pickTemplate('queue', 'slot', false)).toBe('slot_to_queue');
  });

  it('queue → slot regular', () => {
    expect(pickTemplate('slot', 'queue', false)).toBe('queue_to_slot_regular');
  });

  it('queue → slot overflow', () => {
    expect(pickTemplate('slot', 'queue', true)).toBe('queue_to_slot_overflow');
  });
});

describe('template copy snapshots', () => {
  it('slotToQueueTemplate', () => {
    expect(slotToQueueTemplate(baseVars)).toMatchInlineSnapshot(
      `"Dr. Patel has changed Mon, May 18 to queue mode. Your slot at 10:00 AM is now token #3. Estimated wait: ~30 min from session start. Reschedule: https://example.com/book?token=abc"`
    );
  });

  it('queueToSlotRegularTemplate', () => {
    expect(queueToSlotRegularTemplate(baseVars)).toMatchInlineSnapshot(
      `"Dr. Patel has changed Mon, May 18 to slot mode. Your token #3 is now a fixed appointment at 10:00 AM. Please plan to arrive by 9:55 AM. Reschedule: https://example.com/book?token=abc"`
    );
  });

  it('queueToSlotOverflowTemplate', () => {
    expect(queueToSlotOverflowTemplate(baseVars)).toMatchInlineSnapshot(
      `"Dr. Patel has reorganised Mon, May 18. Your token #3 is now an overflow slot at end of session (estimated 10:00 AM). You'll be seen after all scheduled patients. Reschedule: https://example.com/book?token=abc"`
    );
  });
});
