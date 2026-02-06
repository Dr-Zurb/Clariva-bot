import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clariva Doctor Dashboard",
  description: "Digital infrastructure for doctors operating on social media",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
