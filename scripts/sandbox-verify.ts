/**
 * Live PayPal Sandbox verification (Phase 4).
 *
 * This is the one command that proves the real adapter works against PayPal,
 * end to end, using the SAME code paths the application uses:
 *
 *   1. Enroll (vault) a payment method once, by opening a PayPal-hosted URL.
 *   2. Propose a small purchase and run the deterministic authorization engine.
 *   3. Execute the authorized purchase through the PayPal gateway (server-side
 *      create + capture, charged against the vault).
 *   4. Verify the capture and count it exactly once in the spending ledger.
 *
 * SAFETY / SECRETS:
 *   - Sandbox only. The config layer refuses anything that is not `sandbox`.
 *   - Credentials are read from your local `.env` (via `process.loadEnvFile`).
 *     They are never printed, logged, or committed.
 *   - The vault (payment-token) id is a secret handle and is never printed.
 *
 * Run it with:  npm run sandbox:verify
 */

import { existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import process from "node:process";

import { proposePurchase } from "../src/core/purchases";
import { executeAuthorizedPurchase } from "../src/core/execution";
import { InMemorySpendingStore, SpendingLedger } from "../src/core/spending";
import {
  DEFAULT_OWNER_ID,
  InMemoryPaymentMethodStore,
  type SavedPaymentMethod,
} from "../src/core/payments";
import {
  completeVaultEnrollment,
  createPayPalClient,
  PayPalPaymentGateway,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkVaultPort,
  startVaultEnrollment,
} from "../src/infra/paypal";

/** The one and only owner for the MVP (see `core/payments/types.ts`). */
const OWNER_ID = DEFAULT_OWNER_ID;

/** A deliberately tiny amount so the Sandbox charge is negligible and reversible. */
const AMOUNT_MINOR = 100; // 1.00 USD
const CURRENCY = "USD";

function line(): void {
  console.log("-".repeat(64));
}

function step(title: string): void {
  console.log();
  line();
  console.log(title);
  line();
}

/**
 * Load `.env`. Returns a human-readable warning, or `null` when it loaded fine.
 *
 * The common failure is a misfiled name (e.g. Windows Notepad saving `.env` as
 * `.env.txt`), which would otherwise look like "credentials not set" for no
 * apparent reason. We detect that and say so, without ever printing values.
 *
 * Never throws: the caller prints setup instructions if config is still missing.
 */
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
      (name) =>
        name.startsWith(".env") &&
        name !== ".env" &&
        !name.endsWith(".example"),
    );
  } catch {
    // Directory not readable; fall through to the generic guidance.
  }
  if (misnamed) {
    return `Found \`${misnamed}\` but not \`.env\`. Rename it to exactly \`.env\` (no \`.txt\`).`;
  }
  return null;
}

function printSetupInstructions(): void {
  console.log();
  console.log("PayPal Sandbox credentials are not set yet.");
  console.log();
  console.log("Do this once, then re-run `npm run sandbox:verify`:");
  console.log();
  console.log("  1. Open https://developer.paypal.com/dashboard/applications/sandbox");
  console.log("  2. Create (or open) a Sandbox app.");
  console.log("  3. Copy its Client ID and Secret.");
  console.log("  4. In this project, copy `.env.example` to `.env` (if you have not).");
  console.log("  5. In `.env`, set locally (never in chat or git):");
  console.log('       PAYPAL_ENV="sandbox"');
  console.log('       PAYPAL_CLIENT_ID="<your sandbox client id>"');
  console.log('       PAYPAL_CLIENT_SECRET="<your sandbox secret>"');
  console.log();
  console.log("You will also need the Sandbox *personal* (buyer) account to");
  console.log("approve the vault enrollment in the browser:");
  console.log("  Dashboard -> Accounts -> Sandbox -> Personal -> the test buyer.");
  console.log();
}

async function main(): Promise<void> {
  const envWarning = loadLocalEnv();

  console.log();
  console.log("PayPal Sandbox verification  (Sandbox only - no real money)");
  console.log("This runs the real code path: propose -> authorize -> pay -> count.");
  if (envWarning) {
    console.log(`\nNote: ${envWarning}`);
  }

  let config;
  try {
    config = readPayPalConfigFromEnv(process.env);
  } catch (error) {
    if (error instanceof Error) {
      console.log(`\n${error.message}`);
    }
    printSetupInstructions();
    process.exitCode = 1;
    return;
  }

  const client = createPayPalClient(config);
  const orders = new SdkOrdersPort(client);
  const vault = new SdkVaultPort(client);

  // ---------------------------------------------------------------------
  // Step 1: vault enrollment (once). The user approves in the browser.
  // ---------------------------------------------------------------------
  step("Step 1 of 3 - Save a payment method (vault enrollment)");

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
  console.log("After PayPal confirms, come back here.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question("\nPress Enter once you have approved in the browser... ");

    const method: SavedPaymentMethod = await completeVaultEnrollment(vault, {
      setupTokenId: enrollment.setupTokenId,
      ownerId: OWNER_ID,
    });

    console.log();
    console.log("Vault enrollment complete.");
    console.log(`  payer:  ${method.payerEmail ?? "(not provided by PayPal)"}`);
    console.log(`  status: ${method.status}`);
    console.log(`  vault token: hidden (length ${method.providerTokenId.length})`);

    const paymentMethods = new InMemoryPaymentMethodStore();
    await paymentMethods.save(method);

    // -------------------------------------------------------------------
    // Step 2: propose -> authorize (deterministic engine, no AI here).
    // -------------------------------------------------------------------
    step("Step 2 of 3 - Propose and authorize the purchase");

    const rules = {
      ruleVersion: "sandbox-verify-1",
      currency: CURRENCY,
      perPurchaseAutoLimitMinor: 500, // 5.00
      monthlyCapMinor: 5000, // 50.00
      permittedCategories: ["software"],
      requireApprovalForNewPayee: false,
    };

    const request = {
      id: `sandbox-verify-${Date.now()}`,
      agentId: "sandbox-verify-script",
      payee: "Sandbox self-charge (adapter verification)",
      purpose: "Sandbox verification of the authorizer-gated payment path",
      category: "software",
      amountMinor: AMOUNT_MINOR,
      currency: CURRENCY,
    };

    const spentState = { spentThisMonthMinor: 0, knownPayees: [] as string[] };

    const proposal = proposePurchase(request, rules, spentState, new Date());
    console.log(`decision:    ${proposal.decision.decision}`);
    console.log(`reasonCode:  ${proposal.decision.reasonCode}`);
    console.log(`reason:      ${proposal.decision.reason}`);

    if (!proposal.ok || !proposal.record) {
      console.log("\nThe request was not well-formed; stopping before payment.");
      process.exitCode = 1;
      return;
    }

    if (proposal.decision.decision !== "ALLOW") {
      console.log(
        "\nThe engine allowed the request to proceed. This verification only " +
          "auto-executes ALLOW decisions; stopping here.",
      );
      process.exitCode = 1;
      return;
    }

    // -------------------------------------------------------------------
    // Step 3: execute the authorized purchase (server-side create + capture).
    // -------------------------------------------------------------------
    step("Step 3 of 3 - Execute through PayPal (create + capture)");

    const ledger = new SpendingLedger(new InMemorySpendingStore());
    const gateway = new PayPalPaymentGateway({
      orders,
      paymentMethods,
      ownerId: OWNER_ID,
    });

    console.log("Calling PayPal Sandbox. This creates a real Sandbox order and");
    console.log(`captures ${AMOUNT_MINOR} minor units (${CURRENCY}).`);

    const outcome = await executeAuthorizedPurchase({
      record: proposal.record,
      rules,
      state: spentState,
      now: new Date(),
      gateway,
      ledger,
    });

    console.log();
    console.log(`execution status: ${outcome.status}`);
    console.log(`reason:           ${outcome.reason}`);

    if (outcome.status === "CAPTURED" && outcome.capture) {
      console.log();
      console.log("VERIFIED CAPTURE");
      console.log(`  provider capture id: ${outcome.capture.providerCaptureId}`);
      console.log(`  amount:              ${outcome.capture.amountMinor} ${outcome.capture.currency}`);
      console.log(`  captured at:         ${outcome.capture.capturedAt}`);
      console.log(`  record status:       ${outcome.record.status}`);

      const summary = await ledger.summary();
      console.log();
      console.log("LEDGER (must equal the capture, counted exactly once)");
      console.log(`  capturedMinor: ${summary.capturedMinor}`);
      console.log(`  reservedMinor: ${summary.reservedMinor}`);
      console.log(`  committedMinor: ${summary.committedMinor}`);

      line();
      console.log("RESULT: PASS - real Sandbox payment authorized, captured, and counted once.");
      line();
    } else {
      line();
      console.log(`RESULT: ${outcome.status} - no verified capture was counted.`);
      line();
      console.log("The authorization gate or PayPal stopped the payment. Nothing was");
      console.log("counted as spending. Share the status/reason above (it contains no");
      console.log("secrets) so we can adjust the adapter.");
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nVerification failed: ${message}`);
  console.error("(No secrets are shown. The failure text is safe to share.)");
  process.exitCode = 1;
});
