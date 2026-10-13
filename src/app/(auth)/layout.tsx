import type { ReactNode } from "react";
import { AnchorMark } from "@/components/anchor-mark";
import { IceBackdrop } from "@/components/chrome";

/**
 * The signed-out chrome, in ice: the same ground and the same seamless
 * top bar as the Gate, carrying only the mark and the wordmark. Quiet
 * before the ceremony; nothing to sign out of, nothing to navigate.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="surface-ice">
      <IceBackdrop />
      <header className="topbar">
        <div className="topbar-in">
          <span className="mark" aria-hidden="true">
            <AnchorMark />
          </span>
          <span className="brand">AnchorGate</span>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </div>
  );
}
