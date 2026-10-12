/**
 * AI purchase agent CLI (Phase 5).
 *
 * A one-command demo of the core trust story:
 *
 *   1. You describe a purchase in plain English.
 *   2. The AI agent interprets it and calls ONLY `propose_purchase`.
 *   3. The independent, deterministic authorization engine returns
 *      ALLOW / ASK / DENY.
 *   4. The request is recorded (durably, if `DATABASE_URL` is set).
 *
 * The agent never pays. This command has no path to execution at all: payment
 * happens through the authorization-gated execution layer, never the model.
 *
 * SPEED / SETUP:
 *   - Set AGENT_API_KEY and AGENT_MODEL in `.env` (never paste the key).
 *   - Run `npm run agent:models` to discover a model name.
 *   - Run `npm run agent -- "buy a $49 license from Acme"` or just `npm run agent`.
 *
 * If no spending rules exist yet, a clearly-labelled demo rule set is saved so
 * the demo runs. It is safe (a hard $200/month cap) and easy to replace.
 *
 * SECRETS: reads `.env` locally; never prints the key. Error text is redacted.
 */

import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import process from "node:process";

import {
  AgentConfigError,
  createAgentModel,
  createPurchaseAgent,
  describeRules,
  ProposalService,
  readAgentConfig,
} from "../src/agent";
import {
  InMemorySpendingRulesStore,
  type SpendingRules,
  type SpendingRulesStore,
} from "../src/core/authorization";
import { InMemoryPurchaseStore, type PurchaseStore } from "../src/core/purchases";
import { InMemorySpendingStore, type SpendingStore } from "../src/core/spending";
import {
  createDatabase,
  DrizzlePurchaseStore,
  DrizzleSpendingRulesStore,
  DrizzleSpendingStore,
} from "../src/infra/persistence";
import { resolveOwnerUserId } from "./owner-id";

/**
 * A deliberately conservative demo rule set. It is saved only when the database
 * has no active rules, so a real configuration is never overwritten.
 */
const DEMO_RULES: SpendingRules = {
  ruleVersion: "demo-1",
  currency: "USD",
  perPurchaseAutoLimitMinor: 5000, // $50.00 or less is automatic
  monthlyCapMinor: 20000, // $200.00 hard monthly ceiling
  permittedCategories: ["software", "office_supplies", "books", "hardware"],
  requireApprovalForNewPayee: true,
};

function loadLocalEnv(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

interface WiredStores {
  rules: SpendingRulesStore;
  purchases: PurchaseStore;
  spending: SpendingStore;
  durable: boolean;
  close: () => Promise<void>;
}

/** Use the durable database when configured, otherwise in-memory. */
async function wireStores(): Promise<WiredStores> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return {
      rules: new InMemorySpendingRulesStore(null),
      purchases: new InMemoryPurchaseStore(),
      spending: new InMemorySpendingStore(),
      durable: false,
      close: async () => {},
    };
  }

  const { db, sql } = createDatabase(url);
  const ownerId = await resolveOwnerUserId(db);
  return {
    rules: new DrizzleSpendingRulesStore(db, ownerId),
    purchases: new DrizzlePurchaseStore(db, ownerId),
    spending: new DrizzleSpendingStore(db, ownerId),
    durable: true,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Strip anything that could resemble a credential from an error message. */
function redact(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, "$1***");
}

function line(): void {
  console.log("-".repeat(64));
}

async function main(): Promise<void> {
  loadLocalEnv();

  const config = readAgentConfig();
  const stores = await wireStores();

  try {
    let rules = await stores.rules.getActive();
    if (!rules) {
      await stores.rules.save(DEMO_RULES);
      rules = DEMO_RULES;
      console.log(
        "No spending rules were configured; saved a clearly-labelled demo rule set (demo-1).",
      );
    }

    const proposals = new ProposalService({
      rules: stores.rules,
      purchases: stores.purchases,
      spending: stores.spending,
      agentId: config.agentId,
    });
    const agent = createPurchaseAgent({
      model: createAgentModel(config),
      proposals,
      rules,
    });

    line();
    console.log("AI PURCHASE AGENT - PROPOSAL ONLY");
    line();
    console.log(`model:    ${config.model}`);
    console.log(`endpoint: ${config.baseUrl}`);
    console.log(`agent id: ${config.agentId}`);
    console.log(
      `storage:  ${stores.durable ? "durable (PostgreSQL)" : "in-memory (set DATABASE_URL for durable)"}`,
    );
    console.log();
    console.log("Spending rules:");
    console.log(describeRules(rules));
    line();

    let prompt = process.argv.slice(2).join(" ").trim();
    if (!prompt) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      prompt = (await rl.question("\nDescribe the purchase you want to propose:\n> ")).trim();
      rl.close();
    }
    if (!prompt) {
      console.log("No request given; nothing to do.");
      return;
    }

    console.log(`\nYou: ${prompt}\n`);
    const result = await agent.run(prompt);

    for (const call of result.toolCalls) {
      console.log(`[tool call] ${call.name} ${JSON.stringify(call.input)}`);
    }
    for (const toolResult of result.toolResults) {
      console.log(`[engine]    ${JSON.stringify(toolResult.output)}`);
    }

    console.log();
    line();
    console.log("Agent:");
    console.log(result.text || "(no text returned)");
    line();
    console.log("Note: the agent proposed only. Any payment is executed separately by");
    console.log("the authorization-gated execution layer - never by the model.");
  } finally {
    await stores.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AgentConfigError) {
    console.error(`\nConfiguration needed: ${error.message}`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nAgent run failed: ${redact(message)}`);
    console.error("(No credentials are shown.)");
  }
  process.exitCode = 1;
});
