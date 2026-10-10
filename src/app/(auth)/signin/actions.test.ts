/**
 * The sign-in action is the one place a mail is dispatched, so the owner-only
 * rule must hold BEFORE the network call. These tests mock the Supabase client
 * and prove a non-owner address never reaches `signInWithOtp`.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { signInWithOtp } }),
}));

let actions: typeof import("./actions");

beforeAll(async () => {
  vi.stubEnv("OWNER_EMAIL", "owner@example.com");
  vi.resetModules();
  actions = await import("./actions");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ error: null });
});

function form(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

describe("sendMagicLink", () => {
  it("rejects a malformed address without calling the provider", async () => {
    const result = await actions.sendMagicLink({ status: "idle" }, form("nope"));
    expect(result.status).toBe("error");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("refuses a non-owner address without calling the provider", async () => {
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form("someone@example.com"),
    );
    expect(result.status).toBe("error");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends a link to the owner, case-insensitively, with the callback origin", async () => {
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form("Owner@Example.com"),
    );
    expect(result).toEqual({ status: "sent" });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/confirm" },
    });
  });

  it("surfaces a provider error as an inline message", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "some other failure" } });
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form("owner@example.com"),
    );
    expect(result).toEqual({ status: "error", message: "some other failure" });
  });

  it("explains the built-in 2-per-hour email cap instead of a raw 429", async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: "email rate limit exceeded" },
    });
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form("owner@example.com"),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/2 sign-in emails per hour/);
    }
  });
});
