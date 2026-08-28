/**
 * Shared constants for the Halo Aid marketing home page (halo-aid-home batch)
 * and Book-a-demo surface (halo-aid-demo-cta batch).
 *
 * CTA destinations + the reusable "Halo blue" button class (an override on the
 * shared `Button` component so marketing CTAs read blue instead of the app's
 * teal `--primary`). Blue tokens are defined on the `.halo` wrapper in
 * `app/globals.css` (HAH-D1) — never in `:root`.
 */

export const SIGNUP_HREF = "/signup";
export const LOGIN_HREF = "/login";

/** Branded demo landing (Cal.com embed). */
export const DEMO_HREF = "/demo";

/**
 * Cal.com event path for the inline embed (DEMO-D3).
 * Override with NEXT_PUBLIC_DEMO_CAL_LINK if the slug ever changes.
 */
export const DEMO_CAL_LINK =
  process.env.NEXT_PUBLIC_DEMO_CAL_LINK?.trim() || "halo.aid/demo";

/**
 * EU data region origin — required for cal.eu accounts (DEMO-D2).
 * Without this, @calcom/embed-react defaults to app.cal.com and 404s.
 */
export const DEMO_CAL_ORIGIN =
  process.env.NEXT_PUBLIC_DEMO_CAL_ORIGIN?.trim() || "https://app.cal.eu";

/**
 * Halo-blue primary button. Overrides the teal `bg-primary` / ring from
 * `buttonVariants` via tailwind-merge (last conflicting class wins).
 */
export const haloPrimaryButton =
  "bg-[hsl(var(--halo-blue))] text-white shadow-sm hover:bg-[hsl(var(--halo-blue))]/90 focus-visible:ring-[hsl(var(--halo-blue))]";

/** Absolute home anchors so MarketingNav works from `/demo` and other public routes. */
export const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
] as const;
