"use client";

/**
 * The ice chrome, on every screen (owner call, 13 oct 2026).
 *
 * One product, one ground: the composed still backdrop and the seamless
 * top bar are shared by the Gate, the Record, the Statute, the case
 * files and the front door. The Gate keeps the full cockpit; the other
 * screens are "icy paper": the same language with matte panels instead
 * of glass.
 *
 * The engine line (the instrument whisper) shows on every signed-in
 * screen except the Gate, which carries the live status strip instead.
 * The switch reads the pathname, available during server rendering too,
 * so the right chrome is painted on first byte with no flash.
 */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Layer 1 of the ice ground: our own washed harbour line drawing, still. */
function HarbourArt() {
  return (
    <svg
      className="art"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="-40" y1="660" x2="1480" y2="660" />
      <g transform="translate(880,120) scale(16)" strokeWidth="0.13">
        <circle cx="12" cy="5" r="2.5" />
        <line x1="12" y1="7.5" x2="12" y2="20" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <path d="M4 14c0 4 3.5 6 8 6s8-2 8-6" />
      </g>
      <path d="M140 -60 C 300 140, 240 300, 420 380 S 700 470, 840 430" />
      <circle cx="230" cy="80" r="10" />
      <circle cx="280" cy="180" r="10" />
      <circle cx="300" cy="280" r="10" />
      <circle cx="380" cy="350" r="10" />
      <path d="M250 660 V 350 L 390 312" />
      <line x1="250" y1="450" x2="340" y2="450" />
      <path d="M560 660 l 44 62 h 300 l 44 -62" />
      <line x1="660" y1="660" x2="660" y2="490" />
      <line x1="820" y1="660" x2="820" y2="520" />
      <path d="M660 490 l 70 24" />
      <path d="M820 520 l 56 20" />
      <path d="M430 220 q 14 -12 28 0" />
      <path d="M500 190 q 12 -10 24 0" />
      <path d="M90 660 l 16 -150 h 28 l 16 150" />
      <line x1="98" y1="580" x2="142" y2="580" />
    </svg>
  );
}

/**
 * The ice ground itself: pale field, washed harbour art, finest grain.
 * Fixed behind everything, composed once, never animated. Exported so
 * the signed-out screens (front door, sign-in) paint the same ground.
 */
export function IceBackdrop() {
  return (
    <div className="ice-backdrop" aria-hidden="true">
      <HarbourArt />
      <div className="grain" />
    </div>
  );
}

export function Chrome({
  topbar,
  engine,
  children,
}: {
  /** The seamless ice top bar (server-rendered: owner, nav, sign-out). */
  topbar: ReactNode;
  /** The engine line, shown on every signed-in screen except the Gate. */
  engine: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isGate = pathname === "/";

  return (
    <div className="surface-ice">
      <IceBackdrop />
      {topbar}
      <main className="wrap">
        {isGate ? null : engine}
        {children}
      </main>
    </div>
  );
}
