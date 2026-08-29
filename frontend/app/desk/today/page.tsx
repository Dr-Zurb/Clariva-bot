import { DeskAccessNotice } from "@/components/desk/DeskAccessNotice";
import { DeskPageHeader } from "@/components/desk/DeskPageHeader";
import { DeskTodayClient } from "@/components/desk/DeskTodayClient";
import { requireDeskAuth } from "@/lib/auth/server-user";
import { probeDeskAccess } from "@/lib/desk/api";

export const metadata = { title: "Today · Front desk" };

export default async function DeskTodayPage() {
  const { token } = await requireDeskAuth();
  const access = await probeDeskAccess(token);

  return (
    <div>
      <DeskPageHeader
        title="Today"
        description="Who is waiting, who has arrived, and who the doctor has seen."
      />
      {access !== "ok" ? (
        <DeskAccessNotice state={access} />
      ) : (
        <DeskTodayClient token={token} />
      )}
    </div>
  );
}
