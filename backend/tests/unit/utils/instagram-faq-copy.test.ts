import { describe, expect, it } from '@jest/globals';
import {
  buildAddressNotSharedLead,
  buildHoursMissingLead,
  buildLocationOnBookingPageLead,
  buildOnlineOnlyNoAddressLead,
  buildPaymentOnBookingPageLead,
  buildPricesOnBookingPageLead,
  buildReceptionistThanksMessage,
  isClinicalAdviceUserMessage,
  isHoursFaqUserMessage,
  isLocationFaqUserMessage,
  isOpsPaymentFaqUserMessage,
  isThanksOnlyUserMessage,
} from '../../../src/utils/instagram-faq-copy';

describe('instagram-faq-copy', () => {
  it('detects hours / location / thanks', () => {
    expect(isHoursFaqUserMessage('what are your hours')).toBe(true);
    expect(isHoursFaqUserMessage('availability')).toBe(true);
    expect(isOpsPaymentFaqUserMessage('do you take insurance')).toBe(true);
    expect(isOpsPaymentFaqUserMessage('cash or UPI')).toBe(true);
    expect(isOpsPaymentFaqUserMessage('how much is a consultation?')).toBe(false);
    expect(isLocationFaqUserMessage('where is the clinic')).toBe(true);
    expect(isLocationFaqUserMessage('adress ?')).toBe(true);
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
    expect(isClinicalAdviceUserMessage('i have headache')).toBe(true);
    expect(isClinicalAdviceUserMessage('hello doctor')).toBe(false);
    expect(isClinicalAdviceUserMessage('when can I see the doctor')).toBe(false);
    expect(isClinicalAdviceUserMessage('do you take insurance')).toBe(false);
    expect(isClinicalAdviceUserMessage('book')).toBe(false);
  });

  it('leads stay receptionist — no catalog, doctor name, or 112', () => {
    expect(buildPricesOnBookingPageLead('en')).toBe('Visit prices are on this page:');
    expect(buildHoursMissingLead('en')).toBe("I don't have timings saved. They're on this page:");
    expect(buildLocationOnBookingPageLead('en')).toBe('The clinic details are on this page:');
    expect(buildAddressNotSharedLead('en')).toBe(
      "I don't share a street address here. I can help with timings or a booking link."
    );
    expect(buildOnlineOnlyNoAddressLead('en')).toBe(
      "Appointments are online, so there isn't a street address. I can help with timings or a booking link."
    );
    expect(buildOnlineOnlyNoAddressLead('en')).not.toMatch(/teleconsult/i);
    expect(buildPaymentOnBookingPageLead('en')).toBe(
      "I don't have payment details saved. They're on this page:"
    );
    expect(buildReceptionistThanksMessage('en')).toBe("You're welcome.");
    expect(buildPricesOnBookingPageLead('en').toLowerCase()).not.toContain('112');
    expect(buildPricesOnBookingPageLead('en').toLowerCase()).not.toContain('teleconsult');
  });
});
