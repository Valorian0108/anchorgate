"use client";

/**
 * A live elapsed time on a queue column (canon §10).
 *
 * "waiting 2h" or "settled 1h ago", recomputed once a minute from the real
 * timestamp, so the page visibly keeps time. Reduced motion does not apply:
 * a text value changing once a minute is information, not movement.
 */

import { useEffect, useState } from "react";

function fmt(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function Age({ since, kind }: { since: string; kind: "waiting" | "settled" }) {
  const minutes = () =>
    Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  const [min, setMin] = useState(minutes);

  useEffect(() => {
    const id = window.setInterval(() => setMin(minutes()), 60000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);

  const text = fmt(min);
  if (kind === "settled") {
    return <span className="age num">{text === "just now" ? "settled just now" : `settled ${text} ago`}</span>;
  }
  return <span className="age num">{text === "just now" ? "waiting now" : `waiting ${text}`}</span>;
}
