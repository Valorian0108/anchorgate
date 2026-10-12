/**
 * The (auth) Server Actions: the one place mails are dispatched and sessions
 * are created, so the honest-failure contract must hold BEFORE any network
 * call. These tests mock the Supabase client and the sandbox-card helper and
 * prove:
 *   - a magic link is never mailed to a non-owner address;
 *   - password sign-in refuses bad input without calling the provider, turns
 *     provider failures into plain sentences, and redirects on success;
 *   - sign-up validates the pair of passwords, translates provider errors,
 *     redirects when a session comes straight back, and says "check your
 *     inbox" when the project requires email confirmation.
 */

import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const ensureSandboxCard = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { signInWithOtp, signInWithPassword, signUp },
  }),
}));

vi.mock("@/lib/service", () => ({
  ensureSandboxCard: (...args: unknown[]) => ensureSandboxCard(...args),
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
  signInWithPassword.mockReset();
  signUp.mockReset();
  ensureSandboxCard.mockReset();
  ensureSandboxCard.mockResolvedValue(undefined);
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("sendMagicLink", () => {
  it("rejects a malformed address without calling the provider", async () => {
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form({ email: "nope" }),
    );
    expect(result.status).toBe("error");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("refuses a non-owner address without calling the provider", async () => {
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form({ email: "someone@example.com" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/demo owner only/);
      expect(result.message).toMatch(/password/);
    }
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends a link to the owner, case-insensitively, with the callback origin", async () => {
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form({ email: "Owner@Example.com" }),
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
      form({ email: "owner@example.com" }),
    );
    expect(result).toEqual({ status: "error", message: "some other failure" });
  });

  it("explains the built-in 2-per-hour email cap instead of a raw 429", async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: "email rate limit exceeded" },
    });
    const result = await actions.sendMagicLink(
      { status: "idle" },
      form({ email: "owner@example.com" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/2 sign-in emails per hour/);
    }
  });
});

describe("signInWithPassword", () => {
  it("refuses a malformed address or empty password without calling the provider", async () => {
    const badEmail = await actions.signInWithPassword(
      { status: "idle" },
      form({ email: "nope", password: "hunter2hunter2" }),
    );
    expect(badEmail.status).toBe("error");

    const noPassword = await actions.signInWithPassword(
      { status: "idle" },
      form({ email: "someone@example.com", password: "" }),
    );
    expect(noPassword.status).toBe("error");

    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("turns wrong credentials into one plain sentence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });
    const result = await actions.signInWithPassword(
      { status: "idle" },
      form({ email: "someone@example.com", password: "wrongwrong" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBe(
        "That email and password do not match. Try again, or create your gate.",
      );
    }
  });

  it("signs in, ensures the sandbox card, and enters the app", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    await expect(
      actions.signInWithPassword(
        { status: "idle" },
        form({ email: "Someone@Example.com", password: "hunter2hunter2" }),
      ),
    ).rejects.toThrow("REDIRECT:/");
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "someone@example.com",
      password: "hunter2hunter2",
    });
    expect(ensureSandboxCard).toHaveBeenCalledWith("user-1");
  });

  it("still signs in when the sandbox card cannot be enrolled", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    ensureSandboxCard.mockRejectedValue(new Error("paypal is down"));
    await expect(
      actions.signInWithPassword(
        { status: "idle" },
        form({ email: "someone@example.com", password: "hunter2hunter2" }),
      ),
    ).rejects.toThrow("REDIRECT:/");
  });
});

describe("signUp", () => {
  it("validates the address, the password length, and the match, all before the provider", async () => {
    const badEmail = await actions.signUp(
      { status: "idle" },
      form({ email: "nope", password: "hunter2hunter2", confirm: "hunter2hunter2" }),
    );
    expect(badEmail.status).toBe("error");

    const shortPassword = await actions.signUp(
      { status: "idle" },
      form({ email: "new@example.com", password: "short", confirm: "short" }),
    );
    expect(shortPassword.status).toBe("error");
    if (shortPassword.status === "error") {
      expect(shortPassword.message).toMatch(/at least 8 characters/);
    }

    const mismatch = await actions.signUp(
      { status: "idle" },
      form({ email: "new@example.com", password: "hunter2hunter2", confirm: "hunter3hunter3" }),
    );
    expect(mismatch.status).toBe("error");
    if (mismatch.status === "error") {
      expect(mismatch.message).toBe("The two passwords do not match.");
    }

    expect(signUp).not.toHaveBeenCalled();
  });

  it("translates an already-registered address into a road to sign-in", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    const result = await actions.signUp(
      { status: "idle" },
      form({ email: "new@example.com", password: "hunter2hunter2", confirm: "hunter2hunter2" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBe("That email already has a gate. Try signing in.");
    }
  });

  it("enters the app straight away when no email confirmation is required", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-2" }, session: { user: { id: "user-2" } } },
      error: null,
    });
    await expect(
      actions.signUp(
        { status: "idle" },
        form({ email: "new@example.com", password: "hunter2hunter2", confirm: "hunter2hunter2" }),
      ),
    ).rejects.toThrow("REDIRECT:/");
    expect(signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "hunter2hunter2",
      options: { emailRedirectTo: "http://localhost:3000/auth/confirm" },
    });
    expect(ensureSandboxCard).toHaveBeenCalledWith("user-2");
  });

  it("says check your inbox when the project requires email confirmation", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-3" }, session: null },
      error: null,
    });
    const result = await actions.signUp(
      { status: "idle" },
      form({ email: "new@example.com", password: "hunter2hunter2", confirm: "hunter2hunter2" }),
    );
    expect(result).toEqual({ status: "check-email" });
    expect(ensureSandboxCard).not.toHaveBeenCalled();
  });
});
