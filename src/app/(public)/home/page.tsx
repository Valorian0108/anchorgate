import type { CSSProperties } from "react";
import Link from "next/link";
import { AnchorMark } from "@/components/anchor-mark";
import { IceBackdrop } from "@/components/chrome";

/**
 * The front door for signed-out visitors (owner call, 13 oct 2026: one
 * address, two doors). The proxy rewrites "/" here when nobody is signed
 * in, so the shared address stays clean; signed-in owners land on the
 * Gate at "/" instead.
 *
 * Static on purpose: it promises nothing it has not read, and it reads
 * nothing. The instrument shown below is a labelled example, not live
 * data. Voice: plain, second person, no em dashes, grandma test.
 * Chrome: the same ice ground and the same seamless top bar as the Gate;
 * the panels here are matte (icy paper), because frost belongs to the
 * live cockpit.
 */

const DEMO_WALL = { "--spent-frac": 0.7125 } as CSSProperties;

export default function HomePage() {
  return (
    <div className="surface-ice">
      <IceBackdrop />
      <header className="topbar">
        <div className="topbar-in">
          <span className="mark" aria-hidden="true">
            <AnchorMark />
          </span>
          <span className="brand">AnchorGate</span>
          <span className="right">
            <Link className="tosignin" href="/signin">
              Sign in
            </Link>
          </span>
        </div>
      </header>

      <main className="wrap home">
        <section className="hero reveal" style={{ "--i": 0 } as CSSProperties}>
          <span className="cap">AI spending, under your rules</span>
          <h1>
            The assistant proposes. Your <span className="hook">rules</span>{" "}
            decide.
          </h1>
          <p className="sub">
            AnchorGate sits between your AI assistant and your card. Every
            purchase is checked against the limit you set, and nothing is paid
            without your okay.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" href="/signin">
              Sign in to the gate
            </Link>
            <a className="btn btn-quiet" href="#how">
              See how it works
            </a>
          </div>
        </section>

        <section
          className="band reveal"
          id="how"
          aria-label="How it works"
          style={{ "--i": 1 } as CSSProperties}
        >
          <div className="band-head">
            <span className="cap">How it works</span>
            <span className="count">three steps · every purchase</span>
          </div>
          <div className="cols cols-3">
            <div className="col">
              <span className="cap">1 · The assistant proposes</span>
              <h3>Found something worth buying</h3>
              <p className="body">
                Your AI agent brings the purchase to the gate with the seller,
                the reason, and the exact amount. It carries no money and no
                power to approve.
              </p>
            </div>
            <div className="col">
              <span className="cap">2 · The gate checks your rules</span>
              <h3>Checked fresh, never from memory</h3>
              <p className="body">
                Valid request, positive amount, right currency, allowed
                category, room under your monthly limit. The strictest rule
                wins, and the rules are read again at every step.
              </p>
            </div>
            <div className="col">
              <span className="cap">3 · You decide</span>
              <h3>Nothing moves without you</h3>
              <p className="body">
                What passes the checks waits for your Approve or Decline. Your
                name and the time are saved in the record, saved once, and
                never edited.
              </p>
            </div>
          </div>
        </section>

        <section
          className="promise reveal"
          aria-label="The hard cap promise"
          style={{ "--i": 2 } as CSSProperties}
        >
          <div className="gauge demo">
            <div className="readout">
              <span className="cap">Example month</span>
              <div className="spent num">
                <span className="sym">$</span>142.50
              </div>
              <p className="of num">
                of a <b>$200.00</b> limit · <b>71%</b> used
              </p>
            </div>
            <div>
              <div className="wall" aria-hidden="true" style={DEMO_WALL}>
                <div className="wall-fill" />
                <i className="tick" style={{ left: "25%" }} />
                <i className="tick" style={{ left: "50%" }} />
                <i className="threshold" style={{ left: "75%" }} />
                <div className="wall-cap" />
              </div>
              <div className="legend num">
                <span>
                  spent <b>$142.50</b>
                </span>
                <span>
                  caution from <b>$150.00</b>
                </span>
                <span className="hl">
                  hard cap <b>$200.00</b>
                </span>
              </div>
            </div>
            <div className="side">
              <p className="cap-note">
                <AnchorMark />
                Approval cannot move this line.
              </p>
              <span className="cap num">an example · not live data</span>
            </div>
          </div>
          <p className="promise-line">
            Your monthly limit is a hard ceiling. It is checked again when you
            approve and again right before it pays. No app can raise it, and no
            agent can talk its way past it.
          </p>
        </section>

        <footer className="home-foot reveal" style={{ "--i": 3 } as CSSProperties}>
          <span>Built for the PayPal AI Hackathon · payments run in PayPal&apos;s sandbox</span>
          <span>Every decision is saved with your name and the time</span>
        </footer>
      </main>
    </div>
  );
}
