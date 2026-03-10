"use client";

import { Breadcrumb } from "@/components/layout/Breadcrumb";

/**
 * Settings layout: breadcrumb only. No tab bar; navigation via sidebar.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Breadcrumb />
      {children}
    </div>
  );
}
