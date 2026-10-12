/**
 * Gate card vocabulary.
 *
 * One request becomes one decision card on the Gate. This module is the single
 * place that decides what a card says and how it is toned, so the live card and
 * the case file can never disagree about the same record. It is pure display: it
 * reads a record and returns words. It never decides anything and it never
 * invents a second charge.
 */

import { CATALOG_AGENT_ID } from "@/agent/catalog";
import type { PurchaseRecord } from "@/core/purchases";
import { latestEvaluation, reasonPhrase } from "@/lib/vocab";

/** The five settled readings of a card, plus the one that still needs a human. */
export type GateCardKind =
  | "needs-you"
  | "paid"
  | "declined"
  | "blocked"
  | "paying"
  | "cleared";

/** Waiting (ask), settled true (allow), or settled no (deny). */
export type GateCardTone = "ask" | "allow" | "deny";

export interface GateCardStamp {
  text: string;
  tone: "allow" | "deny";
}

export interface GateCardStatus {
  kind: GateCardKind;
  /** The small uppercase word beside the status mark. */
  mark: string;
  tone: GateCardTone;
  /** The rotated stamp, only once the outcome is final. */
  stamp?: GateCardStamp;
  /** The one mono line that sits under the stamp. */
  receipt: string;
}

/**
 * How a request reads as a card.
 *
 * Under Option 1 everything arrives as `PENDING_APPROVAL`, so a needs-you card
 * is the common case. The settled readings are the real ones: `PAID` only when
 * a capture was verified, `BLOCKED` only when a rule refused it, and a plain
 * `DECLINED` when the owner said no and no money moved.
 */
export function gateCardStatus(record: PurchaseRecord): GateCardStatus {
  switch (record.status) {
    case "PENDING_APPROVAL":
      return { kind: "needs-you", mark: "Needs you", tone: "ask", receipt: "" };
    case "APPROVED":
      return {
        kind: "paying",
        mark: "Paying",
        tone: "ask",
        receipt: "you said yes · getting ready to pay",
      };
    case "PENDING_SETTLEMENT":
      return {
        kind: "paid",
        mark: "Paid, settling",
        tone: "allow",
        stamp: { text: "Paid", tone: "allow" },
        receipt: "paid · waiting for it to settle",
      };
    case "EXECUTED":
      return {
        kind: "paid",
        mark: "Paid",
        tone: "allow",
        stamp: { text: "Paid", tone: "allow" },
        receipt: "you approved · paid once",
      };
    case "REJECTED":
      return {
        kind: "declined",
        mark: "You said no",
        tone: "deny",
        stamp: { text: "Declined", tone: "deny" },
        receipt: "you said no · no money moved",
      };
    case "DENIED": {
      const latest = latestEvaluation(record.evaluations);
      const why = latest ? reasonPhrase(latest.decision.reasonCode) : "your rules said no";
      return {
        kind: "blocked",
        mark: "Blocked",
        tone: "deny",
        stamp: { text: "Blocked", tone: "deny" },
        receipt: `${why} · no money moved`,
      };
    }
    case "AUTHORIZED":
      return {
        kind: "cleared",
        mark: "Cleared by older rules",
        tone: "allow",
        stamp: { text: "Cleared", tone: "allow" },
        receipt: "older rules · the gate asks you first now",
      };
  }
}

/**
 * Where a proposal honestly came from, in the owner's language.
 *
 * Catalog items are surfaced by the live feed on the owner's behalf; everything
 * else was typed into the ask box by the owner themselves. The two must never
 * read the same, or the card would be telling a small lie about who asked.
 */
export function sourcePhrase(agentId: string): string {
  return agentId === CATALOG_AGENT_ID ? "brought by your agent" : "you asked for this";
}

/** "$" for USD, "EUR " for anything else (the code, then a space). */
export function currencySymbol(currency: string): string {
  return currency === "USD" ? "$" : `${currency} `;
}
