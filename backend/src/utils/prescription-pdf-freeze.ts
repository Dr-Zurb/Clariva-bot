/**
 * clinic-branding-v1 · BRD-D4 — sent Rx keep the letterhead they were sent with.
 */

import { ConflictError } from './errors';

export function assertUnsentForRegenerate(sentToPatientAt: string | null): void {
  if (sentToPatientAt) {
    throw new ConflictError(
      'This prescription was already sent. The patient copy keeps the letterhead it was sent with.'
    );
  }
}
