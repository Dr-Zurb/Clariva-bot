import { describe, expect, it } from '@jest/globals';
import {
  lastBotAskedForConsultationChannel,
  parseConsultationChannelUserReply,
} from '../../../src/utils/dm-consultation-channel';

describe('dm-consultation-channel (RBH-20)', () => {
  it('detects in-clinic vs video style prompt', () => {
    const recent = [
      { sender_type: 'patient', content: 'ok' },
      {
        sender_type: 'system',
        content:
          'Confirm: video or **in-clinic** (123 Main St)? Fee: In-clinic ₹10, Video ₹2000.',
      },
    ];
    expect(lastBotAskedForConsultationChannel(recent)).toBe(true);
  });

  it('detects text/voice/video choice without in-clinic', () => {
    const recent = [
      { sender_type: 'patient', content: 'hi' },
      {
        sender_type: 'system',
        content: 'Do you prefer **video**, **voice**, or **text** chat?',
      },
    ];
    expect(lastBotAskedForConsultationChannel(recent)).toBe(true);
  });

  it('parseConsultationChannelUserReply handles short modality replies', () => {
    expect(parseConsultationChannelUserReply('video')).toBe('video');
    expect(parseConsultationChannelUserReply('voice please')).toBe('voice');
    expect(parseConsultationChannelUserReply('text')).toBe('text');
    expect(parseConsultationChannelUserReply('in-clinic')).toBe('in_clinic');
  });

  it('parseConsultationChannelUserReply returns null for likely patient data blobs', () => {
    expect(
      parseConsultationChannelUserReply(
        'Abhishek 26 Male 8264602737 as.sahil@email.com blood sugar'
      )
    ).toBeNull();
  });
});
