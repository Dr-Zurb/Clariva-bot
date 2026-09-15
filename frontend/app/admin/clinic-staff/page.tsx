import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ClinicStaffAdminClient } from "@/components/admin/clinic-staff/ClinicStaffAdminClient";
import { requireAdminAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Staff · Admin" };

export default async function AdminClinicStaffPage() {
  const { token } = await requireAdminAuth();

  return (
    <div>
      <AdminPageHeader
        title="Staff"
        description="Clinic logins per doctor. One active login per job. Extra adds for a taken job start suspended. Delete removes the link."
      />
      <ClinicStaffAdminClient token={token} />
    </div>
  );
}
