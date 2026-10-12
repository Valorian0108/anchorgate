"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { PurchaseRecord } from "@/core/purchases";

import { useFeed } from "./feed-provider";
import { PurchaseRow } from "./purchase-row";

/**
 * The register, made live.
 *
 * It renders the requests the server already knows about and the ones that
 * arrive while the page is open, deduplicated by id, newest first. The count
 * line, the empty states and the ledger all read from the same merged list, so
 * nothing can contradict anything else: the moment a request arrives, the
 * empty state is gone and the row is there.
 *
 * It also owns the "while you were away" beat: when it mounts (or the tab comes
 * back to the front) with arrivals the person has not seen, it says how many,
 * then hands them back as seen.
 */
export function GateRegister({
  records,
  day,
}: {
  records: PurchaseRecord[];
  day: string;
}) {
  const { arrivals, unseen, markSeen, setGatePresent } = useFeed();
  const [awayCount, setAwayCount] = useState(0);
  const [visible, setVisible] = useState(true);

  // Tell the feed the Gate is present, so arrivals here appear rather than count.
  useEffect(() => {
    setGatePresent(true);
    return () => setGatePresent(false);
  }, [setGatePresent]);

  // Track tab visibility so a return to the front can raise the banner.
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Back in view with unseen arrivals: say so, then mark them seen.
  useEffect(() => {
    if (!visible || unseen === 0) return;
    setAwayCount(unseen);
    markSeen();
  }, [visible, unseen, markSeen]);

  const merged = useMemo(() => {
    const known = new Set(records.map((r) => r.id));
    const items = [
      ...arrivals
        .filter((r) => !known.has(r.id))
        .map((record) => ({ record, entering: true })),
      ...records.map((record) => ({ record, entering: false })),
    ];
    return items.sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
  }, [records, arrivals]);

  const pending = merged.filter((i) => i.record.status === "PENDING_APPROVAL");

  return (
    <section
      className="register reveal"
      style={{ "--i": 2 } as CSSProperties}
      aria-label="Your purchases"
    >
      <div className="reg-head">
        <h1>Your purchases</h1>
        <span className="count num">
          {day} · {merged.length} total · {pending.length} waiting on you
        </span>
      </div>

      {awayCount > 0 ? (
        <div className="away-banner" role="status">
          While you were away, {awayCount} new request{awayCount > 1 ? "s" : ""} arrived.
        </div>
      ) : null}

      {merged.length === 0 ? (
        <div className="empty">
          <h2>No purchases yet.</h2>
          <p>
            When the assistant proposes something, it lands here so you can see
            what it wants to spend and why, before any money moves.
          </p>
          <span className="next">
            Ask the assistant about your first purchase in the box above.
          </span>
        </div>
      ) : pending.length === 0 ? (
        <div className="empty">
          <h2>Nothing needs you right now.</h2>
          <p>
            These are your recent purchases and how each one ended. When something
            needs your okay, it shows up here with a Decide button.
          </p>
          <span className="next">
            Use the box above to ask the assistant to look at something.
          </span>
        </div>
      ) : null}

      {merged.length > 0 ? (
        <div className="ledger">
          <div className="colhead">
            <span>When</span>
            <span>Who it&apos;s for</span>
            <span>Why</span>
            <span className="amt">Amount</span>
            <span>Where it stands</span>
            <span />
          </div>

          {merged.map(({ record, entering }) => (
            <PurchaseRow key={record.id} record={record} entering={entering} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
