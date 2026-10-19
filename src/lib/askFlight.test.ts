/**
 * The ask-in-flight flag is the handshake between the ask box (which raises
 * it) and the suggestion feed's heartbeat (which stays quiet while it is up).
 * These tests pin the contract both ends rely on: it starts down, it follows
 * the last setter exactly, and repeated raises or lowers change nothing.
 */

import { afterEach, describe, expect, it } from "vitest";

import { isAskInFlight, setAskInFlight } from "./askFlight";

afterEach(() => {
  setAskInFlight(false);
});

describe("askFlight", () => {
  it("starts down: a fresh page never mutes the heartbeat", () => {
    expect(isAskInFlight()).toBe(false);
  });

  it("follows the ask: up on submit, down when the answer lands", () => {
    setAskInFlight(true);
    expect(isAskInFlight()).toBe(true);
    setAskInFlight(false);
    expect(isAskInFlight()).toBe(false);
  });

  it("ignores repeats: the last setter is the whole truth", () => {
    setAskInFlight(true);
    setAskInFlight(true);
    expect(isAskInFlight()).toBe(true);
    setAskInFlight(false);
    setAskInFlight(false);
    expect(isAskInFlight()).toBe(false);
  });
});
