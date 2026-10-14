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

/** Layer 1 of the ice ground: our own washed architectural silhouette,
 *  still (image-settled 14 oct 2026: the harbour vignette became
 *  architecture). The masses carry the structure the frost blurs; the fine
 *  lines keep it linework up close. Presence lives in the CSS (.art, 9%). */
function ArchitecturalArt() {
  return (
    <svg
      className="art"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g fill="currentColor" stroke="none">
        {/* central spire: the mass the instrument band blurs */}
        <path d="M655 340 L660 96 L665 340 Z" fillOpacity="0.9" />
        <path d="M614 900 V400 L660 340 L706 400 V900 Z" />
        <path
          d="M640 400 h40 v18 h-40 Z M640 448 h40 v18 h-40 Z M640 496 h40 v18 h-40 Z"
          fillOpacity="0.55"
        />
        {/* right tower, conical roof */}
        <path d="M1046 900 V540 L1092 448 L1138 540 V900 Z" fillOpacity="0.85" />
        <path d="M1074 560 h36 v16 h-36 Z M1074 604 h36 v16 h-36 Z" fillOpacity="0.5" />
        {/* left roof plane */}
        <path d="M0 646 L348 560 V704 L0 768 Z" fillOpacity="0.6" />
        {/* arcade band across the foot, arches cut out */}
        <path
          fillOpacity="0.5"
          fillRule="evenodd"
          d="M0 900 V756 H1440 V900 Z
             M60 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M260 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M460 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M660 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M860 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M1060 900 v-64 a44 44 0 0 1 88 0 v64 Z
             M1260 900 v-64 a44 44 0 0 1 88 0 v64 Z"
        />
      </g>
      {/* fine structural lines: beams, columns, the finial */}
      <line x1="84" y1="520" x2="560" y2="520" />
      <line x1="84" y1="556" x2="520" y2="556" />
      <line x1="120" y1="520" x2="120" y2="700" />
      <line x1="212" y1="520" x2="212" y2="700" />
      <line x1="304" y1="520" x2="304" y2="700" />
      <line x1="760" y1="470" x2="1010" y2="470" />
      <line x1="1180" y1="620" x2="1400" y2="620" />
      <line x1="660" y1="96" x2="660" y2="60" />
      <circle cx="660" cy="52" r="6" />
    </svg>
  );
}

/**
 * The ice ground itself: pale field, washed architectural silhouette,
 * finest grain. Fixed behind everything, composed once, never animated.
 * Exported so the signed-out screens (front door, sign-in) paint the same
 * ground.
 */
export function IceBackdrop() {
  return (
    <div className="ice-backdrop" aria-hidden="true">
      <ArchitecturalArt />
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
