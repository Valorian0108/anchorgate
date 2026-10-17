/**
 * The cap preview: the display-side mirror of the engine's monthly cap check.
 *
 * The engine denies a purchase when `amountMinor > monthlyCapMinor -
 * spentThisMonthMinor` (src/core/authorization/engine.ts step 5, reason code
 * MONTHLY_CAP_EXCEEDED). Money merely set aside for cards still waiting is NOT
 * part of that check, so it is not part of this one either: a preview that
 * counted reservations would warn about purchases the engine would happily
 * allow, and a warning the engine then contradicts is worse than no warning.
 *
 * This is pure display arithmetic and it never decides anything. The engine
 * re-runs the real check at pay time, and its refusal is the proof. The preview
 * exists so the boundary is not buried: the owner sees where the money would
 * land before clicking, instead of learning it from a refusal afterwards.
 */

export interface CapPreview {
  /** Where the money would land, as a fraction of the cap, clamped to 1. */
  landingFrac: number;
  /** True when paying this would take confirmed spend past the cap. */
  breaches: boolean;
}

/**
 * Preview one amount against the monthly cap.
 *
 * Returns null when there is no boundary to preview (no cap configured, or a
 * cap that is not a positive number), so the wall and the card stay exactly as
 * they were before the preview existed.
 */
export function previewAgainstCap(
  spentMinor: number,
  amountMinor: number,
  capMinor: number | null,
): CapPreview | null {
  if (capMinor === null || capMinor <= 0) return null;
  const landingMinor = spentMinor + amountMinor;
  return {
    landingFrac: Math.min(landingMinor / capMinor, 1),
    breaches: landingMinor > capMinor,
  };
}
