import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ContainerQueryPolyfillLoader } from "@/components/ContainerQueryPolyfillLoader";
import "./globals.css";

/**
 * Inter via next/font (UI-1).
 *
 * `--font-sans` is consumed by tailwind.config.ts `fontFamily.sans` so
 * every component picking up the default sans stack inherits Inter
 * automatically. `display: "swap"` keeps the first paint readable on
 * slow connections.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
  title: {
    default: "Clariva",
    template: "%s · Clariva",
  },
  description: "Digital infrastructure for doctors operating on social media.",
  applicationName: "Clariva",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "Clariva",
    description: "Digital infrastructure for doctors operating on social media.",
    type: "website",
    siteName: "Clariva",
    images: [{ url: "/brand/og.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ContainerQueryPolyfillLoader />
        {children}
      </body>
    </html>
  );
}
