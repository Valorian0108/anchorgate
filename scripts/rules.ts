/**
 * Spending-rules admin CLI (Phase 5 tooling).
 *
 * The MVP keeps a single, global rule set, stored durably. This command lets you
 * read and replace it without touching code:
 *
 *   npm run rules:show
 *   npm run rules:set -- --currency=USD --per-purchase=50 --monthly-cap=100 \
 *       --categories=software,books --new-payee-approval=true
 *
 * Amounts are given in MAJOR units (e.g. dollars) and converted to the integer
 * minor units the core uses. Unknown/malformed values fail closed.
 *
 * SECRETS: reads `.env` locally; never prints the connection string or any key.
 */

import { existsSync } from "node:fs";
import process from "node:process";

import { describeRules } from "../src/agent";
import type { SpendingRules } from "../src/core/authorization";
import { fromPayPalAmount } from "../src/infra/paypal/money";
import { createDatabase, DrizzleSpendingRulesStore } from "../src/infra/persistence";
import { resolveOwnerUserId } from "./owner-id";

const DEFAULT_VERSION = "owner-1";

function loadLocalEnv(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

/** Parse `--key=value`, `--key value`, or a bare `--flag` (treated as true). */
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg || !arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[arg.slice(2)] = next;
        i += 1;
      } else {
        flags[arg.slice(2)] = "true";
      }
    }
  }
  return flags;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "off"].includes(normalized)) return false;
  throw new Error(`Expected a yes/no value, got ${JSON.stringify(value)}.`);
}

function required(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required option --${name}.`);
  }
  return value.trim();
}

/** Build validated rules from CLI flags. Fails closed on anything ambiguous. */
function rulesFromFlags(flags: Record<string, string>): SpendingRules {
  const currency = required(flags, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`--currency must be a 3-letter ISO 4217 code, got ${JSON.stringify(currency)}.`);
  }

  const perPurchaseMinor = fromPayPalAmount(required(flags, "per-purchase"), currency);
  const monthlyCapMinor = fromPayPalAmount(required(flags, "monthly-cap"), currency);
  if (perPurchaseMinor <= 0) throw new Error("--per-purchase must be greater than zero.");
  if (monthlyCapMinor <= 0) throw new Error("--monthly-cap must be greater than zero.");
  if (perPurchaseMinor > monthlyCapMinor) {
    throw new Error(
      `--per-purchase (${perPurchaseMinor} minor) cannot exceed --monthly-cap ` +
        `(${monthlyCapMinor} minor): the automatic limit would sit above the hard cap.`,
    );
  }

  const categories = required(flags, "categories")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  const permittedCategories = [...new Set(categories)];
  if (permittedCategories.length === 0) {
    throw new Error("--categories must list at least one category (comma-separated).");
  }

  return {
    ruleVersion: flags.version?.trim() || DEFAULT_VERSION,
    currency,
    perPurchaseAutoLimitMinor: perPurchaseMinor,
    monthlyCapMinor,
    permittedCategories,
    requireApprovalForNewPayee: parseBoolean(flags["new-payee-approval"], true),
  };
}

async function main(): Promise<void> {
  loadLocalEnv();

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Spending rules must be stored durably; " +
        "configure the database in `.env` first.",
    );
  }

  const command = process.argv[2] ?? "show";
  const flags = parseFlags(process.argv.slice(3));
  const { db, sql } = createDatabase(connectionString);
  const ownerId = await resolveOwnerUserId(db);
  const store = new DrizzleSpendingRulesStore(db, ownerId);

  try {
    if (command === "show") {
      const rules = await store.getActive();
      if (!rules) {
        console.log("No active spending rules are configured.");
        return;
      }
      console.log("Active spending rules:");
      console.log(describeRules(rules));
      return;
    }

    if (command === "set") {
      const rules = rulesFromFlags(flags);
      await store.save(rules);
      console.log("Saved active spending rules:");
      console.log(describeRules(rules));
      return;
    }

    throw new Error(`Unknown command ${JSON.stringify(command)}. Use "show" or "set".`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Rules command failed: ${message}`);
  console.error("(No credentials are shown.)");
  process.exitCode = 1;
});
