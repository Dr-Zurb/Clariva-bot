import { DeskAccessNotice } from "@/components/desk/DeskAccessNotice";
import { DeskCheckInSplit } from "@/components/desk/DeskCheckInSplit";
import { DeskPageHeader } from "@/components/desk/DeskPageHeader";
import { requireDeskAuth } from "@/lib/auth/server-user";
import { probeDeskAccess } from "@/lib/desk/api";

export const metadata = { title: "Check-in · Front desk" };

export default async function DeskIntakePage() {
  const { token } = await requireDeskAuth();
  const access = await probeDeskAccess(token);

  if (access !== "ok") {
    return (
      <div>
        <DeskPageHeader
          title="Check-in"
          description="Search a mobile or MRN, or add name, age, relative name, and mobile to search."
        />
        <DeskAccessNotice state={access} />
      </div>
    );
  }

  return <DeskCheckInSplit token={token} />;
}
