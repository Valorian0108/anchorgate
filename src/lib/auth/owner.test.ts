/**
 * The signed idle stamp is the server-side replacement for a session clock.
 * These tests pin its security properties: a round trip works, but a tampered
 * value, a value for a different user, or a stale value never verifies.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

let owner: typeof import("./owner");

beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", "unit-test-secret");
  vi.stubEnv("OWNER_EMAIL", "Owner@Example.com");
  vi.resetModules();
  owner = await import("./owner");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("isOwnerEmail", () => {
  it("matches the owner case-insensitively", () => {
    expect(owner.isOwnerEmail("owner@example.com")).toBe(true);
    expect(owner.isOwnerEmail("Owner@Example.com")).toBe(true);
    expect(owner.isOwnerEmail(" OWNER@example.com ")).toBe(true);
  });

  it("refuses anyone else, and refuses missing input", () => {
    expect(owner.isOwnerEmail("someone@example.com")).toBe(false);
    expect(owner.isOwnerEmail("")).toBe(false);
    expect(owner.isOwnerEmail(null)).toBe(false);
    expect(owner.isOwnerEmail(undefined)).toBe(false);
  });
});

describe("idle stamp", () => {
  it("round-trips a signed timestamp for the right user", () => {
    const at = 1_700_000_000_000;
    const token = owner.signStamp("user-1", at);
    expect(owner.verifyStamp("user-1", token)).toBe(at);
  });

  it("rejects a token signed for a different user", () => {
    const token = owner.signStamp("user-1", 1_700_000_000_000);
    expect(owner.verifyStamp("user-2", token)).toBeNull();
  });

  it("rejects a tampered timestamp", () => {
    const token = owner.signStamp("user-1", 1_700_000_000_000);
    const [, mac] = token.split(".");
    expect(owner.verifyStamp("user-1", `1.${mac}`)).toBeNull();
  });

  it("rejects a forged mac, garbage, and empty values", () => {
    expect(owner.verifyStamp("user-1", "1700000000000.forged")).toBeNull();
    expect(owner.verifyStamp("user-1", "not-a-token")).toBeNull();
    expect(owner.verifyStamp("user-1", "")).toBeNull();
    expect(owner.verifyStamp("user-1", null)).toBeNull();
  });
});

describe("isIdle", () => {
  it("treats a missing timestamp as idle", () => {
    expect(owner.isIdle(null)).toBe(true);
  });

  it("is active within the window and idle past it", () => {
    const now = 10_000_000_000_000;
    expect(owner.isIdle(now - owner.IDLE_MS, now)).toBe(false);
    expect(owner.isIdle(now - owner.IDLE_MS - 1, now)).toBe(true);
  });
});

describe("assessStamp", () => {
  const now = 10_000_000_000_000;

  it("treats an absent cookie as a fresh session", () => {
    expect(owner.assessStamp("user-1", undefined, now)).toBe("fresh");
    expect(owner.assessStamp("user-1", null, now)).toBe("fresh");
    expect(owner.assessStamp("user-1", "", now)).toBe("fresh");
  });

  it("treats a valid, recent stamp as active", () => {
    const token = owner.signStamp("user-1", now - 60_000);
    expect(owner.assessStamp("user-1", token, now)).toBe("active");
  });

  it("treats a valid but stale stamp as idle", () => {
    const token = owner.signStamp("user-1", now - owner.IDLE_MS - 1);
    expect(owner.assessStamp("user-1", token, now)).toBe("idle");
  });

  it("treats a tampered or wrong-user stamp as forged", () => {
    expect(owner.assessStamp("user-1", "1700000000000.forged", now)).toBe("forged");
    expect(
      owner.assessStamp("user-2", owner.signStamp("user-1", now), now),
    ).toBe("forged");
  });
});
