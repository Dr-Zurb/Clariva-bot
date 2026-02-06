/**
 * Sends the same two doctor emails the app sends in the real flow:
 * 1. "New appointment booked" (after booking)
 * 2. "Payment received for appointment" (after payment webhook)
 *
 * Uses dummy IDs; getDoctorEmail falls back to DEFAULT_DOCTOR_EMAIL so you
 * get both emails without running the server, worker, or gateways.
 *
 * Run from backend: npm run test:full-notifications
 */

import {
  sendNewAppointmentToDoctor,
  sendPaymentReceivedToDoctor,
} from '../src/services/notification-service';

const correlationId = 'full-notification-test-' + Date.now();
const doctorId = '00000000-0000-0000-0000-000000000001';
const appointmentId = '00000000-0000-0000-0000-000000000002';
const appointmentDateIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function main() {
  console.log('Sending full notification test (2 doctor emails)...\n');

  const ok1 = await sendNewAppointmentToDoctor(
    doctorId,
    appointmentId,
    appointmentDateIso,
    correlationId
  );
  console.log(ok1 ? '1. New appointment email: sent' : '1. New appointment email: failed or skipped');

  const ok2 = await sendPaymentReceivedToDoctor(
    doctorId,
    appointmentId,
    appointmentDateIso,
    correlationId
  );
  console.log(ok2 ? '2. Payment received email: sent' : '2. Payment received email: failed or skipped');

  if (ok1 && ok2) {
    console.log('\nDone. Check your inbox (and spam) for both emails.');
    process.exit(0);
  } else {
    console.log('\nOne or both emails did not send. Check logs above and RESEND_API_KEY / DEFAULT_DOCTOR_EMAIL.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
