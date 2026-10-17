import { describe, expect, test } from "vitest";

import { maskEmail, money, shortRef } from "./format";

describe("maskEmail", () => {
  test("keeps the first character of the local part and the full domain", () => {
    expect(maskEmail("ifeoluwaludemi34@gmail.com")).toBe("i•••••@gmail.com");
  });

  test("masks a short local part without leaking its length", () => {
    expect(maskEmail("jane@company.io")).toBe("j•••••@company.io");
  });

  test("returns a single-character local part intact except for the bullets", () => {
    expect(maskEmail("a@b.co")).toBe("a•••••@b.co");
  });

  test("returns strings without an @ unchanged", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
    expect(maskEmail("")).toBe("");
  });
});

describe("money", () => {
  test("renders minor units with two decimals", () => {
    expect(money(1000)).toBe("10.00");
    expect(money(5)).toBe("0.05");
  });
});

describe("shortRef", () => {
  test("truncates long references with an ellipsis", () => {
    expect(shortRef("85L31139U0002064K")).toBe("85L31139…");
  });

  test("returns short references unchanged", () => {
    expect(shortRef("abc")).toBe("abc");
  });
});
