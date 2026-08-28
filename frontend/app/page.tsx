import type { Metadata } from "next";

import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCtaBand } from "@/components/marketing/FinalCtaBand";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { TrustBand } from "@/components/marketing/TrustBand";

const TITLE = "Halo Aid — Turn patient DMs into booked consultations";
const DESCRIPTION =
  "Halo Aid helps doctors turn Instagram DMs and comments into booked consultations. Capture, reply, book, and consult — all in one place.";

// `title.absolute` keeps the landing title clean (no "· Halo Aid" template
// suffix) since the headline already leads with the brand name.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Halo Aid",
    images: [{ url: "/brand/halo-og.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/halo-og.svg"],
  },
};

export default function HomePage() {
  return (
    <div className="halo flex min-h-screen flex-col bg-white text-[hsl(var(--halo-ink))]">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <FeatureGrid />
        <TrustBand />
        <FinalCtaBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
