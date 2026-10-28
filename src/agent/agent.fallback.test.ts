/**
 * Fallback-provider tests (28 oct 2026).
 *
 * The primary provider can run out of credit; a second OpenAI-compatible
 * provider (Bitget gateway, Qwen) is configured via `AGENT_API_KEY_2` and
 * tried automatically when the primary run fails. These tests pin the
 * contract without ever calling a real model:
 *   - a fast primary failure hands the run to the fallback;
 *   - a primary success never touches the fallback;
 *   - a primary that ate the clock gets NO fallback attempt (the run can
 *     never outlive the platform's limit);
 *   - both failing still rejects into the action's honest error path;
 *   - the fallback config is env-gated and never leaks values.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LanguageModel } from "ai";

// Replace only generateText; everything else (isStepCount, types) stays real.
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from "ai";

import {
  InMemorySpendingRulesStore,
  type SpendingRules,
} from "../core/authorization";
import { InMemoryPurchaseStore } from "../core/purchases";
import { InMemorySpendingStore } from "../core/spending";
import { createPurchaseAgent, FALLBACK_MIN_BUDGET_MS } from "./agent";
import {
  AgentConfigError,
  DEFAULT_AGENT_FALLBACK_BASE_URL,
  readAgentConfig,
  readAgentFallback,
} from "./config";
import { ProposalService } from "./proposal";

const mockedGenerateText = vi.mocked(generateText);

const RULES: SpendingRules = {
  ruleVersion: "test-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 1000,
  monthlyCapMinor: 5000,
  permittedCategories: ["software"],
  requireApprovalForNewPayee: false,
  autoApproveEnabled: false,
};

/** Opaque stand-ins: with generateText mocked, the models are just identities. */
const PRIMARY = { provider: "primary", modelId: "primary" } as unknown as LanguageModel;
const FALLBACK = { provider: "fallback", modelId: "fallback" } as unknown as LanguageModel;

/** A generateText result shaped like the real one, minus the parts run() ignores. */
function ok(text: string) {
  return { text, steps: [] } as unknown as Awaited<ReturnType<typeof generateText>>;
}

function makeAgent(overrides: { fallbackModel?: LanguageModel; timeoutMs?: number } = {}) {
  const proposals = new ProposalService({
    rules: new InMemorySpendingRulesStore(RULES),
    purchases: new InMemoryPurchaseStore(),
    spending: new InMemorySpendingStore(),
    agentId: "test-agent",
  });
  return createPurchaseAgent({
    model: PRIMARY,
    proposals,
    rules: RULES,
    ...overrides,
  });
}

beforeEach(() => {
  mockedGenerateText.mockReset();
});

describe("the fallback chain (28 oct 2026)", () => {
  it("answers from the fallback when the primary fails fast", async () => {
    mockedGenerateText
      .mockRejectedValueOnce(new Error("insufficient credit"))
      .mockResolvedValueOnce(ok("backup answered"));
    const agent = makeAgent({ fallbackModel: FALLBACK, timeoutMs: FALLBACK_MIN_BUDGET_MS + 1000 });

    const result = await agent.run("a $10 ham sandwich");

    expect(result.text).toBe("backup answered");
    expect(mockedGenerateText).toHaveBeenCalledTimes(2);
    expect(mockedGenerateText.mock.calls[0]?.[0]?.model).toBe(PRIMARY);
    expect(mockedGenerateText.mock.calls[1]?.[0]?.model).toBe(FALLBACK);
  });

  it("never touches the fallback when the primary succeeds", async () => {
    mockedGenerateText.mockResolvedValueOnce(ok("primary answered"));
    const agent = makeAgent({ fallbackModel: FALLBACK });

    const result = await agent.run("a $10 ham sandwich");

    expect(result.text).toBe("primary answered");
    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    expect(mockedGenerateText.mock.calls[0]?.[0]?.model).toBe(PRIMARY);
  });

  it("reports the primary failure unchanged when no fallback is configured", async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error("insufficient credit"));
    const agent = makeAgent();

    await expect(agent.run("a $10 ham sandwich")).rejects.toThrow("insufficient credit");
    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
  });

  it("rejects when both providers fail, so the box still shows its honest sentence", async () => {
    mockedGenerateText
      .mockRejectedValueOnce(new Error("primary down"))
      .mockRejectedValueOnce(new Error("fallback down"));
    const agent = makeAgent({ fallbackModel: FALLBACK, timeoutMs: FALLBACK_MIN_BUDGET_MS + 1000 });

    await expect(agent.run("a $10 ham sandwich")).rejects.toThrow("fallback down");
    expect(mockedGenerateText).toHaveBeenCalledTimes(2);
  });

  it("makes NO fallback attempt when the primary ate the clock", async () => {
    // The primary hangs past the whole budget, then dies cancelled. Whatever
    // is left is below FALLBACK_MIN_BUDGET_MS, so the run must end right there
    // and never outlive the platform's limit.
    mockedGenerateText.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("cancelled by the run clock")), 90);
        }) as unknown as ReturnType<typeof generateText>,
    );
    const agent = makeAgent({ fallbackModel: FALLBACK, timeoutMs: 60 });

    await expect(agent.run("a $10 ham sandwich")).rejects.toThrow("cancelled by the run clock");
    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
  });

  it("hands the fallback a real slice of the clock, not crumbs", async () => {
    mockedGenerateText
      .mockRejectedValueOnce(new Error("primary down"))
      .mockResolvedValueOnce(ok("backup answered"));
    const agent = makeAgent({ fallbackModel: FALLBACK, timeoutMs: FALLBACK_MIN_BUDGET_MS + 1000 });

    await agent.run("a $10 ham sandwich");

    const firstSignal = mockedGenerateText.mock.calls[0]?.[0]?.abortSignal as AbortSignal | undefined;
    const secondSignal = mockedGenerateText.mock.calls[1]?.[0]?.abortSignal as AbortSignal | undefined;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
  });
});

describe("the fallback configuration (28 oct 2026)", () => {
  it("is absent when AGENT_API_KEY_2 is unset, so the app behaves exactly as before", () => {
    expect(readAgentFallback({ NODE_ENV: "test" })).toBeUndefined();
    const config = readAgentConfig({
      NODE_ENV: "test",
      AGENT_API_KEY: "placeholder-key",
      AGENT_MODEL: "some-model",
    });
    expect(config.fallback).toBeUndefined();
  });

  it("reads the second provider and defaults its base URL to the Bitget gateway", () => {
    const fallback = readAgentFallback({
      NODE_ENV: "test",
      AGENT_API_KEY_2: "backup-key",
      AGENT_MODEL_2: "qwen3.8-max",
    });
    expect(fallback).toEqual({
      baseUrl: DEFAULT_AGENT_FALLBACK_BASE_URL,
      apiKey: "backup-key",
      model: "qwen3.8-max",
    });
  });

  it("honours an explicit AGENT_BASE_URL_2 override", () => {
    const fallback = readAgentFallback({
      NODE_ENV: "test",
      AGENT_API_KEY_2: "backup-key",
      AGENT_MODEL_2: "some-backup-model",
      AGENT_BASE_URL_2: "https://example.test/v1",
    });
    expect(fallback?.baseUrl).toBe("https://example.test/v1");
  });

  it("fails fast when a fallback key is set without a fallback model, naming variables not values", () => {
    try {
      readAgentFallback({
        NODE_ENV: "test",
        AGENT_API_KEY_2: "super-secret-backup",
      });
      throw new Error("expected readAgentFallback to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentConfigError);
      const message = (error as Error).message;
      expect(message).toContain("AGENT_MODEL_2");
      expect(message).not.toContain("super-secret-backup");
    }
  });

  it("surfaces the fallback through the full config", () => {
    const config = readAgentConfig({
      NODE_ENV: "test",
      AGENT_API_KEY: "primary-key",
      AGENT_MODEL: "some-model",
      AGENT_API_KEY_2: "backup-key",
      AGENT_MODEL_2: "qwen3.8-max",
    });
    expect(config.fallback?.model).toBe("qwen3.8-max");
    expect(config.fallback?.apiKey).toBe("backup-key");
  });
});
