/**
 * CLI argument parser for `scripts/provision-clinic-staff.ts`.
 * Kept in src so unit tests can cover it without loading env.
 */

import { ValidationError } from './errors';

export type ClinicStaffCliAction = 'provision' | 'suspend' | 'reactivate';

export interface ClinicStaffCliArgs {
  action: ClinicStaffCliAction;
  email: string;
  doctorId?: string;
  displayName?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseClinicStaffCliArgs(argv: string[]): ClinicStaffCliArgs {
  let action: ClinicStaffCliAction = 'provision';
  let email = '';
  let doctorId = '';
  let displayName = '';

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--suspend') {
      action = 'suspend';
    } else if (token === '--reactivate') {
      action = 'reactivate';
    } else if (token === '--email') {
      i += 1;
      email = (argv[i] ?? '').trim();
    } else if (token === '--doctor-id') {
      i += 1;
      doctorId = (argv[i] ?? '').trim();
    } else if (token === '--display-name') {
      i += 1;
      displayName = (argv[i] ?? '').trim();
    } else if (token === '--help' || token === '-h') {
      throw new ValidationError(
        'Usage: provision-clinic-staff --email <addr> --doctor-id <uuid> [--display-name <name>]\n' +
          '       provision-clinic-staff --suspend|--reactivate --email <addr>'
      );
    }
  }

  if (!email || !email.includes('@')) {
    throw new ValidationError('--email is required');
  }

  if (action === 'provision') {
    if (!doctorId || !UUID_RE.test(doctorId)) {
      throw new ValidationError('--doctor-id must be a UUID');
    }
    return {
      action,
      email: email.toLowerCase(),
      doctorId,
      displayName: displayName || undefined,
    };
  }

  return { action, email: email.toLowerCase() };
}
