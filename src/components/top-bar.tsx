/**
 * The navigation console (canon §6(j), frost object 2).
 *
 * One floating frost object at the top of the page, on the same 1200px
 * envelope as everything below, the ice visible all around it. It sits
 * still: it scrolls away with the page, because nothing follows the owner
 * (owner call 13 oct 2026). Mark tile, wordmark, the nav keys, then the
 * away count, the owner line and Sign out.
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
