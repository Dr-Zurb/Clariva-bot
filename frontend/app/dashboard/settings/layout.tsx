"use client";

import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

/**
 * Settings layout: breadcrumb only. No tab bar; navigation via sidebar.
 * Forces remount of availability page when navigating to it so slots always load fresh.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const availabilityVisitRef = useRef(0);

  useEffect(() => {
    if (pathname?.endsWith("/availability")) {
      availabilityVisitRef.current += 1;
    }
  }, [pathname]);

  const isAvailability = pathname?.endsWith("/availability");
  const key = isAvailability ? `availability-${availabilityVisitRef.current}` : undefined;

  return (
    <div>
      <Breadcrumb />
      {key ? <div key={key}>{children}</div> : children}
    </div>
  );
}
