import type { ReactNode } from "react";
import { AnchorMark } from "@/components/anchor-mark";
import { EngineLine } from "@/components/engine-line";
import { Nav } from "@/components/nav";

/**
 * The signed-in chrome: masthead, engine line, navigation. Wraps the product
 * screens (Gate, Statute, Record, request detail). The sign-in flow lives in
 * its own route group with a quieter shell.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrap">
      <header>
        <div className="wordmark">
          <AnchorMark />
          <span className="name">AnchorGate</span>
        </div>
        <Nav />
      </header>

      <EngineLine />

      <main>{children}</main>
    </div>
  );
}