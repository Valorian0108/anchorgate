/**
 * The seamless ice top bar (canon §10, frost object 2).
 *
 * Full-bleed at the top of the page with a hairline bottom edge; its contents
 * sit on the same 1200px wrap as everything below. It sits still: it scrolls
 * away with the page, because nothing follows the owner (owner call
 * 13 oct 2026). Mark tile, wordmark, nav pills, then the away count, the
 * owner line and Sign out.
 */

import { signOut } from "@/app/(auth)/signin/actions";

import { AnchorMark } from "./anchor-mark";
import { AwayBadge } from "./away-badge";
import { Nav } from "./nav";

export function TopBar({ email }: { email: string }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <span className="mark" aria-hidden="true">
          <AnchorMark />
        </span>
        <span className="brand">AnchorGate</span>
        <Nav />
        <span className="right">
          <AwayBadge />
          <span className="owner">
            <span className="who" title={email}>
              {email}
            </span>
            <form action={signOut}>
              <button className="signout" type="submit">
                Sign out
              </button>
            </form>
          </span>
        </span>
      </div>
    </header>
  );
}
