/**
 * Vault a payment method for the live demo (`npm run vault:card`).
 *
 * Why this exists: the app pays through `DrizzlePaymentMethodStore`, but the
 * `sandbox:verify` script vaults into an IN-MEMORY store. So the durable
 * `saved_payment_methods` table needs one real enrollment before the app can
 * execute a capture.
 *
 * Behaviour:
 *   - default: report the saved payment methods (facts only) and stop.
 *   - `--enroll`: enroll PayPal's standard Sandbox test CARD server-side and
 *     persist it for the single owner.
 *
 * SAFETY / SECRETS:
 *   - Sandbox only (config layer refuses anything else).
 *   - The provider vault token is never printed, logged, or committed; only its
 *     length is shown so you can tell an enrollment happened.
 */

import { existsSync } from "node:fs";
import process from "node:process";

import { resolveOwnerUserId } from "./owner-id";
import {
  createDatabase,
  DrizzlePaymentMethodStore,
  schema,
} from "../src/infra/persistence";
import {
  createPayPalClient,
  enrollCardVault,
  readPayPalConfigFromEnv,
  SdkVaultPort,
} from "../src/infra/paypal";

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

function loadLocalEnv(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

/** Redact anything that looks like `//user:secret@` from an error message. */
function redact(message: string): string {
  return message.replace(/\/\/[^@\s]*@/g, "//***@");
}

async function main(): Promise<void> {
  const enroll = process.argv.includes("--enroll");
  loadLocalEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL is not set. Add it to `.env` (see `.env.example`).");
    process.exitCode = 1;
    return;
  }

  const { db, sql: client } = createDatabase(url);
  try {
    const ownerId = await resolveOwnerUserId(db);
    const rows = await db
      .select()
      .from(schema.savedPaymentMethods)
      .orderBy(schema.savedPaymentMethods.createdAt);

    console.log("Saved payment methods (vault token hidden):");
    if (rows.length === 0) {
      console.log("  (none)");
    }
    for (const row of rows) {
      console.log(
        `  id=${row.id.slice(0, 8)}… owner=${row.ownerId} provider=${row.provider} ` +
          `source=${row.sourceType} status=${row.status} created=${row.createdAt.toISOString()} ` +
          `payer=${row.payerEmail ?? "(none)"} tokenLength=${row.providerTokenId.length}`,
      );
    }

    const active = rows.find(
      (row) => row.ownerId === ownerId && row.status === "ACTIVE",
    );
    console.log();
    console.log(
      active
        ? `Active method for the owner account: ${active.sourceType} (${active.id.slice(0, 8)}…).`
        : `No ACTIVE method for the owner account — the app cannot pay until one is enrolled.`,
    );

    if (!enroll) {
      console.log();
      console.log("To vault the Sandbox test card into the database, re-run with --enroll:");
      console.log("  npm run vault:card -- --enroll");
      return;
    }

    console.log();
    console.log("Enrolling PayPal's Sandbox test CARD into the vault (server-side)...");
    const config = readPayPalConfigFromEnv(process.env);
    const paypal = createPayPalClient(config);
    const vault = new SdkVaultPort(paypal);

    const method = await enrollCardVault(vault, {
      ownerId,
      card: SANDBOX_TEST_CARD,
    });
    await new DrizzlePaymentMethodStore(db, ownerId).save(method);

    console.log("Vault enrollment complete and persisted.");
    console.log(
      `  owner=${method.ownerId} source=${method.sourceType} status=${method.status} ` +
        `tokenLength=${method.providerTokenId.length} (token not shown)`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Vault-card failed: ${redact(message)}`);
  console.error("(No credentials are shown.)");
  process.exitCode = 1;
});
