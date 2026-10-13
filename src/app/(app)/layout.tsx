import type { ReactNode } from "react";
import { Chrome } from "@/components/chrome";
import { EngineLine } from "@/components/engine-line";
import { FeedProvider } from "@/components/feed-provider";
import { TopBar } from "@/components/top-bar";
import { verifyOwner } from "@/lib/auth/dal";

/**
 * The signed-in chrome: one language everywhere (owner call, 13 oct 2026).
 *
 * Every screen wears the ice: the composed backdrop, the seamless top
 * bar, and below it either the Gate cockpit (at "/") or the icy-paper
 * screens (Record, Statute, case files). `Chrome` renders the engine
 * line on every screen except the Gate, which carries the live status
 * strip instead. The switch happens on the server, so there is no flash
 * and no client round trip.
 *
 * The layout resolves the owner so the chrome can name who is signed in.
 * The layout is NOT the security boundary — Next does not re-run it for
 * every nested navigation — so each page also calls `verifyOwner`.
 *
 * The live feed lives here too, so it keeps running while the owner
 * reads the Rules or the Record, and the "N new" badge and tab count can
 * tell them what arrived while they were away from the Gate.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const owner = await verifyOwner();

  return (
    <FeedProvider>
      <Chrome
        topbar={<TopBar email={owner.email} />}
        engine={<EngineLine userId={owner.userId} />}
      >
        {children}
      </Chrome>
    </FeedProvider>
  );
}
