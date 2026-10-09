import type { ReactNode } from "react";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const g = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
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
  title: "AnchorGate — authorization for AI spending",
  description:
    "The AI proposes, the gate decides. A hard monthly cap and per-purchase limits no model can move.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${g.variable} ${s.variable} ${m.variable}`}>
      <body>{children}</body>
    </html>
  );
}