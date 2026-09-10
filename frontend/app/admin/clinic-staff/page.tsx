import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ClinicStaffAdminClient } from "@/components/admin/clinic-staff/ClinicStaffAdminClient";
import { requireAdminAuth } from "@/lib/auth/server-user";

export const metadata = { title: "Front desk · Admin" };

export default async function AdminClinicStaffPage() {
  const { token } = await requireAdminAuth();

  return (
    <div>
      <AdminPageHeader
        title="Front desk staff"
        description="Many receptionist logins per doctor — only one active. Extra adds start suspended. Delete removes the link."
      />
      <ClinicStaffAdminClient token={token} />
    </div>
  );
}
