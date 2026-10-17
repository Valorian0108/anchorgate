"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { AnchorMark } from "@/components/anchor-mark";
import { CountUp } from "@/components/count-up";
import { money } from "@/lib/format";
import { previewAgainstCap } from "@/lib/capPreview";
import { currencySymbol } from "@/lib/gateCard";

/**
 * The anchor wall as a horizontal instrument band (canon §10, frost object 1).
 *
 * Readout at 32px with its unit line under it; the wall carries scale ticks at
 * 25 and 50, an amber caution threshold at 75, and the hard cap notch at the
 * end; the legend sits under the bar; "Approval cannot move this line" is a
 * footnote at the right in Sora light, with the cap, the caution money and the
 * reset day explained in plain words beside it.
 *
 * The colour is a live signal and it counts confirmed payments only, the same
 * number the engine enforces: accent while there is room, caution from three
 * quarters of the cap, refusal near or over it. Money merely set aside for cards
 * still waiting draws as the pale band beside the solid fill and keeps its own
 * words in the legend, so commitment stays visible without colouring the hard
 * limit. The spent figure counts only when the value changes, and the wall moves
 * only when a capture is verified.
 */
export function AnchorWall({
  capMinor,
  spentMinor,
  reservedMinor,
  currency,
  autoPaidMinor = null,
  autoBudgetMinor = null,
  previewMinor = null,
}: {
  capMinor: number | null;
  spentMinor: number;
  reservedMinor: number;
  currency: string;
  /**
   * The trust-mode line: how much of the auto budget has paid itself this
   * month. Both stay null unless AI authorization is on, and the line renders
   * only when there is something to say (a budget set or a payment made), so
   * the default gate is untouched.
   */
  autoPaidMinor?: number | null;
  autoBudgetMinor?: number | null;
  /**
   * A hovered waiting card's amount: the wall draws a ghost marker where it
   * would land, and turns red if it would push spending past the cap. Null
   * keeps the wall exactly as shipped.
   */
  previewMinor?: number | null;
}) {
  const sym = currencySymbol(currency);

  if (capMinor === null || capMinor <= 0) {
    return (
      <section className="gauge" aria-label="Your money this month">
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
  const pct = Math.round(spentFrac * 100);
  const headroomMinor = Math.max(capMinor - spentMinor - reservedMinor, 0);
  const cautionMinor = Math.round(capMinor * 0.75);
  /* The bar carries two channels and they answer two different questions, which
     is the point: its LENGTH is commitment (solid = money that left, pale =
     money set aside for cards still waiting), its COLOUR is position against
     the hard limit, the same number the engine enforces and the readout prints.
     Colouring it by commitment instead made the bar red while the gate would
     still happily pay, contradicted the Rules page's own promise that the limit
     counts confirmed payments only, and left the cap preview's refusal-red with
     nothing to stand out against on a busy gate. Owner decision 17 oct 2026,
     canon §6(m). The commitment truth keeps its own words in the legend, so
     nothing is hidden by the calmer colour. A side effect worth keeping: amber
     now begins exactly where the bar's 75% caution notch is drawn. */
  const wallColor =
    spentFrac >= 0.9 ? "var(--deny)" : spentFrac >= 0.75 ? "var(--ask)" : "var(--accent)";

  // A hovered card's landing spot on the wall, and whether paying it would go
  // over the cap. This is the engine's own cap check, shared through one helper
  // so the preview can never disagree with the decision it forecasts.
  const preview =
    previewMinor != null ? previewAgainstCap(spentMinor, previewMinor, capMinor) : null;

  return (
    <section
      className="gauge"
      aria-label="Your money this month"
      style={
        {
          "--spent-frac": spentFrac,
          "--res-frac": resFrac,
          "--wall-color": preview?.breaches ? "var(--deny)" : wallColor,
        } as CSSProperties
      }
    >
      <div className="readout">
        <span className="cap">This month</span>
        <div className="spent num">
          <span className="sym">{sym}</span>
          <CountUp value={spentMinor / 100} />
        </div>
        <p className="of num">
          of your <b>{sym}{money(capMinor)}</b> limit · <b>{pct}%</b> used
        </p>
      </div>

      <div>
        <div className="wall" aria-hidden="true">
          {preview ? (
            <div
              className={`wall-preview${preview.breaches ? " breach" : ""}`}
              style={{ left: `calc(${preview.landingFrac * 100}% - 1px)` }}
            />
          ) : null}
          <div className="wall-fill" />
          <div className="wall-set" />
          <i className="tick" style={{ left: "25%" }} />
          <i className="tick" style={{ left: "50%" }} />
          <i className="threshold" style={{ left: "75%" }} />
          <div className="wall-cap" />
        </div>
        <div className="legend num">
          <span>
            spent <b>{sym}{money(spentMinor)}</b>
          </span>
          <span>
            set aside <b>{sym}{money(reservedMinor)}</b>
          </span>
          <span className="hl">
            left <b>{sym}{money(headroomMinor)}</b>
          </span>
          {autoPaidMinor !== null && autoBudgetMinor !== null &&
          (autoBudgetMinor > 0 || autoPaidMinor > 0) ? (
            <span>
              auto-paid <b>{sym}{money(autoPaidMinor)}</b> of {sym}{money(autoBudgetMinor)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="side">
        <p className="cap-note">
          <AnchorMark />
          Approval cannot move this line.
        </p>
        <span className="cap num">
          cap {sym}{money(capMinor)} · caution from {sym}{money(cautionMinor)} · resets on the 1st
        </span>
      </div>
    </section>
  );
}
