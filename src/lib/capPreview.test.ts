import { describe, expect, test } from "vitest";

import { previewAgainstCap } from "./capPreview";

describe("previewAgainstCap", () => {
  test("mirrors the engine: a purchase that lands exactly on the cap is allowed", () => {
    // engine step 5 denies only when amount > cap - spent, so equality passes
    const preview = previewAgainstCap(38000, 12000, 50000);
    expect(preview?.breaches).toBe(false);
    expect(preview?.landingFrac).toBe(1);
  });

  test("flags one minor unit over the cap as a breach", () => {
    expect(previewAgainstCap(38000, 12001, 50000)?.breaches).toBe(true);
  });

  test("does not breach while there is room", () => {
    const preview = previewAgainstCap(19400, 12000, 50000);
    expect(preview?.breaches).toBe(false);
    expect(preview?.landingFrac).toBeCloseTo(0.628, 5);
  });

  test("clamps the landing fraction at the cap, so an overshoot still renders", () => {
    const preview = previewAgainstCap(49000, 50000, 50000);
    expect(preview?.breaches).toBe(true);
    expect(preview?.landingFrac).toBe(1);
  });

  test("returns null when there is no cap to preview against", () => {
    expect(previewAgainstCap(1000, 500, null)).toBeNull();
    expect(previewAgainstCap(1000, 500, 0)).toBeNull();
    expect(previewAgainstCap(1000, 500, -100)).toBeNull();
  });

  test("treats spend already past the cap as a breach for any further amount", () => {
    expect(previewAgainstCap(60000, 1, 50000)?.breaches).toBe(true);
  });
});
