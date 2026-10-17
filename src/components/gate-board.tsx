"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { decideFromGate, type GateDecisionResult } from "@/app/(app)/actions";
import type { PurchaseRecord } from "@/core/purchases";
import { isReserved, latestEvaluation } from "@/lib/vocab";

import { AnchorWall } from "./anchor-wall";
import { AskBox } from "./ask-box";
import { useFeed } from "./feed-provider";
import { GateCard } from "./gate-card";
import { StatusStrip } from "./status-strip";

/** The shortest time "Authorizing" stays up, so the beat reads instead of flickers. */
const MIN_BEAT_MS = 700;

/** How many settled columns the queue shows beside the waiting ones. */
const SETTLED_SHOWN = 1;

/**
 * When a record settled, mirroring the card's elapsed-time anchor. The queue
 * keeps the most recently SETTLED column, not the most recently created one:
 * a just-paid receipt is what the owner needs to see, even when a newer
 * request was declined first.
 */
function settledAt(record: PurchaseRecord): string {
  return (
    record.approval?.approvedAt ??
    record.rejection?.rejectedAt ??
    latestEvaluation(record.evaluations)?.evaluatedAt ??
    record.createdAt
  );
}

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
 * The Gate as a cockpit (canon §10), made live.
 *
 * One status strip, one instrument band, then the queue as equal columns on
 * open ground: the ask column first, every request that needs the owner, and
 * the most recently settled one beside them. Everything reads from one merged
 * list (server state plus arrivals plus decisions taken here), so the strip,
 * the band and the columns can never contradict each other.
 *
 * A decision is the owner's, never the screen's: the column asks the server
 * for the real outcome and shows exactly what came back. The wall moves only
 * when a capture is verified, so approving a request that the rules then
 * refuse moves nothing, as it should.
 */
export function GateBoard({
  records,
  refs,
  capMinor,
  spentMinor,
  reservedMinor,
  currency,
  askMessage,
  evaluatedAt,
  ruleVersion,
  trustOn = false,
}: {
  records: PurchaseRecord[];
  /** Short capture reference per request id, for the settled cards. */
  refs: Record<string, string>;
  capMinor: number | null;
  spentMinor: number;
  reservedMinor: number;
  currency: string;
  askMessage: { text: string; error: boolean } | null;
  /** When the engine last evaluated anything, for the strip's live tick. */
  evaluatedAt: string | null;
  ruleVersion: string | null;
  /** AI authorization on: the ask box's honesty lines change with it. */
  trustOn?: boolean;
}) {
  const { arrivals, arrivalRefs, unseen, markSeen, setGatePresent } = useFeed();
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

  // Track tab visibility so a return to the front can raise the away line.
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

  // An arrival trust mode settled: the wall moves the moment its verified
  // capture lands, same as a decision taken on this screen. Applied once per
  // record; the server-rendered totals cannot include a payment that settled
  // after the page was rendered.
  const wallApplied = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const record of arrivals) {
      if (record.status !== "EXECUTED") continue;
      if (wallApplied.current.has(record.id)) continue;
      wallApplied.current.add(record.id);
      setSpent((value) => value + record.request.amountMinor);
    }
  }, [arrivals]);

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

  const waiting = items.filter((item) => item.record.status === "PENDING_APPROVAL");
  const settled = items
    .filter((item) => item.record.status !== "PENDING_APPROVAL")
    .sort((a, b) => settledAt(b.record).localeCompare(settledAt(a.record)));
  const settledShown = settled.slice(0, SETTLED_SHOWN);
  const settledHidden = settled.length - settledShown.length;

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
      <StatusStrip
        waiting={waiting.length}
        evaluatedAt={evaluatedAt}
        ruleVersion={ruleVersion}
      />

      <div className="reveal" style={{ "--i": 0 } as CSSProperties}>
        <AnchorWall
          capMinor={capMinor}
          spentMinor={spent}
          reservedMinor={reserved}
          currency={currency}
        />
      </div>

      {awayCount > 0 ? (
        <div className="away-banner" role="status" style={{ marginTop: "var(--s3)" }}>
          While you were away, {awayCount} new request{awayCount > 1 ? "s" : ""} arrived.
        </div>
      ) : null}

      <section
        className="band reveal"
        style={{ "--i": 1 } as CSSProperties}
        aria-label="Requests at the gate"
      >
        <div className="band-head">
          <span className="sec">At the gate</span>
          <span className="count num">
            {waiting.length > 0
              ? `${waiting.length} waiting on you`
              : items.length > 0
                ? "all clear"
                : "nothing yet"}
          </span>
          {settledHidden > 0 ? (
            <Link className="more" href="/record">
              {settledHidden} more in the record
            </Link>
          ) : null}
        </div>

        <div className="cols">
          {waiting.map(({ record, entering }) => (
            <GateCard
              key={record.id}
              record={record}
              entering={entering}
              working={Boolean(overrides[record.id]?.working)}
              failed={Boolean(overrides[record.id]?.failed)}
              refText={overrides[record.id]?.ref ?? arrivalRefs[record.id] ?? refs[record.id]}
              onDecide={decide}
            />
          ))}

          {settledShown.map(({ record, entering }) => (
            <GateCard
              key={record.id}
              record={record}
              entering={entering}
              working={Boolean(overrides[record.id]?.working)}
              failed={Boolean(overrides[record.id]?.failed)}
              refText={overrides[record.id]?.ref ?? arrivalRefs[record.id] ?? refs[record.id]}
              onDecide={decide}
            />
          ))}

          <AskBox message={askMessage} trustOn={trustOn} />

          {waiting.length === 0 ? (
            <div className="empty">
              <h2>{items.length === 0 ? "No requests yet." : "Nothing needs you right now."}</h2>
              <p>
                {items.length === 0
                  ? "When the agent finds something worth buying, it lands here with what it is and what it costs, before any money moves."
                  : "This is what the agent has brought so far and how each one ended. A new request will arrive on its own, and it will wait for you here."}
              </p>
              <span className="next">
                The last column is the assistant's: ask it to look at anything.
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
