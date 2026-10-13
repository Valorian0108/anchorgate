import type { ReactNode } from "react";
import { AnchorMark } from "@/components/anchor-mark";
import { AwayBadge } from "@/components/away-badge";
import { Chrome } from "@/components/chrome";
import { EngineLine } from "@/components/engine-line";
import { FeedProvider } from "@/components/feed-provider";
import { Nav } from "@/components/nav";
import { TopBar } from "@/components/top-bar";
import { verifyOwner } from "@/lib/auth/dal";
import { signOut } from "@/app/(auth)/signin/actions";

/**
 * The signed-in chrome, in two skins (canon §7, §9, §10).
 *
 * The Gate wears the live ice: the seamless top bar over the cockpit. The
 * Print and statute screens keep the warm paper masthead and the engine line
 * they were comped with. `Chrome` picks the skin from the pathname on the
 * server, so there is no flash and no client round trip.
 *
 * The layout resolves the owner so the chrome can name who is signed in. The
 * layout is NOT the security boundary — Next does not re-run it for every
 * nested navigation — so each page also calls `verifyOwner`.
 *
 * The live feed lives here too, so it keeps running while the owner reads the
 * Rules or the Record, and the "N new" badge and tab count can tell them what
 * arrived while they were away from the Gate.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const owner = await verifyOwner();

  const paper = (
    <>
      <header>
        <div className="wordmark">
          <AnchorMark />
          <span className="name">AnchorGate</span>
        </div>
        <Nav />
        <AwayBadge />
        <div className="owner">
          <span className="who" title={owner.email}>
            {owner.email}
          </span>
          <form action={signOut}>
            <button className="signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <EngineLine userId={owner.userId} />
    </>
  );

  return (
    <FeedProvider>
      <Chrome ice={<TopBar email={owner.email} />} paper={paper}>
        {children}
      </Chrome>
    </FeedProvider>
  );
}
