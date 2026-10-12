"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { AnchorMark } from "@/components/anchor-mark";
import { CountUp } from "@/components/count-up";
import { money } from "@/lib/format";
import { currencySymbol } from "@/lib/gateCard";

/**
 * The anchor wall: this month's money as a live instrument.
 *
 * The spent figure is a hero and counts when it changes. The wall behind it
 * fills with what is already spent and, behind that in a lighter tint, what is
 * set aside for requests still waiting on you. When the wall nears the cap it
 * turns to the caution colour, and to the refusal colour near or over it, so the
 * colour is a live signal rather than decoration.
 *
 * The line at the right is the limit. Approval cannot move it.
 *
 * Motion: the wall uses a transform transition, the figure uses the shared
 * count-up. Both collapse under `prefers-reduced-motion`; the values still
 * change, they simply land without travel.
 */
export function AnchorWall({
  capMinor,
  spentMinor,
  reservedMinor,
  currency,
}: {
  capMinor: number | null;
  spentMinor: number;
  reservedMinor: number;
  currency: string;
}) {
  const sym = currencySymbol(currency);

  if (capMinor === null || capMinor <= 0) {
    return (
      <section className="budget" aria-label="Your money this month">
        <div className="wall-empty">
          <p className="wall-empty-h">
            {capMinor === null
              ? "No monthly limit is set yet, so nothing can leave the gate."
              : "Your monthly limit is set to zero, so nothing can leave the gate."}
          </p>
          <Link className="wall-empty-link" href="/statute">
            Set your monthly limit
          </Link>
        </div>
      </section>
    );
  }

  const spentFrac = Math.min(spentMinor / capMinor, 1);
  const resFrac = Math.max(0, Math.min(reservedMinor / capMinor, 1 - spentFrac));
  const usedFrac = spentFrac + resFrac;
  const pct = Math.round(usedFrac * 100);
  const headroomMinor = Math.max(capMinor - spentMinor - reservedMinor, 0);
  const wallColor =
    usedFrac >= 0.85 ? "var(--deny)" : usedFrac >= 0.6 ? "var(--ask)" : "var(--seal)";

  return (
    <section className="budget" aria-label="Your money this month">
      <div className="budget-row">
        <div className="spent num">
          <span className="sym">{sym}</span>
          <CountUp value={spentMinor / 100} />
        </div>
        <div className="budget-meta">
          <div className="of num">
            of your <span className="cap">{sym}{money(capMinor)}</span> monthly limit
          </div>
          <div className="pct num">{pct}% used</div>
        </div>
      </div>

      <div
        className="wall"
        aria-hidden="true"
        style={
          {
            "--spent-frac": spentFrac,
            "--res-frac": resFrac,
            "--wall-color": wallColor,
          } as CSSProperties
        }
      >
        <div className="wall-fill" />
        <div className="wall-set" />
        <div className="wall-cap" />
      </div>

      <div className="wall-legend num">
        <span>
          spent <b>{sym}{money(spentMinor)}</b>
        </span>
        <span>
          set aside <b>{sym}{money(reservedMinor)}</b>
        </span>
        <span>
          left <b className="hl">{sym}{money(headroomMinor)}</b>
        </span>
      </div>

      <p className="cap-note">
        <span className="cap-note-mark">
          <AnchorMark />
        </span>
        Approval cannot move this line.
      </p>
    </section>
  );
}
