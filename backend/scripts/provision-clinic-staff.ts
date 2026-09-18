/**
 * Provision or suspend a receptionist staff account (receptionist-portal P1).
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/provision-clinic-staff.ts \
 *     --email desk@clinic.test --doctor-id <DOCTOR_UUID> --display-name "Front desk"
 *
 *   npx ts-node -r dotenv/config scripts/provision-clinic-staff.ts \
 *     --suspend --email desk@clinic.test
 */

import {
  provisionClinicStaff,
  setClinicStaffStatusByEmail,
} from '../src/services/clinic-staff-provision-service';
import { parseClinicStaffCliArgs } from '../src/utils/clinic-staff-cli';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../src/utils/errors';

const CORRELATION_ID = 'provision-clinic-staff';

async function main(): Promise<void> {
  const args = parseClinicStaffCliArgs(process.argv.slice(2));

  if (args.action === 'suspend' || args.action === 'reactivate') {
    const status = args.action === 'suspend' ? 'suspended' : 'active';
    const link = await setClinicStaffStatusByEmail(args.email, status, CORRELATION_ID);
    console.log(
      JSON.stringify(
        {
          action: args.action,
          staffUserId: link.staffUserId,
          doctorId: link.doctorId,
          status: link.status,
        },
        null,
        2
      )
    );
    return;
  }

  if (!args.doctorId) {
    throw new ValidationError('--doctor-id is required');
  }

  const result = await provisionClinicStaff(
    {
      email: args.email,
      doctorId: args.doctorId,
      displayName: args.displayName,
    },
    CORRELATION_ID
  );

  console.log(
    JSON.stringify(
      {
        action: 'provision',
        created: result.created,
        staffUserId: result.link.staffUserId,
        doctorId: result.link.doctorId,
        role: result.link.role,
        status: result.link.status,
        ...(result.temporaryPassword
          ? { temporaryPassword: result.temporaryPassword }
          : {}),
      },
      null,
      2
    )
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  const code =
    err instanceof ValidationError ||
    err instanceof ForbiddenError ||
    err instanceof NotFoundError ||
    err instanceof InternalError
      ? err.statusCode
      : 1;
  console.error(message);
  process.exit(code >= 400 ? 1 : code || 1);
});
