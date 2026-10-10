import type { ReactNode } from "react";
import { AnchorMark } from "@/components/anchor-mark";

/**
 * The signed-out chrome: the wordmark and nothing else. Mirrors
 * design-research/signin.comp.html — quiet before the ceremony.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrap">
      <header>
        <div className="wordmark">
          <AnchorMark />
          <span className="name">AnchorGate</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
