import { describe, expect, it } from '@jest/globals';
import {
  buildHoursMissingLead,
  buildLocationOnBookingPageLead,
  buildPricesOnBookingPageLead,
  buildReceptionistThanksMessage,
  isClinicalAdviceUserMessage,
  isHoursFaqUserMessage,
  isLocationFaqUserMessage,
  isThanksOnlyUserMessage,
} from '../../../src/utils/instagram-faq-copy';

describe('instagram-faq-copy', () => {
  it('detects hours / location / thanks', () => {
    expect(isHoursFaqUserMessage('what are your hours')).toBe(true);
    expect(isLocationFaqUserMessage('where is the clinic')).toBe(true);
    expect(isLocationFaqUserMessage('when is my appointment')).toBe(false);
    expect(isThanksOnlyUserMessage('thanks')).toBe(true);
    expect(isThanksOnlyUserMessage('thanks for the link, also fever')).toBe(false);
  });

  it('routes prescribe / advice / artifacts away from the LLM', () => {
    expect(
      isClinicalAdviceUserMessage('are you a doctor? can you prescribe something for my cough?')
    ).toBe(true);
    expect(isClinicalAdviceUserMessage('please advise what to do for my cough')).toBe(true);
    expect(isClinicalAdviceUserMessage('what should I take for fever')).toBe(true);
    expect(isClinicalAdviceUserMessage('can you refill my medicine')).toBe(true);
    expect(isClinicalAdviceUserMessage('send my prescription here')).toBe(true);
    expect(isClinicalAdviceUserMessage('I will send my lab reports here')).toBe(true);
    expect(isClinicalAdviceUserMessage('I need a medical certificate')).toBe(true);
    expect(isClinicalAdviceUserMessage('I am pregnant is paracetamol safe')).toBe(true);
    expect(isClinicalAdviceUserMessage('do you treat diabetes')).toBe(true);
    expect(isClinicalAdviceUserMessage('my BP is 150/90 this morning')).toBe(true);
    expect(isClinicalAdviceUserMessage('hello doctor')).toBe(false);
    expect(isClinicalAdviceUserMessage('when can I see the doctor')).toBe(false);
    expect(isClinicalAdviceUserMessage('do you take insurance')).toBe(false);
  });

  it('leads stay receptionist — no catalog, doctor name, or 112', () => {
    expect(buildPricesOnBookingPageLead('en')).toBe('Prices are on the booking page.');
    expect(buildHoursMissingLead('en')).toBe('Timings are on the booking page.');
    expect(buildLocationOnBookingPageLead('en')).toBe('You can book on the website.');
    expect(buildReceptionistThanksMessage('en')).toBe("You're welcome.");
    expect(buildPricesOnBookingPageLead('en').toLowerCase()).not.toContain('112');
    expect(buildPricesOnBookingPageLead('en').toLowerCase()).not.toContain('teleconsult');
  });
});
