import { redirect } from "next/navigation";

import { DeskAccessNotice } from "@/components/desk/DeskAccessNotice";
import { DeskCheckInSplit } from "@/components/desk/DeskCheckInSplit";
import { DeskPageHeader } from "@/components/desk/DeskPageHeader";
import { requireDeskAuth } from "@/lib/auth/server-user";
import {
  classifyDeskAccessError,
  getDeskClinicContext,
  type DeskAccessState,
} from "@/lib/desk/api";
import { deskHomeHref } from "@/lib/desk/capabilities";

export const metadata = { title: "Check-in · Staff" };

export default async function DeskIntakePage() {
  const { token } = await requireDeskAuth();
  let access: DeskAccessState = "ok";
  let capabilities: string[] | undefined;
  try {
    const context = await getDeskClinicContext(token);
    capabilities = context.data.capabilities;
  } catch (err) {
    access = classifyDeskAccessError(err);
  }

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

  if (deskHomeHref(capabilities) === "/desk/today") {
    redirect("/desk/today");
  }

  return <DeskCheckInSplit token={token} />;
}
