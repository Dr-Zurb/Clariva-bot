"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

import { DEMO_CAL_LINK, DEMO_CAL_ORIGIN } from "./constants";

/**
 * Inline Cal.com EU embed for `/demo` (halo-aid-demo-cta · DEMO-02).
 * Must pass `calOrigin` for EU accounts — default embed origin is app.cal.com.
 */
export function DemoScheduler() {
  useEffect(() => {
    void (async () => {
      const cal = await getCalApi({
        namespace: "halo-aid-demo",
        embedJsUrl: `${DEMO_CAL_ORIGIN}/embed/embed.js`,
      });
      cal("ui", {
        theme: "light",
        cssVarsPerTheme: {
          light: { "cal-brand": "#1E56E0" },
          dark: { "cal-brand": "#2E9BFF" },
        },
        hideEventTypeDetails: true,
      });
    })();
  }, []);

  return (
    <div
      className="min-h-[640px] w-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
      aria-label="Schedule a Halo Aid demo"
    >
      <Cal
        namespace="halo-aid-demo"
        calLink={DEMO_CAL_LINK}
        calOrigin={DEMO_CAL_ORIGIN}
        embedJsUrl={`${DEMO_CAL_ORIGIN}/embed/embed.js`}
        style={{ width: "100%", height: "100%", overflow: "scroll" }}
        config={{ layout: "month_view", theme: "light" }}
      />
    </div>
  );
}
