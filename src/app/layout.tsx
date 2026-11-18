import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Timberhill's own typefaces, self-hosted: League Spartan for headings and
// Inter for everything else, as on the brand style sheet and the website.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
  src: "./fonts/inter-latin-wght-normal.woff2",
});

const leagueSpartan = localFont({
  variable: "--font-league-spartan",
  display: "swap",
  weight: "100 900",
  src: "./fonts/league-spartan-latin-wght-normal.woff2",
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
      className={`${inter.variable} ${leagueSpartan.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
