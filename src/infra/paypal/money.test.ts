/**
 * Tests for PayPal money conversion.
 *
 * Money conversion is where a wrong exponent silently charges the wrong amount,
 * so it is tested hard, including the zero- and three-decimal cases and the
 * fail-closed behavior.
 */

import { describe, expect, it } from "vitest";

import { fromPayPalAmount, minorUnitExponent, toPayPalAmount } from "./money";

describe("minorUnitExponent", () => {
  it("knows zero-, two-, and three-decimal currencies", () => {
    expect(minorUnitExponent("USD")).toBe(2);
    expect(minorUnitExponent("EUR")).toBe(2);
    expect(minorUnitExponent("jpy")).toBe(0);
    expect(minorUnitExponent("KWD")).toBe(3);
  });
  it("fails closed for a malformed code", () => {
    expect(() => minorUnitExponent("US")).toThrow();
    expect(() => minorUnitExponent("USDD")).toThrow();
  });
});

describe("toPayPalAmount", () => {
  it("formats two-decimal currencies", () => {
    expect(toPayPalAmount(500, "USD")).toBe("5.00");
    expect(toPayPalAmount(5, "USD")).toBe("0.05");
    expect(toPayPalAmount(0, "USD")).toBe("0.00");
    expect(toPayPalAmount(123456, "EUR")).toBe("1234.56");
  });
  it("formats zero-decimal currencies without a fraction", () => {
    expect(toPayPalAmount(500, "JPY")).toBe("500");
  });
  it("formats three-decimal currencies", () => {
    expect(toPayPalAmount(1500, "KWD")).toBe("1.500");
  });
  it("never uses floating point for large values", () => {
    expect(toPayPalAmount(999999999, "USD")).toBe("9999999.99");
  });
  it("rejects non-integer input", () => {
    expect(() => toPayPalAmount(1.5, "USD")).toThrow();
    expect(() => toPayPalAmount(Number.NaN, "USD")).toThrow();
  });
});

describe("fromPayPalAmount", () => {
  it("parses two-decimal values", () => {
    expect(fromPayPalAmount("5.00", "USD")).toBe(500);
    expect(fromPayPalAmount("0.05", "USD")).toBe(5);
    expect(fromPayPalAmount("1234.56", "EUR")).toBe(123456);
  });
  it("parses zero-decimal currency values", () => {
    expect(fromPayPalAmount("500", "JPY")).toBe(500);
  });
  it("fails closed when the provider returns too many decimals", () => {
    expect(() => fromPayPalAmount("5.001", "USD")).toThrow();
  });
  it("round-trips with toPayPalAmount", () => {
    for (const amount of [0, 1, 5, 99, 500, 123456, 999999999]) {
      expect(fromPayPalAmount(toPayPalAmount(amount, "USD"), "USD")).toBe(amount);
    }
  });
});
