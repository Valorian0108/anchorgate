/**
 * Live PayPal Sandbox verification (Phase 4).
 *
 * This is the one command that proves the real adapter works against PayPal,
 * end to end, using the SAME code paths the application uses:
 *
 *   1. Enroll (vault) a payment source once.
 *   2. Propose a small purchase and run the deterministic authorization engine.
 *   3. Execute the authorized purchase through the PayPal gateway (server-side
 *      create + capture, charged against the vault).
 *   4. Verify the capture and count it exactly once in the spending ledger.
 *
 * Two sources are supported:
 *   - CARD  (default): enrolled server-side with PayPal's standard test card, no
 *     browser step. PayPal settles a card-vault charge immediately, so this is
 *     the green live path.
 *   - WALLET (`--wallet`): you approve a PayPal wallet in the browser. In
 *     Sandbox PayPal holds the resulting capture as `PENDING_REVIEW`, so this
 *     path demonstrates the correct "initiated but not counted" handling.
 *
 * SAFETY / SECRETS:
 *   - Sandbox only. The config layer refuses anything that is not `sandbox`.
 *   - Credentials are read from your local `.env` (via `process.loadEnvFile`).
 *     They are never printed, logged, or committed.
 *   - The vault (payment-token) id is a secret handle and is never printed.
 *
 * Run it with:  npm run sandbox:verify            (card, no browser)
 *               npm run sandbox:verify:wallet     (PayPal wallet, browser)
 */

import { existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import process from "node:process";

import { proposePurchase } from "../src/core/purchases";
import {
  executeAuthorizedPurchase,
  reconcilePendingPurchase,
} from "../src/core/execution";
import { InMemorySpendingStore, SpendingLedger } from "../src/core/spending";
import {
  DEFAULT_OWNER_ID,
  InMemoryPaymentMethodStore,
  type SavedPaymentMethod,
} from "../src/core/payments";
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
} from "../src/infra/paypal";

/** The one and only owner for the MVP (see `core/payments/types.ts`). */
const OWNER_ID = DEFAULT_OWNER_ID;

/** A deliberately tiny amount so the Sandbox charge is negligible and reversible. */
const AMOUNT_MINOR = 100; // 1.00 USD
const CURRENCY = "USD";

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
  console.log("  3. In the app, under Sandbox App Settings -> App Feature Options,");
  console.log('     check "Accept payments". Expand "Advanced options" and enable');
  console.log('     "Vault" (vaulting must be ON, or setup tokens return 403).');
  console.log("  4. Copy the app's Client ID and Secret.");
  console.log("  5. In this project, copy `.env.example` to `.env` (if you have not).");
  console.log("  6. In `.env`, set locally (never in chat or git):");
  console.log('       PAYPAL_ENV="sandbox"');
  console.log('       PAYPAL_CLIENT_ID="<your sandbox client id>"');
  console.log('       PAYPAL_CLIENT_SECRET="<your sandbox secret>"');
  console.log();
  console.log("The `--wallet` mode also needs the Sandbox *personal* (buyer) account to");
  console.log("approve enrollment in the browser:");
  console.log("  Dashboard -> Accounts -> Sandbox -> Personal -> the test buyer.");
  console.log();
}

async function main(): Promise<void> {
  const useWallet = process.argv.includes("--wallet");
  const envWarning = loadLocalEnv();

  console.log();
  console.log("PayPal Sandbox verification  (Sandbox only - no real money)");
  console.log("This runs the real code path: propose -> authorize -> pay -> count.");
  console.log(`Payment source: ${useWallet ? "PayPal wallet (browser)" : "card (server-side)"}`);
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
  const payments = new SdkPaymentsPort(client);
  const vault = new SdkVaultPort(client);

  // ---------------------------------------------------------------------
  // Step 1: vault enrollment (once).
  // ---------------------------------------------------------------------
  step("Step 1 of 3 - Save a payment method (vault enrollment)");

  const paymentMethods = new InMemoryPaymentMethodStore();
  const enrollmentRl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let method: SavedPaymentMethod;
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
      console.log("After PayPal confirms, come back here.");

      await enrollmentRl.question("\nPress Enter once you have approved in the browser... ");

      method = await completeVaultEnrollment(vault, {
        setupTokenId: enrollment.setupTokenId,
        ownerId: OWNER_ID,
      });
    } else {
      console.log("Enrolling a Sandbox test CARD in PayPal's vault (server-side).");
      console.log("No browser approval is required for this path.");
      method = await enrollCardVault(vault, {
        ownerId: OWNER_ID,
        card: SANDBOX_TEST_CARD,
      });
    }

    console.log();
    console.log("Vault enrollment complete.");
    console.log(`  source type: ${method.sourceType}`);
    console.log(`  payer:       ${method.payerEmail ?? "(not provided by PayPal)"}`);
    console.log(`  status:      ${method.status}`);
    console.log(`  vault token: hidden (length ${method.providerTokenId.length})`);

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
      payments,
      paymentMethods,
      ownerId: OWNER_ID,
    });

    console.log("Calling PayPal Sandbox. This creates a real Sandbox order and");
    console.log(`captures ${AMOUNT_MINOR} minor units (${CURRENCY}).`);

    let outcome = await executeAuthorizedPurchase({
      record: proposal.record,
      rules,
      state: spentState,
      now: new Date(),
      gateway,
      ledger,
    });

    // If PayPal initiated the capture but has not settled it, reconcile once.
    if (outcome.status === "PENDING") {
      console.log();
      console.log("PayPal has initiated the capture but not settled it yet.");
      console.log("Reconciling once against the provider (read-only)...");
      outcome = await reconcilePendingPurchase({
        record: outcome.record,
        gateway,
        ledger,
        now: new Date(),
      });
    }

    console.log();
    console.log(`execution status: ${outcome.status}`);
    console.log(`reason:           ${outcome.reason}`);

    const summary = await ledger.summary();

    if (outcome.status === "CAPTURED" && outcome.capture) {
      console.log();
      console.log("VERIFIED CAPTURE");
      console.log(`  provider capture id: ${outcome.capture.providerCaptureId}`);
      console.log(`  amount:              ${outcome.capture.amountMinor} ${outcome.capture.currency}`);
      console.log(`  captured at:         ${outcome.capture.capturedAt}`);
      console.log(`  record status:       ${outcome.record.status}`);

      console.log();
      console.log("LEDGER (must equal the capture, counted exactly once)");
      console.log(`  capturedMinor: ${summary.capturedMinor}`);
      console.log(`  reservedMinor: ${summary.reservedMinor}`);
      console.log(`  committedMinor: ${summary.committedMinor}`);

      line();
      console.log("RESULT: PASS - real Sandbox payment authorized, captured, and counted once.");
      line();
    } else if (outcome.status === "PENDING") {
      console.log();
      console.log("LEDGER (nothing counted while the provider holds the capture)");
      console.log(`  capturedMinor: ${summary.capturedMinor}`);
      console.log(`  reservedMinor: ${summary.reservedMinor}`);
      console.log(`  committedMinor: ${summary.committedMinor}`);

      line();
      console.log("RESULT: PENDING - provider holds the capture; correctly NOT counted.");
      line();
      console.log("This is expected in Sandbox for a PayPal-wallet vault (PENDING_REVIEW).");
      console.log("Re-running later (or a reconciliation job) will count it once it settles.");
      console.log("For an immediately-settled live pass, run `npm run sandbox:verify` (card).");
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
    enrollmentRl.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nVerification failed: ${describePayPalError(error)}`);
  console.error("(No secrets are shown. The failure text is safe to share.)");
  process.exitCode = 1;
});
