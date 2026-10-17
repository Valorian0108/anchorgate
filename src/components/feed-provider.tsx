"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { surfaceNextFromGate, type GateDecisionResult } from "@/app/(app)/actions";
import type { PurchaseRecord } from "@/core/purchases";

/** How often the Gate asks the feed for the next item (the server enforces the real gap). */
const POLL_MS = 30_000;

interface FeedValue {
  /** Requests that arrived this session, newest first. */
  arrivals: PurchaseRecord[];
  /** Short capture references for arrivals trust mode settled, by request id. */
  arrivalRefs: Record<string, string>;
  /** How many arrived while the person was not looking at the Gate. */
  unseen: number;
  /** Called when the Gate is back in view: the arrivals are now seen. */
  markSeen: () => void;
  /** The Gate reports whether it is mounted, so arrivals can be classified. */
  setGatePresent: (present: boolean) => void;
}

const FeedContext = createContext<FeedValue | null>(null);

/** The tab title while arrivals are unseen. No em dash, per the copy canon. */
function unseenTitle(count: number): string {
  return `Gate · ${count} new · AnchorGate`;
}

/**
 * Write the browser tab title, using the element the browser actually reads.
 *
 * Next manages its own `<title>`, and it is not always in the document when the
 * first arrival lands; the plain `document.title` setter would then create a
 * second title element that the browser ignores. This writes to the first title
 * element (the one the tab shows) and drops any stray copies.
 */
function writeTabTitle(text: string): void {
  const titles = [...document.querySelectorAll("title")];
  let el = titles[0];
  if (!el) {
    el = document.createElement("title");
    document.head.appendChild(el);
  }
  el.textContent = text;
  for (let i = titles.length - 1; i >= 1; i -= 1) {
    titles[i]?.remove();
  }
}

/** The live feed for the signed-in person. Must be used inside `FeedProvider`. */
export function useFeed(): FeedValue {
  const value = useContext(FeedContext);
  if (!value) {
    throw new Error("useFeed must be used inside FeedProvider");
  }
  return value;
}

/**
 * The live feed controller, mounted once in the signed-in layout so it survives
 * moving between Gate, Rules and Record.
 *
 * About every thirty seconds it asks the server for the next catalog request
 * and keeps what comes back. An arrival is "unseen" (and so counted on the
 * badge and the tab title) only when the person is not on the Gate or the tab
 * is in the background; while the Gate is open and in view, arrivals simply
 * appear. Failures stay silent: the Gate already shows the true state, and a
 * missing tick is not worth an alarm.
 */
export function FeedProvider({ children }: { children: ReactNode }) {
  const [arrivals, setArrivals] = useState<PurchaseRecord[]>([]);
  const [arrivalRefs, setArrivalRefs] = useState<Record<string, string>>({});
  const [unseen, setUnseen] = useState(0);
  const gatePresent = useRef(false);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      let result: GateDecisionResult | null = null;
      try {
        result = await surfaceNextFromGate();
      } catch {
        return;
      }
      if (cancelled || !result) return;
      const record = result.record;
      const ref = result.ref;

      setArrivals((prev) =>
        prev.some((r) => r.id === record.id) ? prev : [record, ...prev],
      );
      // An arrival trust mode settled carries its capture reference: show it
      // on the card right away, exactly like a decision taken on this screen.
      if (ref) {
        setArrivalRefs((prev) => ({ ...prev, [record.id]: ref }));
      }
      if (document.hidden || !gatePresent.current) {
        setUnseen((n) => n + 1);
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // The tab title carries the count while the tab is in the background, and
  // returns to the page's own title once the arrivals are seen.
  useEffect(() => {
    if (unseen === 0) {
      if (baseTitle.current !== null) {
        writeTabTitle(baseTitle.current);
        baseTitle.current = null;
      }
      return;
    }
    if (baseTitle.current === null) {
      baseTitle.current = document.querySelector("title")?.textContent ?? "";
    }
    writeTabTitle(unseenTitle(unseen));
  }, [unseen]);

  // Keep the count on the tab even when Next swaps the title on navigation.
  useEffect(() => {
    if (unseen === 0) return;
    const observer = new MutationObserver(() => {
      const want = unseenTitle(unseen);
      const el = document.querySelector("title");
      if (!el || el.textContent === want) return;
      writeTabTitle(want);
    });
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [unseen]);

  const markSeen = useCallback(() => setUnseen(0), []);
  const setGatePresent = useCallback((present: boolean) => {
    gatePresent.current = present;
  }, []);

  const value = useMemo(
    () => ({ arrivals, arrivalRefs, unseen, markSeen, setGatePresent }),
    [arrivals, arrivalRefs, unseen, markSeen, setGatePresent],
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}
