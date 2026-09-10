/**
 * One-shot previsit notify ladder tick (T−24h / T−30 / T−15 / T−5).
 *
 * Run from backend: npm run job:previsit
 * Loads .env via dotenv/config. No CRON_SECRET required.
 */

import { runConsultationCheckinJob } from '../src/services/consultation-checkin-job';

async function main(): Promise<void> {
  const correlationId = `job-previsit-${Date.now()}`;
  console.log('Running consultation-checkin job…');
  const data = await runConsultationCheckinJob(correlationId);
  console.log(JSON.stringify({ success: true, data }, null, 2));
  process.exit(data.errors > 0 && data.notificationsFired === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
