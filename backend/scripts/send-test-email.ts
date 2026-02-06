/**
 * One-off script to send a test email via Resend.
 * Use to verify RESEND_API_KEY and DEFAULT_DOCTOR_EMAIL without running the full flow.
 *
 * Run from backend: npm run test:email
 * (Loads .env via dotenv/config so RESEND_API_KEY and DEFAULT_DOCTOR_EMAIL are available.)
 */

import { sendEmail } from '../src/config/email';
import { env } from '../src/config/env';

const correlationId = 'test-email-' + Date.now();
const to = (env.DEFAULT_DOCTOR_EMAIL ?? process.env.DEFAULT_DOCTOR_EMAIL)?.trim();

if (!to) {
  console.error('No DEFAULT_DOCTOR_EMAIL in .env. Set it and try again.');
  process.exit(1);
}

const recipient: string = to;

async function main() {
  console.log('Sending test email to:', recipient);
  const ok = await sendEmail(
    recipient,
    'Clariva test – notifications working',
    'This is a test email from the Clariva backend. If you got this, Resend and your env are set up correctly.',
    correlationId
  );
  if (ok) {
    console.log('Email sent. Check your inbox (and spam).');
  } else {
    console.log('Email was not sent. Check logs above and RESEND_API_KEY in .env.');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
