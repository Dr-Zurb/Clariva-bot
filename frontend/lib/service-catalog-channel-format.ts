import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";

/** Compact price line for list rows (same string fields as save flow). Vid · V · T */
export function formatServiceChannelSummary(s: ServiceOfferingDraft): string {
  const fmt = (on: boolean, price: string) => (on ? (price.trim() ? price.trim() : "—") : "off");
  return `Vid ${fmt(s.videoEnabled, s.videoPriceMain)} · V ${fmt(s.voiceEnabled, s.voicePriceMain)} · T ${fmt(s.textEnabled, s.textPriceMain)}`;
}
