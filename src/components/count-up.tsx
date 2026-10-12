"use client";

/**
 * CountUp — the "number tick" microinteraction.
 *
 * Counts a figure up from zero on first paint so the budget reads as live data,
 * not a static screenshot. Honors prefers-reduced-motion by rendering the final
 * value immediately, and settles immediately in a hidden tab (animation frames
 * do not run there, so the figure would otherwise sit at a stale zero).
 * Animates transform-free (text only), so it stays cheap.
 */

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 900;

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

export function CountUp({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  const shown = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || document.visibilityState === "hidden") {
      shown.current = value;
      setDisplay(value);
      return;
    }

    const start = shown.current;
    const delta = value - start;
    if (delta === 0) return;

    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / DURATION_MS, 1);
      const next = start + delta * easeOutCubic(p);
      shown.current = next;
      setDisplay(next);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <>{display.toFixed(decimals)}</>;
}
