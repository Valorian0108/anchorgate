"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { decideFromGate, type GateDecisionResult } from "@/app/(app)/actions";
import type { PurchaseRecord } from "@/core/purchases";
import { isReserved } from "@/lib/vocab";

import { AnchorWall } from "./anchor-wall";
import { AskBox } from "./ask-box";
import { useFeed } from "./feed-provider";
import { GateCard } from "./gate-card";

/** The shortest time "Authorizing" stays up, so the beat reads instead of flickers. */
const MIN_BEAT_MS = 700;

interface Override {
  /** The record after a decision, if one has come back. */
  record?: PurchaseRecord;
  /** The short capture reference for a just-paid card, so it shows without a reload. */
  ref?: string;
  /** A decision is in flight for this card. */
  working?: boolean;
  /** The last decision failed to complete; the card is still real and pending. */
  failed?: boolean;
}

/**
 * The Gate, made live.
 *
 * It renders the wall, the ask box and the decision cards from one merged list:
 * what the server already knows plus what arrived while the page was open,
 * deduplicated by id and settled by the decisions taken here. The count line, the
 * empty state, the wall and the cards all read from the same list, so nothing can
 * contradict anything else.
 *
 * A decision is the owner's, never the screen's: the card asks the server for the
 * real outcome and shows exactly what came back. The wall moves only when a
 * capture is verified, so approving a request that the rules then refuse moves
 * nothing, as it should.
 */
export function GateBoard({
  records,
  refs,
  day,
  capMinor,
  spentMinor,
  reservedMinor,
  currency,
  askMessage,
}: {
  records: PurchaseRecord[];
  /** Short capture reference per request id, for the settled cards. */
  refs: Record<string, string>;
  day: string;
  capMinor: number | null;
  spentMinor: number;
  reservedMinor: number;
  currency: string;
  askMessage: { text: string; error: boolean } | null;
}) {
  const { arrivals, unseen, markSeen, setGatePresent } = useFeed();
  const [awayCount, setAwayCount] = useState(0);
  const [visible, setVisible] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [spent, setSpent] = useState(spentMinor);
  const [reserved, setReserved] = useState(reservedMinor);

  // The Gate is on screen: arrivals should appear, not count.
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

  // Back in view with unseen arrivals: say how many, then mark them seen.
  useEffect(() => {
    if (!visible || unseen === 0) return;
    setAwayCount(unseen);
    markSeen();
  }, [visible, unseen, markSeen]);

  const items = useMemo(() => {
    const byId = new Map<string, PurchaseRecord>();
    for (const record of records) byId.set(record.id, record);
    for (const record of arrivals) byId.set(record.id, record);
    for (const [id, override] of Object.entries(overrides)) {
      if (override.record) byId.set(id, override.record);
    }
    const known = new Set(records.map((record) => record.id));
    return [...byId.values()]
      .map((record) => ({
        record,
        entering: !known.has(record.id) && !overrides[record.id]?.record,
      }))
      .sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
  }, [records, arrivals, overrides]);

  const waiting = items.filter((item) => item.record.status === "PENDING_APPROVAL").length;

  async function decide(id: string, action: "approve" | "decline") {
    const item = items.find((candidate) => candidate.record.id === id);
    if (!item) return;
    const before = item.record;

    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], working: true, failed: false } }));
    const startedAt = Date.now();

    let result: GateDecisionResult | null = null;
    try {
      result = await decideFromGate(id, action);
    } catch {
      result = null;
    }

    const remaining = MIN_BEAT_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

    if (!result) {
      // Nothing trustworthy came back: the request is still exactly as it was.
      setOverrides((prev) => ({ ...prev, [id]: { working: false, failed: true } }));
      return;
    }

    const after = result.record;
    setOverrides((prev) => ({
      ...prev,
      [id]: { working: false, failed: false, record: after, ref: result?.ref },
    }));

    // Move the wall only for what really changed: a verified capture becomes
    // spent; anything that stopped waiting releases its set-aside.
    const wasReserved = isReserved(before.status);
    const nowReserved = isReserved(after.status);
    if (wasReserved !== nowReserved) {
      setReserved(
        (value) => value - before.request.amountMinor + (nowReserved ? after.request.amountMinor : 0),
      );
    }
    if (after.status === "EXECUTED") {
      setSpent((value) => value + after.request.amountMinor);
    }
  }

  return (
    <>
      <AnchorWall
        capMinor={capMinor}
        spentMinor={spent}
        reservedMinor={reserved}
        currency={currency}
      />

      <div className="reveal" style={{ "--i": 1 } as CSSProperties}>
        <AskBox message={askMessage} />
      </div>

      <section
        className="gate reveal"
        style={{ "--i": 2 } as CSSProperties}
        aria-label="Requests at the gate"
      >
        <div className="gate-head">
          <h2>At the gate</h2>
          <span className="gate-count num">
            {day} · {waiting > 0 ? `${waiting} waiting on you` : items.length > 0 ? "all clear" : "nothing yet"}
          </span>
        </div>

        {awayCount > 0 ? (
          <div className="away-banner" role="status">
            While you were away, {awayCount} new request{awayCount > 1 ? "s" : ""} arrived.
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="empty">
            <h2>No requests yet.</h2>
            <p>
              When the agent finds something worth buying, it lands here with what
              it is and what it costs, before any money moves.
            </p>
            <span className="next">
              Ask the assistant about your first purchase in the box above.
            </span>
          </div>
        ) : waiting === 0 ? (
          <div className="empty">
            <h2>Nothing needs you right now.</h2>
            <p>
              This is what the agent has brought so far and how each one ended. A
              new request will arrive on its own, and it will wait for you here.
            </p>
            <span className="next">
              Use the box above to ask the assistant to look at something.
            </span>
          </div>
        ) : null}

        <div className="gate-list">
          {items.map(({ record, entering }) => (
            <GateCard
              key={record.id}
              record={record}
              entering={entering}
              working={Boolean(overrides[record.id]?.working)}
              failed={Boolean(overrides[record.id]?.failed)}
              refText={overrides[record.id]?.ref ?? refs[record.id]}
              onDecide={decide}
            />
          ))}
        </div>
      </section>
    </>
  );
}
