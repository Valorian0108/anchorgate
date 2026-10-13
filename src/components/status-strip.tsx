"use client";

/**
 * The status strip: one line of live data under the top bar (canon §10).
 *
 * A breathing dot, the waiting count, a ticking "evaluated Ns ago", the rule
 * set in force, and the trust line quiet at the right. It replaces the poster
 * headline: the Gate opens with what is true right now, not a declaration.
 * The tick is a real clock over the server's last evaluation time, so the
 * number moves because time moves, not for show.
 */

import { useEffect, useState } from "react";

function agoText(iso: string | null, now: number): string {
  if (!iso) return "no decisions yet";
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function StatusStrip({
  waiting,
  evaluatedAt,
  ruleVersion,
}: {
  waiting: number;
  evaluatedAt: string | null;
  ruleVersion: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="strip">
      <span className="dot" aria-hidden="true" />
      <span className="wait num">
        {waiting > 0 ? `${waiting} waiting on you` : "nothing waiting on you"}
      </span>
      <span className="sep">·</span>
      <span className="meta">evaluated {agoText(evaluatedAt, now)}</span>
      <span className="sep">·</span>
      <span className="meta">rules {ruleVersion ?? "none set"}</span>
      <span className="trust">checked fresh every time, never from memory</span>
    </div>
  );
}
