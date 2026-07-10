import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Caveat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display / headings for the marketing site.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

// Handwritten script — used only for the "data" half of the wordmark.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "datamodo — Forward the mess. Get back a spreadsheet.",
  description:
    "Forward any email to your datamodo address. We turn the mess into a queryable memory and suggest structured datasets built from your inbox.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} ${caveat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
