"use client";

import { usePathname } from "next/navigation";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

/**
 * Settings layout: breadcrumb only. No tab bar; navigation via sidebar.
 * Key on pathname ensures child pages remount when navigating, so they always fetch fresh data.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div>
      <Breadcrumb />
      <div key={pathname ?? "settings"}>{children}</div>
    </div>
  );
}
