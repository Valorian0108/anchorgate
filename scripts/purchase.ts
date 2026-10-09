/**
 * Purchase operations CLI (the end-to-end money flow).
 *
 * This is the human side of the trust story. The agent only ever PROPOSES; this
 * command lets the owner review, approve/reject, and pay through the SAME
 * deterministic, authorization-gated path the rest of the app uses:
 *
 *   npm run agent -- "buy a $40 software license from Acme"   (proposes)
 *   npm run purchase -- pending                              (reviews)
 *   npm run purchase -- approve <id>                         (approves)
 *   npm run purchase -- pay <id>                             (pays)
 *   npm run purchase -- budget                               (shows the budget)
 *
 * Every command uses the durable stores when `DATABASE_URL` is set, so a
 * request approved in one run is payable in the next, and a verified capture is
 * counted in the shared ledger exactly once.
 *
 * `approve` and `pay` both re-check the CURRENT rules and budget. A hard
 * constraint (the monthly cap) can never be overridden by an approval.
 *
 * Commands:
 *   budget                    Show the active rules and verified spend this month.
 *   pending                   List requests awaiting a human decision.
 *   list [--status=STATUS] [--limit=N]
 *   show <id>                 Full detail: evaluations + ledger events.
 *   approve <id> [--by=NAME] [--pay]
 *   reject  <id> [--by=NAME] [--reason="..."]
 *   pay <id>                  Re-check, submit to PayPal, count a verified capture.
 *   reconcile <id>            Re-read a capture the provider left pending.
 *   enroll [--wallet]         Vault a payment method (card by default).
 *   payments                  List saved payment methods (tokens hidden).
 *
 * SAFETY / SECRETS:
 *   - Sandbox only (the PayPal config layer refuses anything else).
 *   - Credentials are read from `.env`; they are never printed.
 *   - Vault tokens are never printed, only their presence/length.
 */

import { existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import process from "node:process";

import {
  InMemorySpendingRulesStore,
  type SpendingRulesStore,
} from "../src/core/authorization";
import {
  DEFAULT_OWNER_ID,
  InMemoryPaymentMethodStore,
  type PaymentMethodStore,
} from "../src/core/payments";
import {
  InMemoryPurchaseStore,
  type PurchaseStore,
  type RequestStatus,
} from "../src/core/purchases";
import { InMemorySpendingStore, type SpendingStore } from "../src/core/spending";
import type { PaymentGateway } from "../src/core/execution";
import {
  createDatabase,
  DrizzlePaymentMethodStore,
  DrizzlePurchaseStore,
  DrizzleSpendingRulesStore,
  DrizzleSpendingStore,
} from "../src/infra/persistence";
import {
  completeVaultEnrollment,
  createPayPalClient,
  describePayPalError,
  enrollCardVault,
  PayPalPaymentGateway,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkPaymentsPort,
  SdkVaultPort,
  startVaultEnrollment,
  toPayPalAmount,
} from "../src/infra/paypal";
import { PurchaseService } from "../src/services";

/** The one and only owner for the MVP (see `core/payments/types.ts`). */
const OWNER_ID = DEFAULT_OWNER_ID;

/** PayPal's standard Sandbox test card (Visa, always approves, no 3DS). */
const SANDBOX_TEST_CARD = {
  number: "4111111111111111",
  expiry: "2027-02",
  name: "Sandbox Tester",
  billingAddress: {
    addressLine1: "2211 N First Street",
    adminArea1: "CA",
    adminArea2: "San Jose",
    postalCode: "95131",
    countryCode: "US",
  },
};

function line(): void {
  console.log("-".repeat(64));
}

function money(amountMinor: number, currency: string): string {
  try {
    return `${toPayPalAmount(amountMinor, currency)} ${currency}`;
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

/** Load `.env`. Returns a human-readable warning, or `null` when it loaded fine. */
function loadLocalEnv(): string | null {
  if (existsSync(".env")) {
    try {
      process.loadEnvFile(".env");
      return null;
    } catch {
      return "Found `.env` but could not parse it. Check for stray quotes or characters.";
    }
  }

  let misnamed: string | undefined;
  try {
    misnamed = readdirSync(".").find(
      (name) => name.startsWith(".env") && name !== ".env" && !name.endsWith(".example"),
    );
  } catch {
    // Directory not readable; fall through.
  }
  if (misnamed) {
    return `Found \`${misnamed}\` but not \`.env\`. Rename it to exactly \`.env\` (no \`.txt\`).`;
  }
  return null;
}

interface WiredStores {
  purchases: PurchaseStore;
  spending: SpendingStore;
  rules: SpendingRulesStore;
  paymentMethods: PaymentMethodStore;
  durable: boolean;
  close: () => Promise<void>;
}

function wireStores(): WiredStores {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    // In-memory fallback so the CLI is usable without a database. Not durable:
    // records are lost on exit. The durable path is what satisfies the spec.
    return {
      purchases: new InMemoryPurchaseStore(),
      spending: new InMemorySpendingStore(),
      rules: new InMemorySpendingRulesStore(null),
      paymentMethods: new InMemoryPaymentMethodStore(),
      durable: false,
      close: async () => {},
    };
  }

  const { db, sql } = createDatabase(url);
  return {
    purchases: new DrizzlePurchaseStore(db),
    spending: new DrizzleSpendingStore(db),
    rules: new DrizzleSpendingRulesStore(db),
    paymentMethods: new DrizzlePaymentMethodStore(db),
    durable: true,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Build the live PayPal gateway from local credentials. */
function buildLiveGateway(paymentMethods: PaymentMethodStore): PaymentGateway {
  const config = readPayPalConfigFromEnv(process.env);
  const client = createPayPalClient(config);
  return new PayPalPaymentGateway({
    orders: new SdkOrdersPort(client),
    payments: new SdkPaymentsPort(client),
    paymentMethods,
    ownerId: OWNER_ID,
  });
}

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? "help";
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const eq = name.indexOf("=");
      if (eq >= 0) {
        flags[name.slice(0, eq)] = name.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        flags[name] = argv[++i]!;
      } else {
        flags[name] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { command, positionals, flags };
}

function flagString(flags: Record<string, string | true>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function approverFrom(flags: Record<string, string | true>): string {
  return flagString(flags, "by") ?? process.env.PURCHASE_APPROVER?.trim() ?? "owner";
}

function printHelp(): void {
  line();
  console.log("PURCHASE OPERATIONS - review, approve, and pay (Sandbox only)");
  line();
  console.log("  budget                         rules + verified spend this month");
  console.log("  pending                        requests awaiting your decision");
  console.log("  list [--status=S] [--limit=N]  recent requests");
  console.log("  show <id>                      full detail (evaluations + ledger)");
  console.log("  approve <id> [--by=NAME] [--pay]");
  console.log('  reject  <id> [--by=NAME] [--reason="..."]');
  console.log("  pay <id>                       pay through PayPal (re-checked)");
  console.log("  reconcile <id>                 re-read a capture left pending");
  console.log("  enroll [--wallet]              vault a payment method (card default)");
  console.log("  payments                       list saved methods (tokens hidden)");
  line();
  console.log("Example:");
  console.log('  npm run agent -- "buy a $40 software license from Acme"');
  console.log("  npm run purchase -- pending");
  console.log("  npm run purchase -- approve <id>");
  console.log("  npm run purchase -- pay <id>");
}

async function showRequest(service: PurchaseService, spending: WiredStores["spending"], id: string): Promise<void> {
  const record = await service.get(id);
  if (!record) {
    console.log(`No purchase request found with id ${id}.`);
    process.exitCode = 1;
    return;
  }

  line();
  console.log(`REQUEST ${record.id}`);
  line();
  console.log(`status:      ${record.status}`);
  console.log(`payee:       ${record.request.payee}`);
  console.log(`amount:      ${money(record.request.amountMinor, record.request.currency)}`);
  console.log(`category:    ${record.request.category}`);
  console.log(`purpose:     ${record.request.purpose}`);
  console.log(`agent:       ${record.request.agentId}`);
  console.log(`fingerprint: ${record.fingerprint}`);
  console.log(`created:     ${record.createdAt}`);
  if (record.approval) {
    console.log(`approved:    ${record.approval.approvedBy} at ${record.approval.approvedAt}`);
  }
  if (record.rejection) {
    console.log(
      `rejected:    ${record.rejection.rejectedBy} at ${record.rejection.rejectedAt}` +
        (record.rejection.reason ? ` (${record.rejection.reason})` : ""),
    );
  }

  line();
  console.log("EVALUATIONS (oldest first)");
  for (const evaluation of record.evaluations) {
    console.log(
      `  ${evaluation.context.padEnd(12)} ${evaluation.decision.decision.padEnd(5)} ` +
        `${evaluation.decision.reasonCode} - ${evaluation.decision.reason}`,
    );
  }

  const events = await spending.listByRequest(record.id);
  if (events.length > 0) {
    line();
    console.log("LEDGER EVENTS");
    for (const event of events) {
      const ref = event.providerRef ? ` ref=${event.providerRef}` : "";
      console.log(
        `  ${event.kind.padEnd(16)} ${money(event.amountMinor, event.currency).padEnd(14)} ` +
          `${event.occurredAt}${ref}`,
      );
    }
  }
}

async function runPay(service: PurchaseService, id: string): Promise<void> {
  line();
  console.log(`PAYING ${id}`);
  line();
  console.log("Re-running the deterministic gate, then submitting to PayPal...");

  const { outcome, reconciled } = await service.pay(id, { reconcilePending: true });

  console.log();
  console.log(`execution status: ${outcome.status}`);
  console.log(`reason:           ${outcome.reason}`);

  if (outcome.capture) {
    console.log();
    console.log("VERIFIED CAPTURE");
    console.log(`  provider capture id: ${outcome.capture.providerCaptureId}`);
    console.log(`  amount:              ${money(outcome.capture.amountMinor, outcome.capture.currency)}`);
    console.log(`  captured at:         ${outcome.capture.capturedAt}`);
  }
  if (reconciled) {
    console.log();
    console.log("(The provider had held the capture as pending; it was re-read once.)");
  }

  const budget = await service.budget();
  if (budget.currency) {
    console.log();
    console.log(`spent this month now: ${money(budget.spentThisMonthMinor, budget.currency)}`);
    if (budget.remainingMinor !== null) {
      console.log(`remaining this month: ${money(budget.remainingMinor, budget.currency)}`);
    }
  }

  if (outcome.status !== "CAPTURED" && outcome.status !== "PENDING") {
    process.exitCode = 1;
  }
}

async function enroll(stores: WiredStores, useWallet: boolean): Promise<void> {
  const config = readPayPalConfigFromEnv(process.env);
  const client = createPayPalClient(config);
  const vault = new SdkVaultPort(client);

  let method;
  if (useWallet) {
    const enrollment = await startVaultEnrollment(vault, {
      returnUrl: "https://example.com/paypal/return",
      cancelUrl: "https://example.com/paypal/cancel",
      merchantCustomerId: OWNER_ID,
    });
    console.log("Open this URL in your browser and approve saving the payment method:");
    console.log();
    console.log(`  ${enrollment.approveUrl}`);
    console.log();
    console.log("Sign in with your Sandbox *personal* (buyer) account, not a real account.");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await rl.question("\nPress Enter once you have approved in the browser... ");
    } finally {
      rl.close();
    }
    method = await completeVaultEnrollment(vault, {
      setupTokenId: enrollment.setupTokenId,
      ownerId: OWNER_ID,
    });
  } else {
    console.log("Enrolling a Sandbox test CARD in PayPal's vault (server-side, no browser).");
    method = await enrollCardVault(vault, {
      ownerId: OWNER_ID,
      card: SANDBOX_TEST_CARD,
    });
  }

  await stores.paymentMethods.save(method);

  line();
  console.log("PAYMENT METHOD SAVED");
  line();
  console.log(`  source type: ${method.sourceType}`);
  console.log(`  payer:       ${method.payerEmail ?? "(not provided by PayPal)"}`);
  console.log(`  status:      ${method.status}`);
  console.log(`  vault token: hidden (length ${method.providerTokenId.length})`);
}

async function main(): Promise<void> {
  const envWarning = loadLocalEnv();
  const { command, positionals, flags } = parseArgs(process.argv.slice(2));

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const stores = wireStores();
  const service = new PurchaseService({
    purchases: stores.purchases,
    spending: stores.spending,
    rules: stores.rules,
    paymentGateway: () => buildLiveGateway(stores.paymentMethods),
  });

  console.log(`storage: ${stores.durable ? "durable (PostgreSQL)" : "in-memory (set DATABASE_URL for durable)"}`);
  if (envWarning) {
    console.log(`note:    ${envWarning}`);
  }

  try {
    switch (command) {
      case "budget": {
        const budget = await service.budget();
        line();
        console.log("BUDGET");
        line();
        if (!budget.rules) {
          console.log("No spending rules are configured, so nothing can be authorized.");
          console.log("Set them with: npm run rules:set -- --file <path>  (or rule flags)");
          break;
        }
        const rules = budget.rules;
        console.log(`rules version:        ${rules.ruleVersion}`);
        console.log(`currency:             ${rules.currency}`);
        console.log(`per-purchase auto:    ${money(rules.perPurchaseAutoLimitMinor, rules.currency)}  (above this: ASK)`);
        console.log(`monthly cap:          ${money(rules.monthlyCapMinor, rules.currency)}  (hard limit)`);
        console.log(`categories:           ${rules.permittedCategories.join(", ")}`);
        console.log(`approve new payees:   ${rules.requireApprovalForNewPayee ? "yes" : "no"}`);
        line();
        console.log(`spent this month:     ${money(budget.spentThisMonthMinor, rules.currency)}`);
        console.log(`remaining this month: ${money(budget.remainingMinor ?? 0, rules.currency)}`);
        break;
      }

      case "pending": {
        const pending = await service.listPending();
        line();
        console.log(`PENDING APPROVALS (${pending.length})`);
        line();
        if (pending.length === 0) {
          console.log("Nothing is awaiting your decision.");
          break;
        }
        for (const record of pending) {
          const last = record.evaluations.at(-1);
          console.log(`${record.id}`);
          console.log(`   ${money(record.request.amountMinor, record.request.currency)} -> ${record.request.payee}`);
          console.log(`   ${record.request.category} | ${record.request.purpose}`);
          console.log(`   filed ${record.createdAt} | ${last?.decision.reasonCode ?? "?"}`);
        }
        break;
      }

      case "list": {
        const status = flagString(flags, "status") as RequestStatus | undefined;
        const limitRaw = flagString(flags, "limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        const records = (await service.list(status))
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        line();
        console.log(`REQUESTS${status ? ` (${status})` : ""} - showing ${Math.min(records.length, limit)} of ${records.length}`);
        line();
        if (records.length === 0) {
          console.log("No requests recorded yet.");
          break;
        }
        for (const record of records.slice(0, limit)) {
          console.log(
            `${record.status.padEnd(17)} ${money(record.request.amountMinor, record.request.currency).padEnd(12)} ` +
              `${record.request.payee}  (${record.id})`,
          );
        }
        break;
      }

      case "show": {
        const id = positionals[0];
        if (!id) {
          console.log("Usage: npm run purchase -- show <id>");
          process.exitCode = 1;
          break;
        }
        await showRequest(service, stores.spending, id);
        break;
      }

      case "approve": {
        const id = positionals[0];
        if (!id) {
          console.log("Usage: npm run purchase -- approve <id> [--by=NAME] [--pay]");
          process.exitCode = 1;
          break;
        }
        const approver = approverFrom(flags);
        const outcome = await service.approve(id, approver);
        console.log(outcome.reason);
        if (!outcome.ok) {
          process.exitCode = 1;
          break;
        }
        console.log(`Request ${id} is now ${outcome.record.status}.`);
        if (flags.pay === true) {
          await runPay(service, id);
        }
        break;
      }

      case "reject": {
        const id = positionals[0];
        if (!id) {
          console.log("Usage: npm run purchase -- reject <id> [--by=NAME] [--reason=...]");
          process.exitCode = 1;
          break;
        }
        const outcome = await service.reject(id, approverFrom(flags), flagString(flags, "reason"));
        console.log(outcome.reason);
        if (!outcome.ok) {
          process.exitCode = 1;
          break;
        }
        console.log(`Request ${id} is now ${outcome.record.status}.`);
        break;
      }

      case "pay": {
        const id = positionals[0];
        if (!id) {
          console.log("Usage: npm run purchase -- pay <id>");
          process.exitCode = 1;
          break;
        }
        await runPay(service, id);
        break;
      }

      case "reconcile": {
        const id = positionals[0];
        if (!id) {
          console.log("Usage: npm run purchase -- reconcile <id>");
          process.exitCode = 1;
          break;
        }
        const outcome = await service.reconcile(id);
        console.log(`status: ${outcome.status}`);
        console.log(`reason: ${outcome.reason}`);
        if (outcome.capture) {
          console.log(
            `captured: ${money(outcome.capture.amountMinor, outcome.capture.currency)} ` +
              `(${outcome.capture.providerCaptureId})`,
          );
        }
        const budget = await service.budget();
        if (budget.currency) {
          console.log(`spent this month now: ${money(budget.spentThisMonthMinor, budget.currency)}`);
        }
        if (outcome.status !== "CAPTURED" && outcome.status !== "PENDING") {
          process.exitCode = 1;
        }
        break;
      }

      case "enroll": {
        await enroll(stores, flags.wallet === true);
        break;
      }

      case "payments": {
        const methods = await stores.paymentMethods.list(OWNER_ID);
        line();
        console.log(`SAVED PAYMENT METHODS (${methods.length})`);
        line();
        if (methods.length === 0) {
          console.log("None enrolled. Run: npm run purchase -- enroll");
          break;
        }
        for (const method of methods) {
          console.log(
            `${method.sourceType.padEnd(7)} ${method.status.padEnd(7)} ` +
              `payer=${method.payerEmail ?? "-"}  enrolled=${method.createdAt}  ` +
              `token=hidden(${method.providerTokenId.length})`,
          );
        }
        break;
      }

      default:
        console.log(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
    }
  } finally {
    await stores.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nPurchase command failed: ${describePayPalError(error)}`);
  console.error("(No secrets are shown. The failure text is safe to share.)");
  process.exitCode = 1;
});
