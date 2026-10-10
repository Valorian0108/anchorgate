import type { ReactNode } from "react";
import { AnchorMark } from "@/components/anchor-mark";
import { EngineLine } from "@/components/engine-line";
import { Nav } from "@/components/nav";
import { verifyOwner } from "@/lib/auth/dal";
import { signOut } from "@/app/(auth)/signin/actions";

/**
 * The signed-in chrome: masthead, engine line, navigation. Wraps the product
 * screens (Gate, Statute, Record, request detail). The sign-in flow lives in
 * its own route group with a quieter shell.
 *
 * The layout resolves the owner so the masthead can name who is signed in. The
 * layout is NOT the security boundary — Next does not re-run it for every
 * nested navigation — so each page also calls `verifyOwner`.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const owner = await verifyOwner();

  return (
    <div className="wrap">
      <header>
        <div className="wordmark">
          <AnchorMark />
          <span className="name">AnchorGate</span>
        </div>
        <Nav />
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

      <EngineLine />

      <main>{children}</main>
    </div>
  );
}
