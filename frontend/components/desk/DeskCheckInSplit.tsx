"use client";

import { DeskIntakeClient } from "@/components/desk/DeskIntakeClient";
import { DeskPageHeader } from "@/components/desk/DeskPageHeader";

export function DeskCheckInSplit({ token }: { token: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DeskPageHeader
        title="Check-in"
        description="Search a mobile or MRN, or add name, age, relative name, and mobile to search."
      />
      <DeskIntakeClient token={token} />
    </div>
  );
}
