import { DeskAccessNotice } from "@/components/desk/DeskAccessNotice";
import { DeskPageHeader } from "@/components/desk/DeskPageHeader";
import { DeskTodayClient } from "@/components/desk/DeskTodayClient";
import { requireDeskAuth } from "@/lib/auth/server-user";
import {
  classifyDeskAccessError,
  getDeskClinicContext,
  type DeskAccessState,
} from "@/lib/desk/api";
import { isDeskLabsOnly, isDeskPrepOnly } from "@/lib/desk/capabilities";

export const metadata = { title: "Today · Staff" };

export default async function DeskTodayPage() {
  const { token } = await requireDeskAuth();
  let access: DeskAccessState = "ok";
  let capabilities: string[] | undefined;
  try {
    const context = await getDeskClinicContext(token);
    capabilities = context.data.capabilities;
  } catch (err) {
    access = classifyDeskAccessError(err);
  }

  return (
    <div>
      <DeskPageHeader
        title={isDeskLabsOnly(capabilities) ? "Labs" : "Today"}
        description={
          isDeskLabsOnly(capabilities)
            ? "Pick the visit day, then upload the report."
            : isDeskPrepOnly(capabilities)
            ? "Open an arrived visit to do your job."
            : "Who is waiting, who has arrived, and who the doctor has seen."
        }
      />
      {access !== "ok" ? (
        <DeskAccessNotice state={access} />
      ) : (
        <DeskTodayClient token={token} />
      )}
    </div>
  );
}
