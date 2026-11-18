import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Jost, self-hosted: the typeface of jrstrengthandfitness.com, so the hub
// reads as part of the same family of sites.
const jost = localFont({
  variable: "--font-jost",
  display: "swap",
  src: [
    { path: "./fonts/jost-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/jost-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/jost-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/jost-latin-700-normal.woff2", weight: "700" },
    { path: "./fonts/jost-latin-800-normal.woff2", weight: "800" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Timberhill Hub",
    template: "%s · Timberhill Hub",
  },
  description:
    "Timberhill Athletic Club personal training hub: payroll, package audit, trainers, reports and the website.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jost.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
