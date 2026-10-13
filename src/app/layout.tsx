import type { ReactNode } from "react";
import { IBM_Plex_Mono, Newsreader, Sora } from "next/font/google";
import "./globals.css";

// Sora is the interface voice everywhere (canon §1); the serif keeps its
// ceremony job on the Print screens only.
const g = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const s = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const m = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plexmono",
  display: "swap",
});

export const metadata = {
  title: "AnchorGate · AI spending, under your rules",
  description:
    "The assistant suggests purchases, your rules decide. A hard monthly limit and per-purchase lines no app can move.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${g.variable} ${s.variable} ${m.variable}`}>
      <body>{children}</body>
    </html>
  );
}